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

  /* Короткая выдержка: первые строки стихотворения. */
  function excerpt(text) {
    var lines = String(text || "").split("\n").filter(function (l) { return l.trim(); });
    var s = lines.slice(0, 3).join(" ");
    if (s.length > 130) s = s.slice(0, 130).replace(/\s+\S*$/, "") + "…";
    return s;
  }

  /* Ссылка на список с сохранением параметров; page >= 2 добавляется явно. */
  function listHref(q, genre, page) {
    var parts = [];
    if (q) parts.push("q=" + encodeURIComponent(q));
    if (genre) parts.push("genre=" + encodeURIComponent(genre));
    if (page > 1) parts.push("page=" + page);
    return "#poems" + (parts.length ? "?" + parts.join("&") : "");
  }

  /* Чипсы рубрик. На мобильных видны первые, остальные открывает
     кнопка «ещё …» (класс expanded вешается на контейнер). */
  var CHIPS_VISIBLE = 9; /* вместе с «все» */
  function chipsHtml(q, genre, genres) {
    var html = '<a href="' + listHref(q, "", 1) + '"' + (genre ? "" : ' class="active"') + '>все</a>';
    var hidden = 0;
    genres.forEach(function (g, i) {
      var extra = i + 1 >= CHIPS_VISIBLE;
      if (extra) hidden++;
      var cls = [];
      if (g === genre) cls.push("active");
      if (extra) cls.push("extra");
      html += '<a href="' + listHref(q, g, 1) + '"' +
        (cls.length ? ' class="' + cls.join(" ") + '"' : '') + '>' + esc(g) + '</a>';
    });
    if (hidden) {
      html += '<button type="button" class="chips-toggle" id="chipsToggle" data-hidden="' + hidden +
        '" aria-expanded="false">ещё ' + hidden + ' рубрик…</button>';
    }
    return html;
  }

  /* ── Главная: портрет + поток карточек ───────────────── */
  function renderHome(params) {
    var all = poems().slice().sort(byDateDesc);
    currentNav = null; // навигация стрелками/свайпами — только на странице стиха
    var q = (params.get("q") || "").trim();
    var ql = q.toLowerCase();
    var genre = params.get("genre") || "";
    var page = Math.max(1, parseInt(params.get("page"), 10) || 1);

    var genres = [];
    all.forEach(function (p) {
      var g = normGenre(p.genre);
      if (genres.indexOf(g) === -1) genres.push(g);
    });
    genres.sort(function (a, b) { return a.localeCompare(b, "ru"); });

    var filtered = all.filter(function (p) {
      if (genre && normGenre(p.genre) !== genre) return false;
      if (!ql) return true;
      return (p.title + " " + p.text).toLowerCase().indexOf(ql) !== -1;
    });

    var pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (page > pages) page = pages;
    var slice = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    listNav = { q: q, genre: genre, page: page, pages: pages };
    lastList = { q: q, genre: genre, page: page };

    var a = window.AUTHOR;
    var html =
      '<aside>' +
        '<div class="portrait"><img src="' + esc(a.photo) + '" alt="' + esc(a.name) + '"></div>' +
        '<h1>' + esc(a.name) + '</h1>' +
        '<p class="role">' + esc(a.bio) + '</p>' +
        '<p class="bio">' + esc(bioLine(all)) + '</p>' +
        '<div class="btns">' +
          '<a class="btn ghost" href="' + esc(a.links.vk) + '" target="_blank" rel="noopener" title="Паблик ВКонтакте" aria-label="Паблик ВКонтакте">VK</a>' +
          '<a class="btn ghost" href="' + esc(a.links.stihi) + '" target="_blank" rel="noopener" title="Страница автора на Стихи.ру" aria-label="Страница автора на Стихи.ру">Стихи.ру</a>' +
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
        '<div class="chips' + (genre ? ' expanded' : '') + '">' +
          chipsHtml(q, genre, genres) +
        '</div>' +
        '<p class="count">' +
          (q || genre
            ? "Найдено: " + filtered.length + " из " + all.length
            : "Всего произведений: " + all.length) +
        '</p>' +
        cardGrid(slice) +
        pagerHtml(filtered.length, page, pages, q, genre) +
      '</main>';

    app.innerHTML = '<div class="wrap layout">' + html + '</div>';

    document.getElementById("searchForm").addEventListener("submit", function (e) {
      e.preventDefault();
      location.hash = listHref(this.q.value.trim(), this.genre ? this.genre.value : "", 1);
    });
    /* «ещё N рубрик…» — показать/скрыть остальные чипсы (только мобильные). */
    var chipsToggle = document.getElementById("chipsToggle");
    if (chipsToggle) {
      chipsToggle.addEventListener("click", function () {
        var chips = document.querySelector(".chips");
        var expanded = chips.classList.toggle("expanded");
        this.setAttribute("aria-expanded", expanded ? "true" : "false");
        this.textContent = expanded ? "свернуть рубрики" : "ещё " + this.getAttribute("data-hidden") + " рубрик…";
      });
    }
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

  /* Строка био: сколько произведений и с каких пор пишутся. */
  function bioLine(all) {
    var years = [];
    all.forEach(function (p) {
      var m = /\d{4}/.exec(p.date || "");
      if (m) years.push(m[0]);
    });
    years.sort();
    var span = years.length > 1 ? " — с " + years[0] + " года по сей день" : "";
    return all.length + " стихотворений и переводов" + span + ".";
  }

  function cardGrid(list) {
    if (!list.length) {
      return '<div class="empty">Ничего не найдено. Измените условия поиска.</div>';
    }
    return '<div class="cards">' + list.map(function (p) {
      return '<article class="card" data-href="#poem/' + esc(p.id) + '">' +
        '<span class="tag">' + esc(normGenre(p.genre)) + '</span>' +
        '<h3><a href="#poem/' + esc(p.id) + '">' + esc(p.title) + '</a></h3>' +
        '<p>' + esc(excerpt(p.text)) + '</p>' +
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
      links.push('<a href="' + listHref(q, genre, n) + '"' + (n === page ? ' class="active"' : '') + '>' + n + '</a>');
    });
    links.push(page < pages
      ? '<a href="' + listHref(q, genre, page + 1) + '" title="Следующая страница" aria-label="Следующая страница">→</a>'
      : '<span aria-hidden="true">→</span>');
    return '<nav class="pager" aria-label="Страницы списка">' + links.join("") + '</nav>' +
      '<p class="pager-hint">' +
        '<span class="hint-desktop">Листать также можно стрелками ← → на клавиатуре</span>' +
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
    document.title = p.title + " — Яков Шахов — стихи";
    /* Список отсортирован от новых к старым — это и есть порядок чтения:
       «предыдущий» — более новый, «следующий» — более старый. */
    var prev = list[i - 1], next = list[i + 1];
    currentNav = { prev: prev, next: next };
    listNav = null;
    app.innerHTML = '<div class="wrap page-center">' +
      '<article class="poem">' +
        '<span class="tag">' + esc(normGenre(p.genre)) + '</span>' +
        '<h2>' + esc(p.title) + '</h2>' +
        '<div class="meta">' + esc(showDate(p.date)) + '</div>' +
        '<pre class="text">' + esc(p.text) + '</pre>' +
        '<div class="source-link">' +
          '<button class="poem-share" id="poemShareBtn" type="button" title="Поделиться" aria-label="Поделиться">' +
            '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98"/></svg>' +
          '</button>' +
          '<button class="poem-share to-top" id="toTopBtn" type="button" title="Наверх" aria-label="Наверх">' +
            '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>' +
          '</button>' +
        '</div>' +
      '</article>' +
      '<nav class="poem-nav">' +
        (prev ? '<a href="#poem/' + esc(prev.id) + '">← ' + esc(prev.title) + '</a>' : '<span></span>') +
        '<span class="poem-pos">' + (i + 1) + ' из ' + list.length + '</span>' +
        (next ? '<a href="#poem/' + esc(next.id) + '">' + esc(next.title) + ' →</a>' : '') +
      '</nav>' +
      '<p><a class="back-link" href="' +
        (lastList ? listHref(lastList.q, lastList.genre, lastList.page) : "#poems") +
      '">← ко всем стихам</a></p>';
    var poemShare = document.getElementById("poemShareBtn");
    if (poemShare) {
      poemShare.addEventListener("click", function () {
        sharePage(location.href);
      });
    }
    var toTop = document.getElementById("toTopBtn");
    if (toTop) {
      toTop.addEventListener("click", function () {
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    }
  }

  /* ── Маршрутизация по хешу ───────────────────────────── */
  function route() {
    /* Состояние уходящего представления: уходим со списка — запоминаем
       прокрутку, чтобы вернуть её при возврате «ко всем стихам». */
    var outgoingIsList = !currentNav && !!listNav;
    var outgoingListKey = outgoingIsList ? listNav.q + "|" + listNav.genre + "|" + listNav.page : null;
    var outgoingScrollY = window.scrollY;
    var h = location.hash.replace(/^#\/?/, "");
    var section = decodeURIComponent(h.split(/[/?]/)[0] || "") || "home";
    var nav = document.querySelectorAll("nav.main a");
    nav.forEach(function (a) {
      a.classList.toggle("active", section === a.getAttribute("href").slice(1));
    });

    if (h.indexOf("poem/") === 0) {
      renderPoem(h.slice(5));
      window.scrollTo(0, 0);
    } else {
      var params = new URLSearchParams(h.split("?")[1] || "");
      renderHome(params);
      document.title = "Яков Шахов — стихи";
      var key = listNav.q + "|" + listNav.genre + "|" + listNav.page;
      if (!outgoingIsList && savedListScroll && savedListScroll.key === key) {
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
  function navLeft() {
    if (currentNav) gotoPoem(currentNav.prev);
    else if (listNav) gotoPage(listNav.page - 1);
  }
  function navRight() {
    if (currentNav) gotoPoem(currentNav.next);
    else if (listNav) gotoPage(listNav.page + 1);
  }
  document.addEventListener("keydown", function (e) {
    if (e.altKey || e.ctrlKey || e.metaKey || typingTarget(e.target)) return;
    if (e.key === "ArrowLeft") navLeft();
    else if (e.key === "ArrowRight") navRight();
  });
  /* Клик по карточке открывает стих; клики по ссылкам внутри — нет. */
  document.addEventListener("click", function (e) {
    if (!e.target.closest) return;
    var card = e.target.closest(".card[data-href]");
    if (!card || e.target.closest("a, button")) return;
    location.hash = card.getAttribute("data-href");
  });
  var touchX = 0, touchY = 0;
  document.addEventListener("touchstart", function (e) {
    if (e.touches.length === 1) {
      touchX = e.touches[0].clientX;
      touchY = e.touches[0].clientY;
    }
  }, { passive: true });
  document.addEventListener("touchend", function (e) {
    if ((!currentNav && !listNav) || !touchX) return;
    var dx = e.changedTouches[0].clientX - touchX;
    var dy = e.changedTouches[0].clientY - touchY;
    touchX = 0;
    /* только заведомо горизонтальные жесты, чтобы не мешать прокрутке */
    if (Math.abs(dx) < 60 || Math.abs(dx) < 2 * Math.abs(dy)) return;
    if (dx < 0) navRight();
    else navLeft();
  }, { passive: true });
})();
