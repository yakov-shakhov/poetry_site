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
  /* Цикл разделов для свайпов/стрелок на списках: Стихи → Аудио → Видео →
     по кругу. sectionNav выставляется на страницах-списках (см. render*). */
  var sectionNav = null;
  var SECTION_CYCLE = {
    "#poems": { prev: "#video", next: "#audio" },
    "#audio": { prev: "#poems", next: "#video" },
    "#video": { prev: "#audio", next: "#poems" }
  };
  /* Краевые шевроны-«соседи» — как на странице стиха, но листают разделы */
  function sectionEdgeNavHtml() {
    return '<button type="button" class="edge-nav edge-prev" aria-label="Предыдущий раздел">‹</button>' +
      '<button type="button" class="edge-nav edge-next" aria-label="Следующий раздел">›</button>';
  }
  function bindSectionNav() {
    var ep = document.querySelector(".edge-nav.edge-prev");
    var en = document.querySelector(".edge-nav.edge-next");
    if (ep) ep.addEventListener("click", function () { if (sectionNav) location.hash = sectionNav.prev; });
    if (en) en.addEventListener("click", function () { if (sectionNav) location.hash = sectionNav.next; });
  }
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
     по алфавиту. Свернуты на всех экранах: на мобильных видны первые три,
     на десктопе — первые девять, остальные открывает кнопка «Ещё N жанров»
     (класс expanded вешается на контейнер; при выбранной рубрике список
     раскрыт сразу). */
  var MOBILE_CHIPS = 4;  /* вместе с «все» */
  var DESKTOP_CHIPS = 10; /* вместе с «все» */
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
    var hiddenM = 0, hiddenD = 0;
    genres.forEach(function (g, i) {
      var extraM = i + 1 >= MOBILE_CHIPS;
      var extraD = i + 1 >= DESKTOP_CHIPS;
      if (extraM) hiddenM++;
      if (extraD) hiddenD++;
      var classes = [];
      if (g === genre) classes.push("active");
      if (extraM) classes.push("extra");
      if (extraD) classes.push("extra-d");
      /* суффикс « лирика» прячется на мобильных у всех рубрик */
      var mSx = /^(.+) лирика$/.exec(g);
      var label = mSx
        ? esc(mSx[1]) + '<span class="sx">' + esc(" лирика") + '</span>'
        : esc(g);
      html += '<a href="' + listHref(q, g, 1) + '"' +
        (classes.length ? ' class="' + classes.join(" ") + '"' : '') +
        (g === genre ? ' aria-current="true"' : '') + '>' + label + '</a>';
    });
    if (hiddenD) {
      html += '<button type="button" class="chips-toggle" id="chipsToggle"' +
        ' data-hidden-m="' + hiddenM + '" data-hidden-d="' + hiddenD + '"' +
        ' aria-expanded="false">Ещё ' + hiddenD + ' ' +
        plural(hiddenD, "жанр", "жанра", "жанров") + '</button>';
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
  /* Портретная колонка автора — общая для главной и разделов. */
  function authorAsideHtml() {
    var all = poems();
    var a = window.AUTHOR;
    /* Био: на десктопе — подробнее (2–3 строки), на мобильных — одна строка.
       Переключение теми же классами, что и подсказки hint-desktop/hint-mobile. */
    var bioLong = "Пишу стихи с 2010 года. В этом собрании — " + all.length +
      " стихотворений и переводов: короткие зарисовки, лирика и большие поэмы. " +
      "Листайте как книгу, выбирайте рубрику — или доверьтесь случаю и откройте случайное.";
    return '<aside>' +
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
      '</aside>';
  }

  /* Если колонка контента ниже портретной (короткие страницы разделов),
     даём sticky-портрету «дорожку» для закрепления — как на странице
     стихов: без неё фото уезжает под шапку при первом же прокруте. */
  function stickAside() {
    /* на мобильных aside не sticky (одноколоночная вёрстка) — не вмешиваемся */
    if (!(window.matchMedia && window.matchMedia("(min-width: 981px)").matches)) return;
    var as = document.querySelector(".layout > aside");
    var mn = document.querySelector(".layout > main");
    if (!as || !mn || mn.offsetHeight >= as.offsetHeight) return;
    var footer = document.querySelector("footer.site");
    /* 80 — нижний отступ .layout, +20 — запас: столько прокрутки остаётся
       после того, как весь контент уже просмотрен */
    mn.style.minHeight = as.offsetHeight + 80 +
      (footer ? footer.offsetHeight : 0) + 20 + "px";
  }

  /* Обработчики кнопок портретной колонки (вызывается после каждого рендера). */
  function bindAuthorAside() {
    var a = window.AUTHOR;
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

  function renderHome(params) {
    var all = poems().slice().sort(byDateDesc);
    currentNav = null; // навигация стрелками/свайпами — только на странице стиха
    var q = (params.get("q") || "").trim();
    var genre = params.get("genre") || "";
    var page = Math.max(1, parseInt(params.get("page"), 10) || 1);

    var html = authorAsideHtml() +
      '<main>' +
        '<h2 class="section page-title">Стихотворения</h2>' +
        '<form id="searchForm">' +
          (genre ? '<input type="hidden" name="genre" value="' + esc(genre) + '">' : '') +
          '<input class="search" type="search" name="q" aria-label="Поиск по стихотворениям" placeholder="Поиск по ' + all.length + ' стихотворениям…" value="' + esc(q) + '">' +
        '</form>' +
        '<div id="results">' + resultsInner(q, genre, page, all) + '</div>' +
      '</main>';

    sectionNav = SECTION_CYCLE["#poems"];
    app.innerHTML = '<div class="wrap layout">' + html + '</div>' + sectionEdgeNavHtml();

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
    /* «ещё N жанров» — показать/скрыть остальные чипсы (свернуто и на
       мобильных, и на десктопе; сколько скрыто — зависит от экрана).
       Кнопка пересоздаётся при каждой перерисовке результатов — через хелпер. */
    function bindChipsToggle() {
      var chipsToggle = document.getElementById("chipsToggle");
      if (chipsToggle) {
        var label = function (expanded) {
          var mobile = window.matchMedia && window.matchMedia("(max-width: 640px)").matches;
          var n = Number(chipsToggle.getAttribute(mobile ? "data-hidden-m" : "data-hidden-d"));
          return expanded ? "Свернуть" : "Ещё " + n + " " + plural(n, "жанр", "жанра", "жанров");
        };
        chipsToggle.textContent = label(false);
        chipsToggle.addEventListener("click", function () {
          var chips = document.querySelector(".chips");
          var expanded = chips.classList.toggle("expanded");
          chipsToggle.setAttribute("aria-expanded", expanded ? "true" : "false");
          chipsToggle.textContent = label(expanded);
        });
      }
    }
    bindChipsToggle();
    bindSectionNav();
    bindAuthorAside();
    /* подсказка «листайте свайпом» — один раз, на первом заходе на сайт */
    maybeShowSwipeHint();
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

  /* Компактная пагинация: ← 1 2 3 … N →. Свайпы и стрелки клавиатуры
     на списках занятны переключением разделов — потому подсказка только
     про «случайный стих» (десктоп). */
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
      '<p class="pager-hint"><span class="hint-desktop">R — случайный стих</span></p>';
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
      currentNav = null;
      sectionNav = null;
      app.innerHTML = '<div class="wrap page-center">' +
        '<h2 class="section">Произведение не найдено</h2>' +
        '<p><a class="back-link" href="#poems">← ко всем стихам</a></p></div>';
      return;
    }
    var p = list[i];
    var a = window.AUTHOR;
    /* Записи этого стихотворения: если есть аудио/видео чтения —
       ссылки на них под текстом (обратная сторона «К тексту» карточек). */
    var poemAudio = (window.AUDIOS || []).filter(function (x) { return x.poem === p.id; });
    var poemVideo = (window.VIDEOS || []).filter(function (x) { return x.poem === p.id; });
    var mediaRow = (poemAudio.length || poemVideo.length
      ? '<div class="pmedia-row">' +
          (poemAudio.length ? '<a class="pmedia" href="#audio?play=' + encodeURIComponent(p.id) + '" title="Аудиозапись чтения">Аудио стиха →</a>' : '') +
          (poemVideo.length ? '<a class="pmedia" href="#video/' + esc(poemVideo[0].id) + '" title="Видеозапись чтения">Смотреть видео →</a>' : '') +
        '</div>'
      : '');
    document.title = p.title + " — Яков Шахов — стихи";
    /* Список отсортирован от новых к старым — это и есть порядок чтения:
       «предыдущий» — более новый, «следующий» — более старый. */
    var prev = list[i - 1], next = list[i + 1];
    currentNav = { prev: prev, next: next };
    listNav = null;
    sectionNav = null;
    app.innerHTML = '<div class="wrap page-center">' +
      '<article class="poem">' +
        '<a class="tag" href="' + listHref("", normGenre(p.genre), 1) + '">' + esc(normGenre(p.genre)) + '</a>' +
        '<h2>' + esc(p.title) + '</h2>' +
        /* дата слева, счётчик «x из N» справа (дублирует счётчик внизу) */
        '<div class="meta"><span>' + esc(showDate(p.date)) + '</span>' +
          '<span class="meta-pos">' + (i + 1) + ' из ' + list.length + '</span></div>' +
        '<pre class="text">' + esc(p.text) + '</pre>' +
        '<div class="poem-sign">' + esc(a.name) + '</div>' +
        mediaRow +
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
      /* «ко всем стихам» слева + «Случайный стих» справа — одна строка */
      '<div class="poem-actions">' +
        '<a class="back-link" href="' +
          (lastList ? listHref(lastList.q, lastList.genre, lastList.page) : "#poems") +
        '">← ко всем стихам</a>' +
        '<button type="button" class="random-link" id="randomLink" title="Случайный стих (клавиша R)">' +
          '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8.2" cy="8.2" r="1.3" fill="currentColor" stroke="none"/><circle cx="15.8" cy="8.2" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="8.2" cy="15.8" r="1.3" fill="currentColor" stroke="none"/><circle cx="15.8" cy="15.8" r="1.3" fill="currentColor" stroke="none"/></svg>' +
          'Случайный стих' +
        '</button>' +
      '</div>' +
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
  }

  /* ── Раздел «Видео» ──────────────────────────────────── */
  /* Записи из VK: в данных только ссылка вида vkvideo.ru/video-ИД_ИД —
     oid/id для embed вычисляются из неё. Сортировка — как у стихов. */
  function videos() {
    return (window.VIDEOS || []).slice().sort(byDateDesc);
  }
  function videoEmbedSrc(v) {
    var m = /video(-?\d+)_(\d+)/.exec(v.vk || v.id || "");
    return m
      ? "https://vk.com/video_ext.php?oid=" + m[1] + "&id=" + m[2] + "&hd=2&autoplay=1&js_api=1"
      : "";
  }

  /* VK-плеер при autoplay стартует без звука. По протоколу VK Video JS API
     шлём в плеер init, а после его ответа (событие inited) — команду unmute.
     Если handshake не случится, плеер просто работает как раньше. */
  var unbindVideoMsgs = null;
  function bindVideoUnmute(iframe) {
    if (unbindVideoMsgs) { unbindVideoMsgs(); unbindVideoMsgs = null; }
    if (!iframe) return;
    var origin = null, unmuted = false;
    var pending = [{ method: "unmute" }];
    function onMsg(e) {
      if (e.source !== iframe.contentWindow) return;
      if (unmuted || !iframe.isConnected) {
        window.removeEventListener("message", onMsg);
        unbindVideoMsgs = null;
        return;
      }
      if (!origin) origin = e.origin;
      var d = e.data || {};
      if (d.event === "inited" || d.event === "started") {
        unmuted = true;
        pending.splice(0).forEach(function (m) {
          iframe.contentWindow.postMessage(m, origin);
        });
        window.removeEventListener("message", onMsg);
        unbindVideoMsgs = null;
      }
    }
    /* init можно слать сразу с «*»: после первого ответа плеера
       origin фиксируем и шлём дальше только туда */
    iframe.contentWindow.postMessage({ method: "init" }, "*");
    window.addEventListener("message", onMsg);
    unbindVideoMsgs = function () { window.removeEventListener("message", onMsg); };
  }
  function poemById(id) {
    if (!id) return null;
    var list = poems();
    for (var k = 0; k < list.length; k++) {
      if (list[k].id === id) return list[k];
    }
    return null;
  }
  var PLAY_SVG = '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>';

  /* Умная ссылка на сенсорных устройствах: сначала пробуем установленное
     приложение через deep link, при неудаче — веб-версию. Страница ушла
     в фон / окно потеряло фокус — значит, приложение открылось. */
  function openViaApp(e, deeplink, fallbackUrl, wait) {
    e.preventDefault();
    var wentAway = false;
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
      if (!wentAway) window.open(fallbackUrl, "_blank");
    }, wait || 1500);
  }

  function renderVideoList() {
    currentNav = null;
    listNav = null;
    document.title = "Видео — Яков Шахов — стихи";
    var all = videos();
    var cards = all.map(function (v) {
      var p = poemById(v.poem);
      return '<article class="card video-card" data-href="#video/' + esc(v.id) + '">' +
        '<div class="vcover" aria-hidden="true">' +
          (v.cover ? '<img src="' + esc(v.cover) + '" alt="" loading="lazy">' : '') +
          '<span class="vplay">' + PLAY_SVG + '</span>' +
        '</div>' +
        (p ? '<a class="tag" href="' + listHref("", normGenre(p.genre), 1) + '">' + esc(normGenre(p.genre)) + '</a>' : '') +
        '<h3><a href="#video/' + esc(v.id) + '">' + esc(v.title) + '</a></h3>' +
        '<div class="foot"><span>' + esc(showDate(v.date)) + '</span>' +
          '<a href="#video/' + esc(v.id) + '">Смотреть →</a></div>' +
      '</article>';
    }).join("");
    sectionNav = SECTION_CYCLE["#video"];
    app.innerHTML = '<div class="wrap layout video-page">' + authorAsideHtml() +
      '<main>' +
        '<h2 class="section page-title">Видеозаписи</h2>' +
        (all.length
          ? '<div class="cards">' + cards + '</div>'
          : '<div class="empty">Видео скоро появятся.</div>') +
      '</main>' +
    '</div>' + sectionEdgeNavHtml();
    bindSectionNav();
    bindAuthorAside();
    stickAside();
  }

  function renderVideo(id) {
    document.title = "Яков Шахов — стихи";
    var list = videos();
    var i = -1;
    for (var k = 0; k < list.length; k++) {
      if (list[k].id === id) { i = k; break; }
    }
    if (i === -1) {
      currentNav = null;
      listNav = null;
      sectionNav = null;
      app.innerHTML = '<div class="wrap page-center">' +
        '<h2 class="section">Видео не найдено</h2>' +
        '<p><a class="back-link" href="#video">← ко всем видео</a></p></div>';
      return;
    }
    var v = list[i];
    var p = poemById(v.poem);
    var prev = list[i - 1], next = list[i + 1];
    currentNav = { prev: prev, next: next, base: "#video/" };
    listNav = null;
    sectionNav = null;
    trackGoal("video_play");
    var src = videoEmbedSrc(v);
    document.title = v.title + " — видео — Яков Шахов — стихи";
    app.innerHTML = '<div class="wrap layout">' + authorAsideHtml() +
      '<main>' +
        '<article class="video-full">' +
          (src
            ? '<div class="vframe"><iframe src="' + esc(src) + '" allow="autoplay; encrypted-media; fullscreen; picture-in-picture; screen-wake-lock;" allowfullscreen title="' + esc(v.title) + '"></iframe></div>'
            : '<div class="vcover" aria-hidden="true"><span class="vplay">' + PLAY_SVG + '</span></div>') +
          '<h2>' + esc(v.title) + '</h2>' +
          '<div class="meta"><span>' + esc(showDate(v.date)) + '</span>' +
            '<span class="meta-pos">' + (i + 1) + ' из ' + list.length + '</span></div>' +
          (p ? '<a class="vpoem" href="#poem/' + esc(p.id) + '">Стихотворение: «' + esc(p.title) + '» →</a>' : '') +
        '</article>' +
        '<nav class="poem-nav">' +
          (prev
            ? '<a class="pn-full" href="#video/' + esc(prev.id) + '">← ' + esc(prev.title) + '</a>' +
              '<a class="pn-compact" href="#video/' + esc(prev.id) + '" aria-label="Предыдущее видео">‹</a>'
            : '<span></span>') +
          '<span class="poem-pos">' + (i + 1) + ' из ' + list.length + '</span>' +
          (next
            ? '<a class="pn-full" href="#video/' + esc(next.id) + '">' + esc(next.title) + ' →</a>' +
              '<a class="pn-compact" href="#video/' + esc(next.id) + '" aria-label="Следующее видео">›</a>'
            : '') +
        '</nav>' +
        '<div class="poem-actions">' +
          '<a class="back-link" href="#video">← ко всем видео</a>' +
          '<a class="vk-link" href="' + esc(v.vk) + '" target="_blank" rel="noopener" title="Открыть на VK Видео">Смотреть на VK Видео ↗</a>' +
        '</div>' +
      '</main>' +
    '</div>' +
    (prev ? '<button type="button" class="edge-nav edge-prev" aria-label="Предыдущее видео">‹</button>' : '') +
    (next ? '<button type="button" class="edge-nav edge-next" aria-label="Следующее видео">›</button>' : '');
    swipeHintEl = null;
    bindAuthorAside();
    stickAside();
    bindVideoUnmute(document.querySelector(".vframe iframe"));
    /* «Смотреть на VK Видео»: на сенсорных сначала пробуем приложение
       (vk:// понимает пути vk.com, среди них — video), при неудаче — веб. */
    var vkLink = document.querySelector(".vk-link");
    if (vkLink) {
      vkLink.addEventListener("click", function (e) {
        var coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
        if (!coarse) return;
        openViaApp(e, v.vk.replace(/^https:\/\/vkvideo\.ru\//, "vk://vk.com/"), v.vk);
      });
    }
  }

  /* ── Раздел «Аудио» ──────────────────────────────────── */
  /* VK своего аудиоплеера наружу не отдаёт, поэтому записи играют
     кастомным плеером сайта (скрытый <audio> + своя кнопка и полоса
     прогресса) с файлов в assets/audio; ссылка на VK — запасной путь. */
  function audios() {
    return (window.AUDIOS || []).slice().sort(byDateDesc);
  }

  var APLAY_SVG = '<svg class="i-play" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>';
  var APAUSE_SVG = '<svg class="i-pause" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>';

  function fmtTime(sec) {
    var s = Math.max(0, Math.floor(sec || 0));
    var m = Math.floor(s / 60), r = s % 60;
    return m + ":" + (r < 10 ? "0" : "") + r;
  }

  function renderAudioList() {
    currentNav = null;
    listNav = null;
    document.title = "Аудио — Яков Шахов — стихи";
    var all = audios();
    var cards = all.map(function (a) {
      var p = poemById(a.poem);
      return '<article class="card audio-card">' +
        (p
          ? '<div class="card-top">' +
              '<a class="tag" href="' + listHref("", normGenre(p.genre), 1) + '">' + esc(normGenre(p.genre)) + '</a>' +
              '<a class="totext" href="#poem/' + esc(p.id) + '" title="Перейти к тексту стихотворения">К тексту</a>' +
            '</div>'
          : '') +
        '<h3>' + esc(a.title) + '</h3>' +
        (a.reader ? '<p class="areader">' + esc(a.reader) + '</p>' : '') +
        (a.desc ? '<p class="adesc">' + esc(a.desc) + '</p>' : '') +
        (a.src
          ? '<div class="aplayer" data-poem="' + esc(a.poem || "") + '" data-title="' + esc(a.title) + '">' +
              '<button type="button" class="aplay" aria-label="Слушать: ' + esc(a.title) + '">' +
                APLAY_SVG + APAUSE_SVG +
              '</button>' +
              '<div class="abar" title="Перемотка"><div class="atrack"><div class="aprog"></div></div></div>' +
              '<span class="atime">0:00 / –:––</span>' +
              '<audio preload="none" src="' + esc(a.src) + '"></audio>' +
            '</div>'
          : (a.vk
              ? '<p class="aempty">Файл ещё не добавлен — послушать можно во ВКонтакте.</p>'
              : '<p class="aempty">Файл ещё не добавлен.</p>')) +
        '<div class="foot"><span>' + esc(showDate(a.date)) + '</span>' +
          (a.vk ? '<a href="' + esc(a.vk) + '" target="_blank" rel="noopener" title="Открыть во ВКонтакте">Слушать на VK ↗</a>' : '') + '</div>' +
      '</article>';
    }).join("");
    sectionNav = SECTION_CYCLE["#audio"];
    app.innerHTML = '<div class="wrap layout audio-page">' + authorAsideHtml() +
      '<main>' +
        '<h2 class="section page-title">Аудиозаписи</h2>' +
        (all.length
          ? '<div class="cards">' + cards + '</div>'
          : '<div class="empty">Аудиозаписи скоро появятся.</div>') +
      '</main>' +
    '</div>' + sectionEdgeNavHtml();
    bindSectionNav();
    bindAudioPlayers();
    /* «Аудио стиха» (со страницы стиха, #audio?play=<id>):
       запись этого стиха прокручивается в поле зрения и начинает играть. */
    var m = location.hash.match(/[?&]play=([^&]+)/);
    if (m) {
      var playPoem = decodeURIComponent(m[1]);
      var target = null;
      app.querySelectorAll(".aplayer").forEach(function (pl) {
        if (pl.getAttribute("data-poem") === playPoem && !target) target = pl;
      });
      if (target) {
        if (target.scrollIntoView) target.scrollIntoView({ block: "center" });
        target.querySelector(".aplay").click();
      }
    }
    bindAuthorAside();
    stickAside();
  }

  /* Кастомный плеер: скрытый <audio> — источник звука, кнопка и полоса —
     вид. Играет только один трек: запуск нового ставит паузу остальным.
     Цель «нажали прослушивание» (не «открыли страницу») — на play. */
  function bindAudioPlayers() {
    app.querySelectorAll(".aplayer").forEach(function (pl) {
      var audio = pl.querySelector("audio");
      if (!audio) return;
      var title = pl.getAttribute("data-title") || "";
      var btn = pl.querySelector(".aplay");
      var bar = pl.querySelector(".abar");
      var prog = pl.querySelector(".aprog");
      var time = pl.querySelector(".atime");
      function showTime() {
        var d = audio.duration;
        time.textContent = fmtTime(audio.currentTime) + " / " +
          (isFinite(d) && d ? fmtTime(d) : "–:––");
      }
      function setPlaying(on) {
        pl.classList.toggle("playing", on);
        btn.setAttribute("aria-label", (on ? "Пауза: " : "Слушать: ") + title);
      }
      btn.addEventListener("click", function () {
        if (audio.paused) {
          app.querySelectorAll(".aplayer audio").forEach(function (other) {
            if (other !== audio) other.pause();
          });
          audio.play();
          trackGoal("audio_play");
        } else {
          audio.pause();
        }
      });
      audio.addEventListener("play", function () { setPlaying(true); });
      audio.addEventListener("pause", function () { setPlaying(false); });
      audio.addEventListener("ended", function () {
        setPlaying(false);
        audio.currentTime = 0;
        prog.style.width = "0%";
        showTime();
      });
      audio.addEventListener("timeupdate", function () {
        if (isFinite(audio.duration) && audio.duration) {
          prog.style.width = (audio.currentTime / audio.duration * 100) + "%";
        }
        showTime();
      });
      audio.addEventListener("loadedmetadata", showTime);
      /* клик по полосе — перемотка (зона всей строки .abar — крупная тап-цель) */
      bar.addEventListener("click", function (e) {
        if (!isFinite(audio.duration) || !audio.duration) return;
        var r = bar.getBoundingClientRect();
        audio.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * audio.duration;
        showTime();
      });
    });
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
    /* Ушли со страницы стиха/видео, не свайпнув, — подсказку больше не показываем */
    if (h.indexOf("poem/") !== 0 && h.indexOf("video/") !== 0) dismissSwipeHint();
    var nav = document.querySelectorAll("nav.main a, nav.sections a");
    nav.forEach(function (a) {
      a.classList.toggle("active", section === a.getAttribute("href").slice(1));
    });

    if (h.indexOf("poem/") === 0) {
      renderPoem(h.slice(5));
      window.scrollTo(0, 0);
    } else if (h === "video") {
      renderVideoList();
      window.scrollTo(0, 0);
    } else if (h === "audio" || h.indexOf("audio?") === 0) {
      renderAudioList();
      window.scrollTo(0, 0);
    } else if (h.indexOf("video/") === 0) {
      renderVideo(decodeURIComponent(h.slice(6)));
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
     На страницах стихов и видео — соседние записи, на списках-разделах —
     цикл разделов: Стихи → Аудио → Видео → по кругу. ── */
  /* base в currentNav отличает листание видео от стихов (стрелки, свайпы) */
  function gotoPoem(p) {
    if (p) location.hash = (currentNav && currentNav.base ? currentNav.base : "#poem/") + p.id;
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
    else if (sectionNav) location.hash = sectionNav.prev;
  }
  function navRight() {
    if (currentNav) gotoPoem(currentNav.next);
    else if (sectionNav) location.hash = sectionNav.next;
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
  /* ── Одноразовая подсказка «листайте свайпом» на главной ──
     Только сенсорные экраны; исчезает после первого свайпа или через
     4 секунды; показывается один раз (localStorage), со страницы стиха
     убрана — первый заход на сайт почти всегда начинается с главной. */
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
    /* только сенсорные экраны; один раз — до первого свайпа или ухода с главной */
    if (seen || !(window.matchMedia && window.matchMedia("(pointer: coarse)").matches)) return;
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
    if ((!currentNav && !sectionNav) || !touchX) return;
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
