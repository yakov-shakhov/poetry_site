/* Логика сайта: список стихов, поиск, просмотр, хеш-навигация. */
(function () {
  "use strict";

  var app = document.getElementById("app");
  var ADMIN_KEY = "poetry_admin_poems";
  var PAGE_SIZE = 12;
  /* Навигация по стихам (←/→, свайпы): prev/next открытого стихотворения,
     либо страница списка на главной. */
  var currentNav = null;
  var listNav = null;
  /* Последнее состояние списка — для ссылки «ко всем стихам»
     и восстановления прокрутки после возврата со страницы стиха. */
  var lastList = null;
  var savedListScroll = null;

  /* В админке стихи могут быть переопределены в localStorage. */
  function poems() {
    try {
      var stored = localStorage.getItem(ADMIN_KEY);
      if (stored) return JSON.parse(stored);
    } catch (e) { /* повреждённые данные — игнорируем */ }
    return window.POEMS;
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* Цель в Яндекс.Метрике (счётчик подключён в index.html). Если счётчик
     не загрузился (расширение-блокировщик и т. п.) — тихо ничего не делаем. */
  function trackGoal(name) {
    if (typeof window.ym === "function") {
      window.ym(113918019, "reachGoal", name);
    }
  }

  function dateKey(d) {
    var m = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(d || "");
    return m ? m[3] + m[2] + m[1] : String(d || "");
  }

  function byDateDesc(a, b) {
    return dateKey(b.date).localeCompare(dateKey(a.date));
  }

  function normGenre(g) {
    return (g || "без рубрики").trim() || "без рубрики";
  }

  /* Только дата публикации — время на карточке и странице стиха не нужно. */
  function showDate(d) {
    var m = /^(\d{2}\.\d{2}\.\d{4})/.exec(d || "");
    return m ? m[1] : String(d || "");
  }

  /* Нормализация для поиска: нижний регистр и ё → е (замена 1:1,
     индексы не сдвигаются — можно сопоставлять с исходной строкой). */
  function normText(s) {
    return String(s == null ? "" : s).toLowerCase().replace(/ё/g, "е");
  }

  /* Подсветка вхождений nq в строку: esc-безопасно, <mark> вокруг совпадений. */
  function highlightHtml(str, nq) {
    var ns = normText(str);
    var html = "", pos = 0, i;
    while ((i = ns.indexOf(nq, pos)) !== -1) {
      html += esc(str.slice(pos, i)) + "<mark>" + esc(str.slice(i, i + nq.length)) + "</mark>";
      pos = i + nq.length;
    }
    return html + esc(str.slice(pos));
  }

  /* Выдержка на карточке. При активном поиске — фрагмент текста
     вокруг первого совпадения, иначе первые строки. */
  function excerptHtml(text, nq) {
    var lines = String(text || "").split("\n").filter(function (l) { return l.trim(); });
    var joined = lines.join(" ");
    if (!nq) {
      var s = joined.slice(0, 130);
      if (s.length < joined.length) s = s.replace(/\s+\S*$/, "") + "…";
      return esc(s);
    }
    var idx = normText(joined).indexOf(nq);
    if (idx === -1) {
      s = joined.slice(0, 130);
      if (s.length < joined.length) s = s.replace(/\s+\S*$/, "") + "…";
      return esc(s);
    }
    var start = Math.max(0, idx - 55);
    if (start > 0) {
      var w = joined.lastIndexOf(" ", start);
      start = w === -1 ? 0 : w + 1;
    }
    var end = Math.min(joined.length, idx + nq.length + 80);
    if (end < joined.length) {
      var w2 = joined.indexOf(" ", end);
      end = w2 === -1 ? joined.length : w2;
    }
    var frag = joined.slice(start, end);
    return (start > 0 ? "… " : "") + highlightHtml(frag, nq) + (end < joined.length ? " …" : "");
  }

  /* Фильтр списка: рубрика + нормализованный поисковый запрос. */
  function filterPoems(all, genre, nq) {
    return all.filter(function (p) {
      if (genre && normGenre(p.genre) !== genre) return false;
      if (!nq) return true;
      return normText(p.title + " " + p.text).indexOf(nq) !== -1;
    });
  }

  /* Ссылка на список с сохранением параметров; page >= 2 добавляется явно. */
  function listHref(q, genre, page) {
    var parts = [];
    if (q) parts.push("q=" + encodeURIComponent(q));
    if (genre) parts.push("genre=" + encodeURIComponent(genre));
    if (page > 1) parts.push("page=" + page);
    return "#poems" + (parts.length ? "?" + parts.join("&") : "");
  }

  /* Чипсы рубрик: по популярности (убывание числа стихов), при равенстве —
     по алфавиту. На мобильных видны первые три, остальные открывает
     кнопка «Ещё N жанров» (класс expanded вешается на контейнер). */
  var CHIPS_VISIBLE = 4; /* вместе с «все» */
  /* «1 жанр / 2 жанра / 5 жанров» для кнопки «Ещё N …» */
  function plural(n, one, few, many) {
    var n10 = n % 10, n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return one;
    if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return few;
    return many;
  }
  function chipsHtml(q, genre, genres, counts) {
    var html = '<a href="' + listHref(q, "", 1) + '"' +
      (genre ? "" : ' class="active" aria-current="true"') + '>все</a>';
    var hidden = 0;
    genres.forEach(function (g, i) {
      var extra = i + 1 >= CHIPS_VISIBLE;
      if (extra) hidden++;
      var classes = [];
      if (g === genre) classes.push("active");
      if (extra) classes.push("extra");
      /* суффикс « лирика» прячется на мобильных у всех рубрик */
      var mSx = /^(.+) лирика$/.exec(g);
      var label = mSx
        ? esc(mSx[1]) + '<span class="sx">' + esc(" лирика") + '</span>'
        : esc(g);
      html += '<a href="' + listHref(q, g, 1) + '"' +
        (classes.length ? ' class="' + classes.join(" ") + '"' : '') +
        (g === genre ? ' aria-current="true"' : '') + '>' + label + '</a>';
    });
    if (hidden) {
      html += '<button type="button" class="chips-toggle" id="chipsToggle" data-hidden="' + hidden +
        '" aria-expanded="false">Ещё ' + hidden + ' ' +
        plural(hidden, "жанр", "жанра", "жанров") + '</button>';
    }
    return html;
  }

  /* Рубрики с количеством стихов: по убыванию популярности,
     при равенстве — по алфавиту. */
  function genreInfo(all) {
    var counts = {};
    var genres = [];
    all.forEach(function (p) {
      var g = normGenre(p.genre);
      if (!counts[g]) { counts[g] = 0; genres.push(g); }
      counts[g]++;
    });
    genres.sort(function (a, b) {
      var d = counts[b] - counts[a];
      return d !== 0 ? d : a.localeCompare(b, "ru");
    });
    return { genres: genres, counts: counts };
  }

  /* Внутренность блока результатов: чипсы, счётчик, карточки, пагинация.
     Используется при начальном рендере и при живом поиске;
     заодно обновляет listNav/lastList (стрелки, свайпы, «ко всем стихам»). */
  function resultsInner(qStr, genre, page, all) {
    var t = (qStr || "").trim();
    var filtered = filterPoems(all, genre, normText(t));
    var pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (page > pages) page = pages;
    var slice = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    listNav = { q: t, genre: genre, page: page, pages: pages };
    lastList = { q: t, genre: genre, page: page };
    var gi = genreInfo(all);
    return '<div class="chips' + (genre ? ' expanded' : '') + '">' +
        chipsHtml(t, genre, gi.genres, gi.counts) +
      '</div>' +
      '<p class="count' + ((t || genre) ? "" : " no-filter") + '">' +
        (t || genre
          ? "Найдено: " + filtered.length + " из " + all.length
          : "Всего произведений: " + all.length) +
      '</p>' +
      cardGrid(slice, t) +
      pagerHtml(filtered.length, page, pages, t, genre);
  }

  /* ── Главная: портрет + поток карточек ───────────────── */
  function renderHome(params) {
    var all = poems().slice().sort(byDateDesc);
    currentNav = null; // навигация стрелками/свайпами — только на странице стиха
    var q = (params.get("q") || "").trim();
    var genre = params.get("genre") || "";
    var page = Math.max(1, parseInt(params.get("page"), 10) || 1);

    var a = window.AUTHOR;
    /* Био: на десктопе — подробнее (2–3 строки), на мобильных — одна строка.
       Переключение теми же классами, что и подсказки hint-desktop/hint-mobile. */
    var bioLong = "Пишу стихи с 2010 года. В этом собрании — " + all.length +
      " стихотворений и переводов: короткие зарисовки, лирика и большие поэмы. " +
      "Листайте как книгу, выбирайте рубрику — или доверьтесь случаю и откройте случайное.";
    var html =
      '<aside>' +
        '<div class="portrait"><img src="' + esc(a.photo) + '" alt="' + esc(a.name) + '"></div>' +
        '<h1>' + esc(a.name) + '</h1>' +
        '<p class="role">' + esc(a.bio) + '</p>' +
        '<p class="bio">' +
          '<span class="hint-desktop">' + esc(bioLong) + '</span>' +
          '<span class="hint-mobile">' + esc(bioLine(all)) + '</span>' +
        '</p>' +
        '<div class="btns">' +
          '<button class="btn random" id="randomBtn" type="button" title="Случайный стих (клавиша R)" aria-label="Случайный стих">' +
            '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8.2" cy="8.2" r="1.3" fill="currentColor" stroke="none"/><circle cx="15.8" cy="8.2" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="8.2" cy="15.8" r="1.3" fill="currentColor" stroke="none"/><circle cx="15.8" cy="15.8" r="1.3" fill="currentColor" stroke="none"/></svg>' +
            'Случайный стих' +
          '</button>' +
          '<a class="btn ghost icon-btn" id="vkBtn" href="' + esc(a.links.vk) + '" target="_blank" rel="noopener" title="Паблик ВКонтакте" aria-label="Паблик ВКонтакте">' +
            '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M23.45 5.948c.166-.546 0-.948-.795-.948H20.03c-.668 0-.976.347-1.143.73c0 0-1.335 3.196-3.226 5.272c-.612.602-.89.793-1.224.793c-.167 0-.418-.191-.418-.738V5.948c0-.656-.184-.948-.74-.948H9.151c-.417 0-.668.304-.668.593c0 .621.946.765 1.043 2.513v3.798c0 .833-.153.984-.487.984c-.89 0-3.055-3.211-4.34-6.885C4.45 5.288 4.198 5 3.527 5H.9c-.75 0-.9.347-.9.73c0 .682.89 4.07 4.145 8.551C6.315 17.341 9.37 19 12.153 19c1.669 0 1.875-.368 1.875-1.003v-2.313c0-.737.158-.884.687-.884c.39 0 1.057.192 2.615 1.667C19.11 18.216 19.403 19 20.405 19h2.625c.75 0 1.126-.368.91-1.096c-.238-.724-1.088-1.775-2.215-3.022c-.612-.71-1.53-1.475-1.809-1.858c-.389-.491-.278-.71 0-1.147c0 0 3.2-4.426 3.533-5.929"/></svg>' +
          '</a>' +
          '<a class="btn ghost icon-btn" id="tgBtn" href="' + esc(a.links.telegram) + '" target="_blank" rel="noopener" title="Написать автору в Telegram" aria-label="Написать автору в Telegram">' +
            '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M9.04 15.51l-.38 5.32c.54 0 .78-.23 1.06-.51l2.55-2.44 5.28 3.87c.97.53 1.66.25 1.92-.9L23.9 3.8c.31-1.43-.52-1.99-1.46-1.64L1.7 10.36c-1.39.54-1.37 1.32-.24 1.67l5.03 1.57L18.8 6.9c.55-.36 1.05-.16.64.2L9.04 15.51z"/></svg>' +
          '</a>' +
          '<a class="btn ghost icon-btn" id="emailBtn" href="mailto:' + esc(a.links.email) + '" title="Написать автору письмо" aria-label="Написать автору письмо">' +
            '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 6l-10 7L2 6"/></svg>' +
          '</a>' +
        '</div>' +
      '</aside>' +
      '<main>' +
        '<form id="searchForm">' +
          (genre ? '<input type="hidden" name="genre" value="' + esc(genre) + '">' : '') +
          '<input class="search" type="search" name="q" aria-label="Поиск по стихотворениям" placeholder="Поиск по ' + all.length + ' стихотворениям…" value="' + esc(q) + '">' +
        '</form>' +
        '<div id="results">' + resultsInner(q, genre, page, all) + '</div>' +
      '</main>';

    app.innerHTML = '<div class="wrap layout">' + html + '</div>';

    /* Живой поиск: перерисовывается только блок результатов (фокус в поле
       сохраняется), URL обновляется через replaceState — без записей в истории. */
    var searchForm = document.getElementById("searchForm");
    var searchInput = searchForm.querySelector(".search");
    var liveTimer = null;
    function applyLive(value) {
      var results = document.getElementById("results");
      if (!results) return;
      results.innerHTML = resultsInner(value, genre, 1, all);
      bindChipsToggle();
      var target = listHref((value || "").trim(), genre, 1);
      if (location.hash !== target) history.replaceState(null, "", target);
    }
    searchInput.addEventListener("input", function () {
      clearTimeout(liveTimer);
      var value = this.value;
      liveTimer = setTimeout(function () { applyLive(value); }, 250);
    });
    searchForm.addEventListener("submit", function (e) {
      e.preventDefault();
      clearTimeout(liveTimer);
      applyLive(searchInput.value);
      window.scrollTo(0, 0);
    });
    /* «ещё N рубрик…» — показать/скрыть остальные чипсы (только мобильные).
       Кнопка пересоздаётся при каждой перерисовке результатов — через хелпер. */
    function bindChipsToggle() {
      var chipsToggle = document.getElementById("chipsToggle");
      if (chipsToggle) {
        chipsToggle.addEventListener("click", function () {
          var chips = document.querySelector(".chips");
          var expanded = chips.classList.toggle("expanded");
          this.setAttribute("aria-expanded", expanded ? "true" : "false");
          var n = Number(this.getAttribute("data-hidden"));
          this.textContent = expanded ? "Свернуть" : "Ещё " + n + " " + plural(n, "жанр", "жанра", "жанров");
        });
      }
    }
    bindChipsToggle();
    var randomBtn = document.getElementById("randomBtn");
    if (randomBtn) randomBtn.addEventListener("click", gotoRandomPoem);
    /* mailto молчит, если почтовая программа не настроена — дублируем адрес в буфер обмена. */
    var emailBtn = document.getElementById("emailBtn");
    if (emailBtn) {
      emailBtn.addEventListener("click", function () {
        copyText(a.links.email, "Адрес скопирован: " + a.links.email);
      });
    }
    /* Сначала пробуем установленное приложение через tg://, при неудаче
       отдаём веб-версию t.me (веб-страница t.me может не открываться). */
    var tgBtn = document.getElementById("tgBtn");
    if (tgBtn) {
      tgBtn.addEventListener("click", function (e) {
        var user = a.links.telegram.replace(/^https?:\/\/t\.me\//, "");
        var coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
        var url = "tg://resolve?domain=" + user;
        e.preventDefault();
        var wentAway = false; // страница ушла в фон — значит, приложение открылось
        document.addEventListener("visibilitychange", function onHide() {
          if (document.hidden) wentAway = true;
          document.removeEventListener("visibilitychange", onHide);
        });
        /* На десктопе при запуске приложения или показе диалога протокола
           окно теряет фокус — это тоже считаем «приложение открылось». */
        window.addEventListener("blur", function onBlur() {
          wentAway = true;
          window.removeEventListener("blur", onBlur);
        });
        if (coarse) {
          var f = document.createElement("iframe");
          f.style.display = "none";
          f.src = url;
          document.body.appendChild(f);
          setTimeout(function () { f.remove(); }, 2000);
        } else {
          window.location.href = url;
        }
        setTimeout(function () {
          if (!wentAway) window.open(a.links.telegram, "_blank");
        }, coarse ? 1500 : 2000);
      });
    }
    /* VK: на сенсорных устройствах сначала пробуем приложение через vk://,
       при неудаче — веб-версию. На десктопе — обычный переход по ссылке. */
    var vkBtn = document.getElementById("vkBtn");
    if (vkBtn) {
      vkBtn.addEventListener("click", function (e) {
        var coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
        if (!coarse) return;
        e.preventDefault();
        /* deep link VK-приложения повторяет путь веб-адреса;
           vk.com — основной домен, который понимает приложение */
        var deeplink = a.links.vk.replace(/^https:\/\/vk\.(ru|com)\//, "vk://vk.com/");
        var wentAway = false; // страница ушла в фон — значит, приложение открылось
        document.addEventListener("visibilitychange", function onHide() {
          if (document.hidden) wentAway = true;
          document.removeEventListener("visibilitychange", onHide);
        });
        var f = document.createElement("iframe");
        f.style.display = "none";
        f.src = deeplink;
        document.body.appendChild(f);
        setTimeout(function () { f.remove(); }, 2000);
        setTimeout(function () {
          if (!wentAway) window.open(a.links.vk, "_blank");
        }, 1500);
      });
    }
  }

  /* Случайный стих: прямой переход по хешу — ссылку можно расшарить,
     «назад» в браузере работает. Открытый стих из выбора исключается. */
  function gotoRandomPoem() {
    trackGoal("random_poem");
    var list = poems();
    var m = /^#\/?poem\/(.+)$/.exec(location.hash);
    var pool = m ? list.filter(function (p) { return p.id !== m[1]; }) : list;
    if (!pool.length) return;
    location.hash = "#poem/" + pool[Math.floor(Math.random() * pool.length)].id;
  }

  /* Небольшое всплывающее уведомление внизу страницы (в одном экземпляре). */
  function showToast(text) {
    var t = document.querySelector(".toast");
    if (!t) {
      t = document.createElement("div");
      t.className = "toast";
      document.body.appendChild(t);
      setTimeout(function () { t.classList.add("visible"); }, 10);
    }
    t.textContent = text;
    clearTimeout(t._hideTimer);
    clearTimeout(t._removeTimer);
    t._hideTimer = setTimeout(function () {
      t.classList.remove("visible");
      t._removeTimer = setTimeout(function () { t.remove(); }, 300);
    }, 2500);
  }

  /* Копирование в буфер: Clipboard API, при отказе — запасной execCommand
     (нужен, в частности, когда системное меню «Поделиться» уводит фокус со страницы). */
  function copyText(text, okMsg) {
    function fallback() {
      try {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        var ok = document.execCommand("copy");
        document.body.removeChild(ta);
        showToast(ok ? okMsg : "Не удалось скопировать: " + text);
      } catch (e) {
        showToast("Не удалось скопировать: " + text);
      }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        showToast(okMsg);
      }).catch(fallback);
    } else {
      fallback();
    }
  }

  /* Поделиться текущей страницей: сначала копия ссылки, затем системное меню
     («Поделиться» уводит фокус со страницы — после него буфер уже не сработает). */
  function sharePage(url) {
    copyText(url, "Ссылка скопирована: " + url);
    if (navigator.share) {
      navigator.share({ title: document.title, url: url }).catch(function () { /* пользователь отменил */ });
    } else {
      showToast("Меню «Поделиться» в этом браузере недоступно");
    }
  }

  /* Строка био: сколько произведений и с каких пор пишутся.
     Формулировка короткая специально — на мобильных помещается в одну строку. */
  function bioLine(all) {
    var years = [];
    all.forEach(function (p) {
      var m = /\d{4}/.exec(p.date || "");
      if (m) years.push(m[0]);
    });
    years.sort();
    var span = years.length > 1 ? " — с " + years[0] + " года" : "";
    return all.length + " стихов и переводов" + span + ".";
  }

  function cardGrid(list, qStr) {
    if (!list.length) {
      return '<div class="empty">Ничего не найдено. Измените условия поиска.' +
        '<br><a class="btn small" href="#poems">Сбросить поиск</a></div>';
    }
    var nq = normText((qStr || "").trim());
    return '<div class="cards">' + list.map(function (p) {
      var title = nq && normText(p.title).indexOf(nq) !== -1
        ? highlightHtml(p.title, nq)
        : esc(p.title);
      return '<article class="card" data-href="#poem/' + esc(p.id) + '">' +
        '<a class="tag" href="' + listHref("", normGenre(p.genre), 1) + '">' + esc(normGenre(p.genre)) + '</a>' +
        '<h3><a href="#poem/' + esc(p.id) + '">' + title + '</a></h3>' +
        '<p>' + excerptHtml(p.text, nq) + '</p>' +
        '<div class="foot"><span>' + esc(showDate(p.date)) + '</span>' +
          '<a href="#poem/' + esc(p.id) + '">Читать →</a></div>' +
      '</article>';
    }).join("") + '</div>';
  }

  /* Компактная пагинация: ← 1 2 3 … N →; листать также можно стрелками
     клавиатуры и свайпами (подсказка под номерами). */
  function pagerHtml(total, page, pages, q, genre) {
    if (pages <= 1) return "";
    var nums = [];
    var from = Math.max(1, page - 1), to = Math.min(pages, page + 1);
    if (from > 1) nums.push(1);
    if (from > 2) nums.push("…");
    for (var i = from; i <= to; i++) nums.push(i);
    if (to < pages - 1) nums.push("…");
    if (to < pages) nums.push(pages);
    var links = [];
    links.push(page > 1
      ? '<a href="' + listHref(q, genre, page - 1) + '" title="Предыдущая страница" aria-label="Предыдущая страница">←</a>'
      : '<span aria-hidden="true">←</span>');
    nums.forEach(function (n) {
      if (n === "…") { links.push("<span>…</span>"); return; }
      links.push('<a href="' + listHref(q, genre, n) + '"' +
        (n === page ? ' class="active" aria-current="page"' : '') + '>' + n + '</a>');
    });
    links.push(page < pages
      ? '<a href="' + listHref(q, genre, page + 1) + '" title="Следующая страница" aria-label="Следующая страница">→</a>'
      : '<span aria-hidden="true">→</span>');
    return '<nav class="pager" aria-label="Страницы списка">' + links.join("") + '</nav>' +
      '<p class="pager-hint">' +
        '<span class="hint-desktop">Листать также можно стрелками ← → на клавиатуре, R — случайный стих</span>' +
        '<span class="hint-mobile">Листать также можно свайпами ← →</span>' +
      '</p>';
  }

  /* ── Страница стихотворения ──────────────────────────── */
  function renderPoem(id) {
    document.title = "Яков Шахов — стихи"; /* будет заменён названием ниже */
    var list = poems().slice().sort(byDateDesc);
    var i = -1;
    for (var k = 0; k < list.length; k++) {
      if (list[k].id === id) { i = k; break; }
    }
    if (i === -1) {
      app.innerHTML = '<div class="wrap page-center">' +
        '<h2 class="section">Произведение не найдено</h2>' +
        '<p><a class="back-link" href="#poems">← ко всем стихам</a></p></div>';
      return;
    }
    var p = list[i];
    var a = window.AUTHOR;
    document.title = p.title + " — Яков Шахов — стихи";
    /* Список отсортирован от новых к старым — это и есть порядок чтения:
       «предыдущий» — более новый, «следующий» — более старый. */
    var prev = list[i - 1], next = list[i + 1];
    currentNav = { prev: prev, next: next };
    listNav = null;
    app.innerHTML = '<div class="wrap page-center">' +
      '<article class="poem">' +
        '<a class="tag" href="' + listHref("", normGenre(p.genre), 1) + '">' + esc(normGenre(p.genre)) + '</a>' +
        '<h2>' + esc(p.title) + '</h2>' +
        '<div class="meta">' + esc(showDate(p.date)) + '</div>' +
        '<pre class="text">' + esc(p.text) + '</pre>' +
        '<div class="poem-sign">' + esc(a.name) + '</div>' +
        '<div class="source-link">' +
          '<button class="poem-share" id="poemShareBtn" type="button" title="Поделиться" aria-label="Поделиться">' +
            '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98"/></svg>' +
          '</button>' +
          '<button class="poem-share" id="copyPoemBtn" type="button" title="Копировать текст" aria-label="Копировать текст">' +
            '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>' +
          '</button>' +
          '<button class="poem-share to-top" id="toTopBtn" type="button" title="Наверх" aria-label="Наверх">' +
            '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>' +
          '</button>' +
        '</div>' +
      '</article>' +
      '<nav class="poem-nav">' +
        (prev
          ? '<a class="pn-full" href="#poem/' + esc(prev.id) + '">← ' + esc(prev.title) + '</a>' +
            '<a class="pn-compact" href="#poem/' + esc(prev.id) + '" aria-label="Предыдущее стихотворение">‹</a>'
          : '<span></span>') +
        '<span class="poem-pos">' + (i + 1) + ' из ' + list.length + '</span>' +
        (next
          ? '<a class="pn-full" href="#poem/' + esc(next.id) + '">' + esc(next.title) + ' →</a>' +
            '<a class="pn-compact" href="#poem/' + esc(next.id) + '" aria-label="Следующее стихотворение">›</a>'
          : '') +
      '</nav>' +
      '<p class="poem-random">' +
        '<button type="button" class="random-link" id="randomLink" title="Случайный стих (клавиша R)">' +
          '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8.2" cy="8.2" r="1.3" fill="currentColor" stroke="none"/><circle cx="15.8" cy="8.2" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="8.2" cy="15.8" r="1.3" fill="currentColor" stroke="none"/><circle cx="15.8" cy="15.8" r="1.3" fill="currentColor" stroke="none"/></svg>' +
          'Случайный стих' +
        '</button>' +
      '</p>' +
      '<p><a class="back-link" href="' +
        (lastList ? listHref(lastList.q, lastList.genre, lastList.page) : "#poems") +
      '">← ко всем стихам</a></p>' +
      /* Краевые стрелки листания: видны только на сенсорных экранах (CSS).
         Подсказывают про свайпы и сами служат тап-целями по краям. */
      (prev ? '<button type="button" class="edge-nav edge-prev" aria-label="Предыдущее стихотворение">‹</button>' : '') +
      (next ? '<button type="button" class="edge-nav edge-next" aria-label="Следующее стихотворение">›</button>' : '');
    swipeHintEl = null; /* DOM перерисован — ссылка на подсказку устарела */
    var poemShare = document.getElementById("poemShareBtn");
    if (poemShare) {
      poemShare.addEventListener("click", function () {
        sharePage(location.href);
      });
    }
    /* Копия текста для цитирования: заголовок, текст, подпись автора. */
    var copyBtn = document.getElementById("copyPoemBtn");
    if (copyBtn) {
      copyBtn.addEventListener("click", function () {
        copyText(p.title.toUpperCase() + "\n\n" + p.text + "\n\n" + a.name, "Стихотворение скопировано");
      });
    }
    var randomLink = document.getElementById("randomLink");
    if (randomLink) randomLink.addEventListener("click", gotoRandomPoem);
    var toTop = document.getElementById("toTopBtn");
    if (toTop) {
      toTop.addEventListener("click", function () {
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    }
    var edgePrev = document.querySelector(".edge-nav.edge-prev");
    if (edgePrev) edgePrev.addEventListener("click", function () { gotoPoem(prev); });
    var edgeNext = document.querySelector(".edge-nav.edge-next");
    if (edgeNext) edgeNext.addEventListener("click", function () { gotoPoem(next); });
    maybeShowSwipeHint();
  }

  /* ── Маршрутизация по хешу ───────────────────────────── */
  function route() {
    var h = location.hash.replace(/^#\/?/, "");
    /* Состояние уходящего представления: уходим со списка — запоминаем
       прокрутку, чтобы вернуть её при возврате «ко всем стихам».
       Уход по логотипу («#home») — всегда «с чистого листа», не запоминаем. */
    var outgoingIsList = h !== "home" && !currentNav && !!listNav;
    var outgoingListKey = outgoingIsList ? listNav.q + "|" + listNav.genre + "|" + listNav.page : null;
    var outgoingScrollY = window.scrollY;
    var section = decodeURIComponent(h.split(/[/?]/)[0] || "") || "home";
    /* Ушли со страницы стиха, не свайпнув, — подсказку больше не показываем */
    if (h.indexOf("poem/") !== 0) dismissSwipeHint();
    var nav = document.querySelectorAll("nav.main a");
    nav.forEach(function (a) {
      a.classList.toggle("active", section === a.getAttribute("href").slice(1));
    });

    if (h.indexOf("poem/") === 0) {
      renderPoem(h.slice(5));
      window.scrollTo(0, 0);
    } else {
      /* «#home» — явный путь «на главную» (логотип): без фильтров
         и без восстановления прокрутки, всегда с чистого листа. */
      var goingHome = h === "home";
      if (goingHome) savedListScroll = null;
      var params = new URLSearchParams(h.split("?")[1] || "");
      renderHome(params);
      document.title = "Яков Шахов — стихи";
      var key = listNav.q + "|" + listNav.genre + "|" + listNav.page;
      if (!goingHome && !outgoingIsList && savedListScroll && savedListScroll.key === key) {
        window.scrollTo(0, savedListScroll.y); /* возврат со стиха */
      } else {
        window.scrollTo(0, 0);
      }
    }
    if (outgoingListKey) {
      savedListScroll = { key: outgoingListKey, y: outgoingScrollY };
    }
  }

  window.addEventListener("hashchange", route);
  route();

  /* Логотип: если мы уже на «#home», хеш не меняется и route не сработает —
     прокручиваем наверх вручную (переход по клику всё равно сбрасывает фильтры). */
  var logo = document.querySelector(".logo");
  if (logo) {
    logo.addEventListener("click", function () {
      if (location.hash === "#home" || location.hash === "" || location.hash === "#") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  }

  /* Skip-link: не меняем хеш (иначе route сбросит фильтры списка),
     просто переводим фокус в содержимое. */
  var skipLink = document.querySelector(".skip-link");
  if (skipLink) {
    skipLink.addEventListener("click", function (e) {
      e.preventDefault();
      app.focus();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  /* ── Переключатель светлой/тёмной темы ──── */
  var themeBtn = document.getElementById("themeToggle");
  if (themeBtn) {
    themeBtn.addEventListener("click", function () {
      var next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      var mt = document.querySelector('meta[name="theme-color"]');
      if (mt) mt.content = next === "dark" ? "#221c16" : "#f4eee2";
      try { localStorage.setItem("theme", next); } catch (e) {}
    });
  }

  /* ── Кнопка «Поделиться» в шапке ────────── */
  var shareBtn = document.getElementById("shareBtn");
  if (shareBtn) {
    shareBtn.addEventListener("click", function () {
      trackGoal("share");
      sharePage(location.href);
    });
  }

  /* ── Листание: стрелки на десктопе, свайпы на мобильных.
     На странице стиха — соседние стихи, на главной — страницы списка. ── */
  function gotoPoem(p) {
    if (p) location.hash = "#poem/" + p.id;
  }
  function gotoPage(n) {
    if (n < 1 || n > listNav.pages || n === listNav.page) return;
    location.hash = listHref(listNav.q, listNav.genre, n);
  }
  function typingTarget(el) {
    var tag = (el && el.tagName || "").toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select";
  }
  /* Фокус на ссылке/кнопке: стрелки должны листать страницу, а не дёргать
     навигацию по стихам одновременно с прокруткой сфокусированного элемента. */
  function pressable(el) {
    var tag = (el && el.tagName || "").toLowerCase();
    return tag === "a" || tag === "button";
  }
  function navLeft() {
    if (currentNav) gotoPoem(currentNav.prev);
    else if (listNav) gotoPage(listNav.page - 1);
  }
  function navRight() {
    if (currentNav) gotoPoem(currentNav.next);
    else if (listNav) gotoPage(listNav.page + 1);
  }
  document.addEventListener("keydown", function (e) {
    if (e.altKey || e.ctrlKey || e.metaKey || typingTarget(e.target) ||
        pressable(document.activeElement)) return;
    if (e.key === "ArrowLeft") navLeft();
    else if (e.key === "ArrowRight") navRight();
    /* e.code — независимо от раскладки (русская «К» — та же клавиша R) */
    else if (e.code === "KeyR") gotoRandomPoem();
  });
  /* Клик мышью снимает фокус со ссылки/кнопки (e.detail === 0 — активация
     с клавиатуры, там фокус сохраняем): стрелки не «прилипают» к нажатому. */
  document.addEventListener("click", function (e) {
    if (!e.target.closest || e.detail === 0) return;
    var el = e.target.closest("a, button");
    if (el) el.blur();
  });
  /* Клик по карточке открывает стих; клики по ссылкам внутри — нет. */
  document.addEventListener("click", function (e) {
    if (!e.target.closest) return;
    var card = e.target.closest(".card[data-href]");
    if (!card || e.target.closest("a, button")) return;
    location.hash = card.getAttribute("data-href");
  });
  /* ── Одноразовая подсказка «листайте свайпом» на странице стиха ──
     Только сенсорные экраны; исчезает после первого свайпа, тапа по ней
     или через 4 секунды; показывается один раз (localStorage). */
  var swipeHintEl = null;
  function dismissSwipeHint() {
    if (!swipeHintEl) return;
    if (swipeHintEl.parentNode) swipeHintEl.parentNode.removeChild(swipeHintEl);
    swipeHintEl = null;
    try { localStorage.setItem("swipeHintSeen", "1"); } catch (e) {}
  }
  function maybeShowSwipeHint() {
    var seen = false;
    try { seen = localStorage.getItem("swipeHintSeen") === "1"; } catch (e) {}
    if (seen || !currentNav || !(currentNav.prev || currentNav.next) ||
        !(window.matchMedia && window.matchMedia("(pointer: coarse)").matches)) return;
    var el = document.createElement("div");
    el.className = "swipe-hint";
    el.innerHTML = '<span class="swipe-demo" aria-hidden="true"><span class="swipe-dot"></span></span>листайте свайпом';
    app.appendChild(el);
    swipeHintEl = el;
    setTimeout(dismissSwipeHint, 4000);
  }
  var touchX = 0, touchY = 0;
  /* Подсветка краевой стрелки в сторону листания (affordance во время жеста) */
  function lightEdges(dx, dy, absdx) {
    var l = document.querySelector(".edge-nav.edge-prev");
    var r = document.querySelector(".edge-nav.edge-next");
    var lit = absdx > 24 && absdx > Math.abs(dy);
    if (l) l.classList.toggle("lit", lit && dx > 0);
    if (r) r.classList.toggle("lit", lit && dx < 0);
  }
  document.addEventListener("touchstart", function (e) {
    if (e.touches.length === 1) {
      touchX = e.touches[0].clientX;
      touchY = e.touches[0].clientY;
    }
  }, { passive: true });
  document.addEventListener("touchmove", function (e) {
    if (!touchX) return;
    lightEdges(e.touches[0].clientX - touchX,
               e.touches[0].clientY - touchY,
               Math.abs(e.touches[0].clientX - touchX));
  }, { passive: true });
  document.addEventListener("touchend", function (e) {
    if ((!currentNav && !listNav) || !touchX) return;
    var dx = e.changedTouches[0].clientX - touchX;
    var dy = e.changedTouches[0].clientY - touchY;
    touchX = 0;
    lightEdges(0, 0, 0);
    /* только заведомо горизонтальные жесты, чтобы не мешать прокрутке */
    if (Math.abs(dx) < 60 || Math.abs(dx) < 2 * Math.abs(dy)) return;
    dismissSwipeHint(); /* жест освоен — больше не показываем */
    if (dx < 0) navRight();
    else navLeft();
  }, { passive: true });
})();
