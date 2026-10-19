/* Логика сайта: список стихов, поиск, просмотр, хеш-навигация. */
(function () {
  "use strict";

  var app = document.getElementById("app");
  var ADMIN_KEY = "poetry_admin_poems";

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

  /* ── Главная: герой + список ─────────────────────────── */
  function renderHome(params) {
    var list = poems().slice().sort(byDateDesc);
    var q = (params.get("q") || "").toLowerCase();
    var genre = params.get("genre") || "";

    var genres = [];
    list.forEach(function (p) {
      var g = normGenre(p.genre);
      if (genres.indexOf(g) === -1) genres.push(g);
    });
    genres.sort(function (a, b) { return a.localeCompare(b, "ru"); });

    var filtered = list.filter(function (p) {
      if (genre && normGenre(p.genre) !== genre) return false;
      if (!q) return true;
      return (p.title + " " + p.text).toLowerCase().indexOf(q) !== -1;
    });

    var a = window.AUTHOR;
    app.innerHTML =
      '<div class="hero">' +
        '<img src="' + esc(a.photo) + '" alt="' + esc(a.name) + '">' +
        '<div>' +
          '<h1>' + esc(a.name) + '</h1>' +
          '<p class="sub">Стихи</p>' +
          '<p class="bio">' + esc(a.bio) + '</p>' +
          '<div class="links">' +
            '<a href="' + esc(a.links.stihi) + '" target="_blank" rel="noopener">Стихи.ру</a>' +
            '<a href="' + esc(a.links.vk) + '" target="_blank" rel="noopener">ВКонтакте</a>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<h2 class="section">Произведения</h2>' +
      '<form class="toolbar" id="searchForm">' +
        '<input type="search" name="q" placeholder="Поиск по названию и тексту…" value="' + esc(params.get("q") || "") + '">' +
        '<select name="genre" onchange="this.form.requestSubmit()">' +
          '<option value="">Все рубрики</option>' +
          genres.map(function (g) {
            return '<option' + (g === genre ? " selected" : "") + '>' + esc(g) + '</option>';
          }).join("") +
        '</select>' +
      '</form>' +
      '<p class="count">' +
        (q || genre
          ? "Найдено: " + filtered.length + " из " + list.length
          : "Всего произведений: " + list.length) +
      '</p>' +
      '<ul class="poems">' +
        (filtered.length ? filtered.map(function (p) {
          return '<li>' +
            '<div class="t"><a href="#poem/' + esc(p.id) + '">' + esc(p.title) + '</a></div>' +
            '<div class="meta">' + esc(normGenre(p.genre)) + " · " + esc(p.date || "") + '</div>' +
          '</li>';
        }).join("") : '<li>Ничего не найдено. Измените условия поиска.</li>') +
      '</ul>';

    var form = document.getElementById("searchForm");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var q = form.q.value.trim();
      var g = form.genre.value;
      var h = "poems";
      if (q) h += "?q=" + encodeURIComponent(q);
      if (g) h += (q ? "&" : "?") + "genre=" + encodeURIComponent(g);
      location.hash = h;
    });
  }

  /* ── Страница стихотворения ──────────────────────────── */
  function renderPoem(id) {
    var list = poems().slice().sort(byDateDesc);
    var i = -1;
    for (var k = 0; k < list.length; k++) {
      if (list[k].id === id) { i = k; break; }
    }
    if (i === -1) {
      app.innerHTML = '<h2 class="section">Произведение не найдено</h2>' +
        '<p><a href="#poems">← ко всем стихам</a></p>';
      return;
    }
    var p = list[i];
    var prev = list[i + 1], next = list[i - 1];
    app.innerHTML =
      '<div class="poem-nav">' +
        (prev ? '<a href="#poem/' + esc(prev.id) + '">← ' + esc(prev.title) + '</a>' : '<span></span>') +
        (next ? '<a href="#poem/' + esc(next.id) + '">' + esc(next.title) + ' →</a>' : '') +
      '</div>' +
      '<article class="poem">' +
        '<h2>' + esc(p.title) + '</h2>' +
        '<div class="meta">' + esc(normGenre(p.genre)) + " · " + esc(p.date || "") + '</div>' +
        '<pre class="text">' + esc(p.text) + '</pre>' +
        (p.url ? '<div class="source-link">Опубликовано на <a href="' + esc(p.url) +
                 '" target="_blank" rel="noopener">Стихи.ру</a></div>' : '') +
      '</article>' +
      '<p><a href="#poems">← ко всем стихам</a></p>';
  }

  /* ── Маршрутизация по хешу ───────────────────────────── */
  function route() {
    var h = location.hash.replace(/^#\/?/, "");
    var nav = document.querySelectorAll("nav.main a");
    nav.forEach(function (a) {
      a.classList.toggle("active",
        decodeURIComponent(h.split("/")[0] || "") === a.getAttribute("href").slice(1));
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
