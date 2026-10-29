#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Импорт стихотворений со Стихи.ру в data/poems.js.

Использование:
    python3 scripts/import_stihi.py --all https://stihi.ru/avtor/yakovshakhov
        — импортировать все произведения автора, которых ещё нет на сайте;

    python3 scripts/import_stihi.py https://stihi.ru/2021/02/14/7021 ...
        — импортировать одно или несколько стихотворений по ссылкам.

После импорта замените data/poems.js в репозитории сайта и опубликуйте
изменения (см. instruction.txt).
"""
import html as htmllib
import json
import re
import subprocess
import sys
import time
from pathlib import Path

BASE = "https://stihi.ru"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36")
DATA_FILE = Path(__file__).resolve().parent.parent / "data" / "poems.js"

HASHTAG_RE = re.compile(r"#[\wА-Яа-яЁё]+\s*$")


def fetch(url):
    r = subprocess.run(["curl", "-sL", "--fail", "-A", UA, url],
                       capture_output=True, check=True)
    return r.stdout.decode("cp1251", errors="replace")


def clean(s):
    return htmllib.unescape(re.sub(r"\s+", " ", s)).strip()


def poem_id(url):
    return url.replace(BASE + "/", "").replace("/", "_")


def fetch_list(author_url):
    """Все произведения автора: url, название, рубрика, дата."""
    poems, seen = [], set()
    for s in (None, 50, 100, 150):
        html = fetch(author_url + (f"&s={s}" if s else ""))
        for m in re.finditer(
                r'<li><a href="(/\d{4}/\d{2}/\d{2}/\d+)" class="poemlink">(.*?)</a> '
                r'<small>- (.*?), (\d{2}\.\d{2}\.\d{4} \d{2}:\d{2})</small></li>', html):
            path, title, genre, date = m.groups()
            if path in seen:
                continue
            seen.add(path)
            poems.append({"url": BASE + path, "title": clean(title),
                          "genre": clean(genre), "date": date})
        time.sleep(0.5)
    return poems


def fetch_poem(url):
    html = fetch(url)
    m_t = re.search(r"<h1>(.*?)</h1>", html, re.S)
    m_body = re.search(r'<div class="text">\n?(.*?)</div>', html, re.S)
    if not m_body:
        raise RuntimeError("не найден текст стихотворения")
    title = clean(m_t.group(1)) if m_t else ""
    text = re.sub(r"<br\s*/?>", "\n", m_body.group(1))
    text = htmllib.unescape(re.sub(r"<[^>]+>", "", text)).strip()
    text = HASHTAG_RE.sub("", text).strip()
    # дата публикации из ссылки вида /ГГГГ/ММ/ДД/N
    parts = url.rstrip("/").split("/")
    date = f"{parts[3]}.{parts[2]}.{parts[1]}" if len(parts) >= 5 else ""
    # рубрика
    m_g = re.search(r'<small>- (.*?), \d{2}\.\d{2}\.\d{4}', html)
    genre = clean(m_g.group(1)) if m_g else "без рубрики"
    return {"id": poem_id(url), "title": title, "genre": genre,
            "date": date, "url": url, "text": text}


def load():
    if DATA_FILE.exists():
        raw = DATA_FILE.read_text(encoding="utf-8")
        m = re.match(r"\s*window\.POEMS\s*=\s*(.*);\s*$", raw, re.S)
        return json.loads(m.group(1)) if m else []
    return []


def date_key(d):
    m = re.match(r"(\d{2})\.(\d{2})\.(\d{4})", d or "")
    return m.group(3) + m.group(2) + m.group(1) if m else (d or "")


def save(poems):
    poems.sort(key=lambda p: date_key(p.get("date")), reverse=True)
    # ссылка на stihi.ru нужна только при импорте — в данные сайта не пишем
    for p in poems:
        p.pop("url", None)
    DATA_FILE.write_text(
        "window.POEMS = " +
        json.dumps(poems, ensure_ascii=False, indent=1) + ";\n",
        encoding="utf-8")


def main():
    args = sys.argv[1:]
    existing = load()
    known = {p["id"] for p in existing}
    added = 0

    if args and args[0] == "--all":
        if len(args) < 2:
            sys.exit("Укажите ссылку на страницу автора.")
        for meta in fetch_list(args[1]):
            if poem_id(meta["url"]) in known:
                continue
            try:
                p = fetch_poem(meta["url"])
                p.update(title=p["title"] or meta["title"],
                         genre=meta["genre"], date=meta["date"])
                existing.append(p)
                known.add(p["id"])
                added += 1
                print(f"+ {p['title']}")
                time.sleep(0.4)
            except Exception as e:
                print(f"! пропущено {meta['url']}: {e}")
    else:
        for url in args:
            if not url.startswith(BASE):
                sys.exit(f"Ожидалась ссылка на stihi.ru, получено: {url}")
            try:
                p = fetch_poem(url)
                if p["id"] in known:
                    print(f"= уже есть: {p['title']}")
                    continue
                existing.append(p)
                added += 1
                print(f"+ {p['title']}")
            except Exception as e:
                print(f"! пропущено {url}: {e}")

    save(existing)
    print(f"\nГотово. Добавлено {added}, всего произведений: {len(existing)}.")
    print(f"Обновлён файл {DATA_FILE}")


if __name__ == "__main__":
    main()
