/* Логика сайта: список стихов, поиск, просмотр, хеш-навигация. */
(function () {
  "use strict";

  var app = document.getElementById("app");
  var ADMIN_KEY = "poetry_admin_poems";
  var PAGE_SIZE = 12;

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

  /* ── Главная: портрет + поток карточек ───────────────── */
  function renderHome(params) {
    var all = poems().slice().sort(byDateDesc);
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

    var a = window.AUTHOR;
    var html =
      '<aside>' +
        '<div class="portrait"><img src="' + esc(a.photo) + '" alt="' + esc(a.name) + '"></div>' +
        '<h1>' + esc(a.name) + '</h1>' +
        '<p class="role">' + esc(a.bio) + '</p>' +
        '<p class="bio">' + esc(topGenresLine(genres, all.length)) + '</p>' +
        '<div class="btns">' +
          '<a class="btn" href="#poems" id="readBtn">Читать стихи</a>' +
          '<a class="btn ghost" href="' + esc(a.links.stihi) + '" target="_blank" rel="noopener">Стихи.ру</a>' +
          '<a class="btn ghost" href="' + esc(a.links.vk) + '" target="_blank" rel="noopener">VK</a>' +
        '</div>' +
      '</aside>' +
      '<main>' +
        '<form id="searchForm">' +
          (genre ? '<input type="hidden" name="genre" value="' + esc(genre) + '">' : '') +
          '<input class="search" type="search" name="q" placeholder="Поиск по ' + all.length + ' стихотворениям…" value="' + esc(q) + '">' +
        '</form>' +
        '<div class="chips">' +
          '<a href="' + listHref(q, "", 1) + '"' + (genre ? "" : ' class="active"') + '>все</a>' +
          genres.map(function (g) {
            return '<a href="' + listHref(q, g, 1) + '"' + (g === genre ? ' class="active"' : '') + '>' + esc(g) + '</a>';
          }).join("") +
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
    document.getElementById("readBtn").addEventListener("click", function (e) {
      e.preventDefault();
      var el = app.querySelector(".search");
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.focus({ preventScroll: true });
      }
    });
  }

  /* Строка о трёх самых многочисленных рубриках. */
  function topGenresLine(genres, total) {
    var counts = {};
    poems().forEach(function (p) {
      var g = normGenre(p.genre);
      counts[g] = (counts[g] || 0) + 1;
    });
    var top = genres.slice().sort(function (a, b) { return counts[b] - counts[a]; }).slice(0, 3);
    return top.join(", ") + " и не только — всего " + total +
      " произведений в " + genres.length + " рубриках.";
  }

  function cardGrid(list) {
    if (!list.length) {
      return '<div class="empty">Ничего не найдено. Измените условия поиска.</div>';
    }
    return '<div class="cards">' + list.map(function (p) {
      return '<article class="card">' +
        '<span class="tag">' + esc(normGenre(p.genre)) + '</span>' +
        '<h3><a href="#poem/' + esc(p.id) + '">' + esc(p.title) + '</a></h3>' +
        '<p>' + esc(excerpt(p.text)) + '</p>' +
        '<div class="foot"><span>' + esc(p.date || "") + '</span>' +
          '<a href="#poem/' + esc(p.id) + '">Читать →</a></div>' +
      '</article>';
    }).join("") + '</div>';
  }

  /* Компактная пагинация: 1 2 3 … N. */
  function pagerHtml(total, page, pages, q, genre) {
    if (pages <= 1) return "";
    var nums = [];
    var from = Math.max(1, page - 1), to = Math.min(pages, page + 1);
    if (from > 1) nums.push(1);
    if (from > 2) nums.push("…");
    for (var i = from; i <= to; i++) nums.push(i);
    if (to < pages - 1) nums.push("…");
    if (to < pages) nums.push(pages);
    return '<nav class="pager">' + nums.map(function (n) {
      if (n === "…") return "<span>…</span>";
      return '<a href="' + listHref(q, genre, n) + '"' + (n === page ? ' class="active"' : '') + '>' + n + '</a>';
    }).join("") + '</nav>';
  }

  /* ── Страница стихотворения ──────────────────────────── */
  function renderPoem(id) {
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
    var prev = list[i + 1], next = list[i - 1];
    app.innerHTML = '<div class="wrap page-center">' +
      '<article class="poem">' +
        '<span class="tag">' + esc(normGenre(p.genre)) + '</span>' +
        '<h2>' + esc(p.title) + '</h2>' +
        '<div class="meta">' + esc(p.date || "") + '</div>' +
        '<pre class="text">' + esc(p.text) + '</pre>' +
        (p.url ? '<div class="source-link">Опубликовано на <a href="' + esc(p.url) +
                 '" target="_blank" rel="noopener">Стихи.ру</a></div>' : '') +
      '</article>' +
      '<nav class="poem-nav">' +
        (prev ? '<a href="#poem/' + esc(prev.id) + '">← ' + esc(prev.title) + '</a>' : '<span></span>') +
        (next ? '<a href="#poem/' + esc(next.id) + '">' + esc(next.title) + ' →</a>' : '') +
      '</nav>' +
      '<p><a class="back-link" href="#poems">← ко всем стихам</a></p>' +
    '</div>';
  }

  /* ── Маршрутизация по хешу ───────────────────────────── */
  function route() {
    var h = location.hash.replace(/^#\/?/, "");
    var section = decodeURIComponent(h.split(/[/?]/)[0] || "") || "home";
    var nav = document.querySelectorAll("nav.main a");
    nav.forEach(function (a) {
      a.classList.toggle("active", section === a.getAttribute("href").slice(1));
    });

    if (h.indexOf("poem/") === 0) {
      renderPoem(h.slice(5));
    } else {
      var params = new URLSearchParams(h.split("?")[1] || "");
      renderHome(params);
    }
    window.scrollTo(0, 0);
  }

  window.addEventListener("hashchange", route);
  route();
})();
