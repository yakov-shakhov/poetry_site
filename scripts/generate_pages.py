#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""SEO-генератор статических страниц стихов.

Зачем: сайт — SPA с hash-роутингом (/#poem/ID), для поисковиков и
соцсетей весь сайт — одна страница. Скрипт создаёт по готовой HTML-
странице на каждый стих (poem/ID.html): текст вшит в HTML (виден ботам
и Telegram/VK без JS), свой title/description/OG, canonical на себя.
Для человека страница живёт как обычный SPA: подключены те же
data/*.js и app.js, хеш стиха подставляется до загрузки app.js.

Как: index.html используется как шаблон (все изменения head автоматически
попадают в генерацию). Трансформации:
  1. убирается noindex-мета (песочница; прод индексируется);
  2. относительные пути ассетов → абсолютные (страница лежит в /poem/);
  3. title/description/OG/canonical — под конкретный стих;
  4. в <main id="app"> вшивается статическая разметка страницы стиха —
     точная копия того, что рисует app.js renderPoem() (без «вспышки»
     при перерисовке);
  5. до загрузки app.js: без хеша — history.replaceState на #poem/ID.

Также генерируется sitemap.xml (robots.txt у песочницы и прода свои,
генератором не управляются).

Запуск:  python3 scripts/generate_pages.py
Перед коммитом: scripts/check_data.js (pre-push уже проверяет data-файлы).
"""

import json
import re
import shutil
import subprocess
import sys
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent.parent
SITE_URL = "https://yakovshakhov.ru"
POEM_DIR = ROOT / "poem"

# ── Данные: data/*.js исполняются node-ом (там JS-литералы с комментариями,
#    чистый JSON их не берёт) и выгружаются как JSON ──────────────────────


def load_data():
    files = ["author.js", "poems.js", "video.js", "audio.js"]
    js = "globalThis.window = {};\n"
    for name in files:
        src = (ROOT / "data" / name).read_text(encoding="utf-8")
        js += "require('vm').runInThisContext(%s, {filename: %s});\n" % (
            json.dumps(src), json.dumps(name))
    js += ("console.log(JSON.stringify({author: window.AUTHOR, "
           "poems: window.POEMS, videos: window.VIDEOS, audios: window.AUDIOS}));")
    # node -e не годится: data-файлы большие, argv переполнится.
    script = ROOT / "scripts" / ".dump_data.js"
    script.write_text(js, encoding="utf-8")
    try:
        out = subprocess.run(["node", str(script)], capture_output=True,
                             text=True, check=True, cwd=str(ROOT))
    finally:
        script.unlink(missing_ok=True)
    return json.loads(out.stdout)


def esc(s):
    """Точная копия esc() из app.js."""
    return (str(s if s is not None else "")
            .replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;").replace('"', "&quot;"))


def encodeURIComponent(s):
    return quote(str(s), safe="-_.!~*'()")


def date_key(d):
    """Точная копия dateKey() из app.js: 'dd.mm.yyyy …' → 'yyyymmdd'."""
    m = re.match(r"^(\d{2})\.(\d{2})\.(\d{4})", d or "")
    return (m.group(3) + m.group(2) + m.group(1)) if m else str(d or "")


def show_date(d):
    m = re.match(r"^(\d{2}\.\d{2}\.\d{4})", d or "")
    return m.group(1) if m else str(d or "")


def w3c_date(d):
    m = re.match(r"^(\d{2})\.(\d{2})\.(\d{4})", d or "")
    return "%s-%s-%s" % (m.group(3), m.group(2), m.group(1)) if m else None


def make_snippet(text, limit=160):
    """Первые строки стиха — для description/OG. Обрезка по слову + …."""
    lines = [ln.strip() for ln in (text or "").split("\n") if ln.strip()]
    s = " ".join(lines[:2])
    if len(s) <= limit:
        return s
    cut = s[:limit + 1]
    cut = cut[:cut.rfind(" ")] if " " in cut else cut[:limit]
    return cut.rstrip(" ,;:—-") + "…"


def prerender(p, sorted_list, author, audios, videos):
    """Статическая копия разметки renderPoem() из app.js — чтобы страница
    не «мигала» при загрузке SPA. app.js заменит её на идентичную."""
    idx = sorted_list.index(p)
    n = len(sorted_list)
    # Как normGenre(): пустое/None → «без рубрики». Ссылка рубрики —
    # как listHref("", normGenre(p.genre), 1): жанр-параметр есть всегда.
    genre = (p.get("genre") or "").strip() or "без рубрики"
    tag_href = "#poems?genre=" + encodeURIComponent(genre)

    poem_audio = [a for a in (audios or []) if a.get("poem") == p["id"]]
    poem_video = [v for v in (videos or []) if v.get("poem") == p["id"]]
    media_row = ""
    if poem_audio or poem_video:
        media_row = '<div class="pmedia-row">'
        if poem_audio:
            media_row += ('<a class="pmedia" href="#audio?play=' +
                          encodeURIComponent(p["id"]) +
                          '" title="Аудиозапись чтения">Аудио стиха →</a>')
        if poem_video:
            media_row += ('<a class="pmedia" href="#video/' + esc(poem_video[0]["id"]) +
                          '" title="Видеозапись чтения">Смотреть видео →</a>')
        media_row += "</div>"

    prev = sorted_list[idx - 1] if idx > 0 else None
    nxt = sorted_list[idx + 1] if idx < n - 1 else None

    def nav_link(x, arrow_left):
        label = esc(x["title"])
        href = "#poem/" + esc(x["id"])
        if arrow_left:
            return ('<a class="pn-full" href="%s">← %s</a>'
                    '<a class="pn-compact" href="%s" aria-label="Предыдущее стихотворение">‹</a>'
                    % (href, label, href))
        return ('<a class="pn-full" href="%s">%s →</a>'
                '<a class="pn-compact" href="%s" aria-label="Следующее стихотворение">›</a>'
                % (href, label, href))

    html = '<div class="wrap page-center">' \
        '<article class="poem">' \
        '<a class="tag" href="' + esc(tag_href) + '">' + esc(genre) + "</a>" \
        "<h1>" + esc(p["title"]) + "</h1>" \
        '<div class="meta"><span>' + esc(show_date(p.get("date"))) + "</span>" \
        '<span class="meta-pos">' + str(idx + 1) + " из " + str(n) + "</span></div>" \
        '<pre class="text">' + esc(p["text"]) + "</pre>" \
        '<div class="poem-sign">' + esc(author.get("name", "")) + "</div>" + \
        media_row + \
        '<div class="source-link">' \
        '<button class="poem-share" id="poemShareBtn" type="button" title="Поделиться" aria-label="Поделиться">' \
        '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98"/></svg>' \
        "</button>" \
        '<button class="poem-share" id="copyPoemBtn" type="button" title="Копировать текст" aria-label="Копировать текст">' \
        '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>' \
        "</button>" \
        '<button class="poem-share to-top" id="toTopBtn" type="button" title="Наверх" aria-label="Наверх">' \
        '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>' \
        "</button>" \
        "</div>" \
        "</article>" \
        '<nav class="poem-nav">' + \
        (nav_link(prev, True) if prev else "<span></span>") + \
        '<span class="poem-pos">' + str(idx + 1) + " из " + str(n) + "</span>" + \
        (nav_link(nxt, False) if nxt else "") + \
        "</nav>" \
        '<div class="poem-actions">' \
        '<a class="back-link" href="#poems">← ко всем стихам</a>' \
        '<button type="button" class="random-link" id="randomLink" title="Случайный стих (клавиша R)">' \
        '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8.2" cy="8.2" r="1.3" fill="currentColor" stroke="none"/><circle cx="15.8" cy="8.2" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="8.2" cy="15.8" r="1.3" fill="currentColor" stroke="none"/><circle cx="15.8" cy="15.8" r="1.3" fill="currentColor" stroke="none"/></svg>' \
        "Случайный стих" \
        "</button>" \
        "</div>" + \
        ('<button type="button" class="edge-nav edge-prev" aria-label="Предыдущее стихотворение">‹</button>'
         if prev else "") + \
        ('<button type="button" class="edge-nav edge-next" aria-label="Следующее стихотворение">›</button>'
         if nxt else "") + \
        "</div>"
    return html


def build_page(template, p, sorted_list, author, audios, videos):
    title = p["title"]
    desc = make_snippet(p["text"])
    url = SITE_URL + "/poem/" + p["id"] + ".html"
    page = template

    # 1. Песочница помечена noindex — генерация должна индексироваться.
    page = re.sub(r'\s*<meta name="robots"[^>]*>\n', "\n", page)

    # 2. Страница живёт в /poem/ — ассеты и data-скрипты ведём на уровень
    #    выше ОТНОСИТЕЛЬНО: работает и на yakovshakhov.ru, и в песочнице
    #    на github.io/poetry_site/ (корневые "/assets/..." там 404).
    page = page.replace('href="assets/', 'href="../assets/')
    page = page.replace('src="assets/', 'src="../assets/')
    page = page.replace('src="data/', 'src="../data/')

    # 3. Title/description/OG — под стих.
    page = page.replace("<title>Яков Шахов — стихи</title>",
                        "<title>" + esc(title) + " — Яков Шахов — стихи</title>")
    page = re.sub(r'(<meta name="description" content=")[^"]*(">)',
                  lambda m: m.group(1) + esc(desc) + m.group(2), page)
    page = re.sub(r'(<meta property="og:title" content=")[^"]*(">)',
                  lambda m: m.group(1) + esc(title) + m.group(2), page)
    page = re.sub(r'(<meta property="og:description" content=")[^"]*(">)',
                  lambda m: m.group(1) + esc(desc) + m.group(2), page)
    page = re.sub(r'(<meta name="twitter:title" content=")[^"]*(">)',
                  lambda m: m.group(1) + esc(title) + m.group(2), page)
    page = re.sub(r'(<meta name="twitter:description" content=")[^"]*(">)',
                  lambda m: m.group(1) + esc(desc) + m.group(2), page)
    # canonical + og:url вставляем после og:site_name (идемпотентно: старые
    # строки с canonical/og:url на всякий случай вычищаем).
    page = re.sub(r'\s*<link rel="canonical"[^>]*>', "", page)
    page = re.sub(r'\s*<meta property="og:url"[^>]*>', "", page)
    page = page.replace(
        '<meta property="og:site_name" content="Яков Шахов — стихи">',
        '<meta property="og:site_name" content="Яков Шахов — стихи">\n'
        '  <link rel="canonical" href="' + esc(url) + '">\n'
        '  <meta property="og:url" content="' + esc(url) + '">')

    # 4. Хеш стиха до загрузки app.js — иначе SPA покажет главную.
    #    (после шага 2 путь к data уже "../data/")
    page = page.replace(
        '<script src="../data/author.js"></script>',
        '<script>/* Страница стиха: без хеша открываем именно этот стих */\n'
        '    if (!location.hash) history.replaceState(null, "", "#poem/' +
        esc(p["id"]) + '");</script>\n'
        '  <script src="../data/author.js"></script>')

    # 5. Вшиваем статическую разметку страницы стиха (ботам и до JS).
    page = re.sub(
        r'<main id="app" tabindex="-1">\s*<noscript>[^<]*</noscript>\s*</main>',
        '<main id="app" tabindex="-1">\n    ' +
        prerender(p, sorted_list, author, audios, videos) + "\n  </main>",
        page)
    return page


