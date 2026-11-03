/* ==========================================================================
   本草经纬 · 全站交互
   依赖：assets/herbs.js（window.SITE）
   ========================================================================== */
(function () {
  'use strict';

  var S = window.SITE;
  if (!S) { console.warn('[本草经纬] 未找到站点数据 assets/herbs.js'); return; }

  var pageByFile = {};
  S.pages.forEach(function (p, i) { p._order = i; pageByFile[p.file] = p; });

  // 导图页在 library/ 下一层，返回根目录要加 ../
  var ROOT_PREFIX = (document.body.dataset.page || '').indexOf('library/') === 0 ? '../' : '';

  var CAT_TOTAL = S.pages.reduce(function (a, p) { return a + p.stats.cats; }, 0);

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function escAttr(s) { return esc(s).replace(/\n/g, ' '); }
  function currentFile() {
    if (document.body.dataset.page) return document.body.dataset.page;
    var name = location.pathname.split('/').pop() || 'index.html';
    try { return decodeURIComponent(name); } catch (e) { return name; }
  }

  /* ---------------- 顶栏当前页 ---------------- */
  function markCurrentNav() {
    var file = currentFile();
    var links = document.querySelectorAll('.bc-nav a');
    for (var i = 0; i < links.length; i++) {
      if (links[i].getAttribute('data-page') === file) {
        links[i].classList.add('is-current');
        links[i].setAttribute('aria-current', 'page');
      }
    }
    if (navigator.platform && /Mac/i.test(navigator.platform)) {
      var kbds = document.querySelectorAll('.bc-search-trigger kbd');
      for (var j = 0; j < kbds.length; j++) kbds[j].textContent = '⌘ K';
    }
  }

  /* ---------------- 全站搜索 ---------------- */
  var modal, input, resultBox, metaLeft;
  var hits = [];
  var activeIndex = -1;

  var SEARCH_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"></circle><path d="m15.5 15.5 4.2 4.2"></path></svg>';
  var SUGGEST = ['安胎', '明目', '润肠', '止呕', '安神', '利水', '活血', '清热'];

  function buildModal() {
    modal = document.createElement('div');
    modal.className = 'bc-search';
    modal.hidden = true;
    modal.innerHTML =
      '<div class="bc-search-backdrop" data-bc-close></div>' +
      '<div class="bc-search-panel" role="dialog" aria-modal="true" aria-label="全站药材搜索">' +
        '<div class="bc-search-box">' + SEARCH_ICON +
          '<input type="text" autocomplete="off" spellcheck="false" aria-label="搜索药材、功效或主证">' +
          '<button type="button" class="bc-search-esc" data-bc-close>Esc</button>' +
        '</div>' +
        '<div class="bc-search-meta"><span data-bc-meta-left>全站 ' + S.herbs.length + ' 味药 · ' + CAT_TOTAL + ' 类</span><span>药名 / 功效 / 主证</span></div>' +
        '<div class="bc-search-results" data-bc-results></div>' +
        '<div class="bc-search-foot"><span>↑↓ 选择 · Enter 打开 · Esc 关闭</span><span>本草经纬 · 全站索引</span></div>' +
      '</div>';
    document.body.appendChild(modal);
    input = modal.querySelector('input');
    resultBox = modal.querySelector('[data-bc-results]');
    metaLeft = modal.querySelector('[data-bc-meta-left]');

    modal.addEventListener('click', function (e) {
      if (e.target.closest('[data-bc-close]')) closeSearch();
    });
    resultBox.addEventListener('click', function (e) {
      var chip = e.target.closest('[data-bc-term]');
      if (chip) { e.preventDefault(); input.value = chip.getAttribute('data-bc-term'); renderResults(); input.focus(); return; }
      var hit = e.target.closest('.bc-hit');
      if (hit) closeSearch();
    });
    resultBox.addEventListener('mousemove', function (e) {
      var hit = e.target.closest('.bc-hit');
      if (!hit) return;
      var idx = parseInt(hit.getAttribute('data-i'), 10);
      if (!isNaN(idx) && idx !== activeIndex) setActive(idx, false);
    });
    input.addEventListener('input', renderResults);
    input.addEventListener('keydown', onSearchKey);
  }

  function score(h, q) {
    var n = (h.n || '').toLowerCase();
    var t = (h.t || '').toLowerCase();
    var s = 0;
    if (n === q) s = 100;
    else if (n.indexOf(q) === 0) s = 85;
    else if (n.indexOf(q) > -1) s = 70;
    else {
      if (t === q) s = 60;
      else if (t.indexOf(q) > -1) s = 45;
      if ((h.gx || '').toLowerCase().indexOf(q) > -1) s = Math.max(s, 38);
      if ((h.zz || '').toLowerCase().indexOf(q) > -1) s = Math.max(s, 30);
      if ((h.tx || '').toLowerCase().indexOf(q) > -1) s = Math.max(s, 24);
      if ((h.cat || '').toLowerCase().indexOf(q) > -1) s = Math.max(s, 20);
      if ((h.g || '').toLowerCase().indexOf(q) > -1) s = Math.max(s, 16);
    }
    return s;
  }

  function mark(text, q) {
    text = text == null ? '' : String(text);
    if (!q) return esc(text);
    var i = text.toLowerCase().indexOf(q);
    if (i < 0) return esc(text);
    return esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length));
  }

  function suggestionHTML() {
    return '<div class="bc-search-suggest"><p>试试这些临证关键词</p><div class="bc-search-chips">' +
      SUGGEST.map(function (t) { return '<button type="button" data-bc-term="' + escAttr(t) + '">' + esc(t) + '</button>'; }).join('') +
      '</div></div>';
  }

  function renderResults() {
    var q = input.value.trim().toLowerCase();
    activeIndex = -1;
    if (!q) {
      hits = [];
      metaLeft.textContent = '全站 ' + S.herbs.length + ' 味药 · ' + CAT_TOTAL + ' 类';
      resultBox.innerHTML = suggestionHTML();
      return;
    }
    hits = S.herbs.map(function (h, i) { return { h: h, i: i, s: score(h, q) }; })
      .filter(function (x) { return x.s > 0; })
      .sort(function (a, b) {
        if (b.s !== a.s) return b.s - a.s;
        var pa = pageByFile[a.h.p] ? pageByFile[a.h.p]._order : 99;
        var pb = pageByFile[b.h.p] ? pageByFile[b.h.p]._order : 99;
        if (pa !== pb) return pa - pb;
        return a.i - b.i;
      })
      .slice(0, 40)
      .map(function (x) { return x.h; });

    metaLeft.textContent = hits.length + ' 条结果 · 全站 ' + S.herbs.length + ' 味';
    if (!hits.length) {
      resultBox.innerHTML = '<div class="bc-search-empty"><strong>没有找到「' + esc(input.value.trim()) + '」</strong>换个药名，或试试功效词：安胎、明目、润肠、止呕。</div>';
      return;
    }
    resultBox.innerHTML = hits.map(function (h, i) {
      var p = pageByFile[h.p] || {};
      var sub = h.gx || h.zz || '';
      var pageName = p.short || h.p.replace('.html', '');
      var pathText = pageName && h.cat && pageName !== h.cat ? pageName + ' · ' + h.cat : (pageName || h.cat || '');
      return '<a class="bc-hit" data-i="' + i + '" href="' + escAttr(ROOT_PREFIX + h.p) + '#herb-' + encodeURIComponent(h.n) + '"' +
        ' style="--a:' + escAttr(p.accent || '#a97c33') + '">' +
        '<span class="bc-hit-dot"></span>' +
        '<span class="bc-hit-main">' +
          '<span class="bc-hit-title"><strong>' + mark(h.n, q) + '</strong>' +
            (h.t ? '<span class="bc-hit-tag">' + mark(h.t, q) + '</span>' : '') +
          '</span>' +
          '<span class="bc-hit-sub">' + mark(sub, q) + '</span>' +
        '</span>' +
        '<span class="bc-hit-path">' + esc(pathText) + '</span>' +
      '</a>';
    }).join('');
  }

  function setActive(idx, doScroll) {
    var nodes = resultBox.querySelectorAll('.bc-hit');
    if (!nodes.length) return;
    if (idx < 0) idx = nodes.length - 1;
    if (idx >= nodes.length) idx = 0;
    for (var i = 0; i < nodes.length; i++) nodes[i].classList.toggle('is-active', i === idx);
    activeIndex = idx;
    if (doScroll !== false) nodes[idx].scrollIntoView({ block: 'nearest' });
  }

  function onSearchKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(activeIndex + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(activeIndex - 1); }
    else if (e.key === 'Enter') {
      var node = resultBox.querySelector('.bc-hit.is-active');
      if (!node) node = resultBox.querySelector('.bc-hit');
      if (node) { e.preventDefault(); node.click(); }
    } else if (e.key === 'Escape') {
      e.preventDefault(); closeSearch();
    }
  }

  function openSearch(prefill) {
    if (!modal) buildModal();
    modal.hidden = false;
    document.body.classList.add('bc-modal-open');
    input.value = prefill || '';
    renderResults();
    requestAnimationFrame(function () { input.focus(); input.select(); });
  }
  function closeSearch() {
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove('bc-modal-open');
    if (input) input.blur();
  }

  /* ---------------- 页内药材锚点与高亮 ---------------- */
  function herbName(card) {
    var h4 = card.querySelector('h4');
    if (!h4) return '';
    var clone = h4.cloneNode(true);
    var tags = clone.querySelectorAll('.tag');
    for (var i = 0; i < tags.length; i++) tags[i].parentNode.removeChild(tags[i]);
    return clone.textContent.replace(/\s+/g, '');
  }

  function assignHerbIds() {
    var cards = document.querySelectorAll('.card');
    for (var i = 0; i < cards.length; i++) {
      if (cards[i].id) continue;
      var name = herbName(cards[i]);
      if (!name) continue;
      var id = 'herb-' + name;
      if (!document.getElementById(id)) cards[i].id = id;
    }
  }

  function highlightHash() {
    var raw = location.hash ? location.hash.slice(1) : '';
    if (!raw) return;
    var id = raw;
    try { id = decodeURIComponent(raw); } catch (e) {}
    var el = document.getElementById(id);
    if (!el || !el.classList.contains('card')) return;
    el.classList.add('bc-focus');
    setTimeout(function () {
      try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { el.scrollIntoView(); }
    }, 140);
    setTimeout(function () { el.classList.remove('bc-focus'); }, 4600);
  }

  /* ---------------- 页尾相关大类 ---------------- */
  function renderRelated() {
    var mount = document.querySelector('.site-mount[data-page]');
    if (!mount) return;
    var page = pageByFile[mount.getAttribute('data-page')];
    if (!page) { mount.parentNode.removeChild(mount); return; }
    var cards = page.related.map(function (rel) {
      var p = pageByFile[rel.file];
      if (!p) return '';
      return '<a class="bc-rel-card" href="' + escAttr(ROOT_PREFIX + p.file) + '" style="--a:' + escAttr(p.accent) + '">' +
        '<span class="bc-water" aria-hidden="true">' + esc(p.water) + '</span>' +
        '<span class="bc-rel-kicker">相关大类 · ' + p.stats.herbs + ' 味</span>' +
        '<strong>' + esc(p.name) + '</strong>' +
        '<p>' + esc(rel.reason) + '</p>' +
        '<span class="bc-rel-go">打开导图 →</span>' +
      '</a>';
    }).join('');
    var sec = document.createElement('section');
    sec.className = 'bc-related';
    sec.innerHTML =
      '<div class="bc-related-in">' +
        '<div class="bc-related-head">' +
          '<span class="bc-eyebrow">串联学习</span>' +
          '<h2>这张图之外</h2>' +
          '<p>按病机的上下游，接上相邻的大类。</p>' +
        '</div>' +
        '<div class="bc-related-grid">' + cards + '</div>' +
        '<div class="bc-related-foot">' +
          '<a href="' + escAttr(ROOT_PREFIX + 'index.html') + '">← 返回全站首页</a>' +
          '<button type="button" data-bc-open-search>搜索全站 ' + S.herbs.length + ' 味药</button>' +
        '</div>' +
      '</div>';
    mount.parentNode.replaceChild(sec, mount);
  }

  /* ---------------- 首页：统计 / 索引 ---------------- */
  function renderCounts() {
    var vals = {
      herbs: S.herbs.length,
      cats: CAT_TOTAL,
      groups: S.pages.reduce(function (a, p) { return a + p.stats.groups; }, 0),
      pages: S.pages.length
    };
    var nodes = document.querySelectorAll('[data-bc-count]');
    for (var i = 0; i < nodes.length; i++) {
      var k = nodes[i].getAttribute('data-bc-count');
      if (vals[k] != null) nodes[i].textContent = vals[k];
    }
  }

  function renderIndex() {
    var wrap = document.getElementById('herbIndex');
    if (!wrap) return;
    var filterBox = document.getElementById('indexFilters');
    var searchInput = document.getElementById('indexSearch');
    var countBox = document.getElementById('indexCount');
    var emptyBox = document.getElementById('indexEmpty');

    if (filterBox) {
      filterBox.innerHTML = '<button type="button" class="bc-filter is-active" data-filter="all">全部<span>' + S.herbs.length + '</span></button>' +
        S.pages.map(function (p) {
          return '<button type="button" class="bc-filter" data-filter="' + escAttr(p.file) + '" style="--a:' + escAttr(p.accent) + '">' +
            esc(p.short) + '<span>' + p.stats.herbs + '</span></button>';
        }).join('');
    }

    wrap.innerHTML = S.pages.map(function (p) {
      var chips = S.herbs.filter(function (h) { return h.p === p.file; }).map(function (h) {
        var q = [h.n, h.t, h.gx, h.zz, h.tx, h.cat, h.g].join(' ').toLowerCase();
        return '<a class="bc-chip" href="' + escAttr(ROOT_PREFIX + p.file) + '#herb-' + encodeURIComponent(h.n) + '"' +
          ' data-q="' + escAttr(q) + '" data-p="' + escAttr(p.file) + '"' +
          ' style="--a:' + escAttr(p.accent) + '" title="' + escAttr(h.gx || h.zz || '') + '">' + esc(h.n) + '</a>';
      }).join('');
      return '<section class="bc-index-group" data-p="' + escAttr(p.file) + '">' +
        '<div class="bc-index-head"><span class="bc-idx-dot" style="background:' + escAttr(p.accent) + '"></span>' +
          '<h3>' + esc(p.name) + '</h3>' +
          '<span class="bc-idx-meta">' + p.stats.herbs + ' 味 · ' + p.stats.cats + ' 类 · ' + p.stats.groups + ' 组</span>' +
          '<a class="bc-idx-go" href="' + escAttr(ROOT_PREFIX + p.file) + '">打开导图 →</a>' +
        '</div>' +
        '<div class="bc-chips">' + chips + '</div>' +
      '</section>';
    }).join('');

    var state = { page: 'all', q: '' };
    var chips = wrap.querySelectorAll('.bc-chip');
    var groups = wrap.querySelectorAll('.bc-index-group');

    function apply() {
      var visible = 0;
      for (var i = 0; i < groups.length; i++) {
        var g = groups[i];
        var matches = 0;
        var list = g.querySelectorAll('.bc-chip');
        for (var j = 0; j < list.length; j++) {
          var c = list[j];
          var ok = (state.page === 'all' || c.getAttribute('data-p') === state.page) &&
                   (!state.q || c.getAttribute('data-q').indexOf(state.q) > -1);
          c.hidden = !ok;
          if (ok) matches++;
        }
        g.hidden = matches === 0;
        visible += matches;
      }
      if (countBox) countBox.textContent = '显示 ' + visible + ' / ' + S.herbs.length + ' 味';
      if (emptyBox) emptyBox.hidden = visible !== 0;
    }

    if (filterBox) {
      filterBox.addEventListener('click', function (e) {
        var btn = e.target.closest('.bc-filter');
        if (!btn) return;
        state.page = btn.getAttribute('data-filter');
        var all = filterBox.querySelectorAll('.bc-filter');
        for (var i = 0; i < all.length; i++) all[i].classList.toggle('is-active', all[i] === btn);
        apply();
      });
    }
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        state.q = searchInput.value.trim().toLowerCase();
        apply();
      });
    }
    apply();
  }

  /* ---------------- 全局事件 ---------------- */
  function bindGlobal() {
    document.addEventListener('click', function (e) {
      var trigger = e.target.closest('[data-bc-open-search],[data-bc-search]');
      if (trigger) {
        e.preventDefault();
        openSearch(trigger.getAttribute('data-bc-search') || '');
      }
    });
    document.addEventListener('keydown', function (e) {
      var k = e.key;
      if ((e.metaKey || e.ctrlKey) && (k === 'k' || k === 'K')) {
        e.preventDefault();
        if (modal && !modal.hidden) closeSearch(); else openSearch('');
        return;
      }
      if (k === 'Escape' && modal && !modal.hidden) { closeSearch(); return; }
      if (k === '/' && !(e.metaKey || e.ctrlKey || e.altKey)) {
        var t = e.target;
        var typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
        if (!typing) { e.preventDefault(); openSearch(''); }
      }
    });
  }

  /* ---------------- 启动 ---------------- */
  function init() {
    markCurrentNav();
    buildModal();
    bindGlobal();
    assignHerbIds();
    highlightHash();
    window.addEventListener('hashchange', highlightHash);
    renderRelated();
    renderCounts();
    renderIndex();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();