def main():
    data = load_data()
    poems = data["poems"]
    author = data["author"]
    audios = data["audios"] or []
    videos = data["videos"] or []

    bad = [p["id"] for p in poems if not re.fullmatch(r"[A-Za-z0-9_-]+", p["id"])]
    if bad:
        print("Неожиданные id (страницы для них не созданы): %s" % ", ".join(bad))
        sys.exit(1)

    template = (ROOT / "index.html").read_text(encoding="utf-8")
    sorted_list = sorted(poems, key=lambda p: date_key(p.get("date")), reverse=True)

    POEM_DIR.mkdir(exist_ok=True)
    for p in sorted_list:
        out = POEM_DIR / (p["id"] + ".html")
        out.write_text(build_page(template, p, sorted_list, author, audios, videos),
                       encoding="utf-8", newline="\n")
    print("Создано страниц стихов: %d" % len(sorted_list))

    # Чистим страницы удалённых стихов.
    valid = {p["id"] + ".html" for p in poems}
    stale = [f for f in POEM_DIR.glob("*.html") if f.name not in valid]
    for f in stale:
        f.unlink()
        print("Удалена устаревшая страница: %s" % f.name)

    # sitemap.xml: главная + все страницы стихов.
    newest = max(poems, key=lambda p: date_key(p.get("date")))
    urls = [(SITE_URL + "/", w3c_date(newest.get("date")))]
    urls += [(SITE_URL + "/poem/" + p["id"] + ".html", w3c_date(p.get("date")))
             for p in sorted_list]
    sitemap = ['<?xml version="1.0" encoding="UTF-8"?>',
               '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for loc, lastmod in urls:
        entry = "  <url>\n    <loc>%s</loc>\n" % esc(loc)
        if lastmod:
            entry += "    <lastmod>%s</lastmod>\n" % lastmod
        entry += "  </url>"
        sitemap.append(entry)
    sitemap.append("</urlset>")
    (ROOT / "sitemap.xml").write_text("\n".join(sitemap) + "\n",
                                      encoding="utf-8", newline="\n")
    print("sitemap.xml: %d URL" % len(urls))

    # robots.txt НЕ генерируем: в песочнице свой — Disallow: / (защита
    # github.io-публикации от индексации), открытый (Allow + Sitemap)
    # лежит только в прод-репозитории. Синку в прод robots.txt не передавать!
    print("robots.txt не трогаем: песочница закрыта (Disallow: /), "
          "открытый лежит в прод-репозитории")


if __name__ == "__main__":
    main()
