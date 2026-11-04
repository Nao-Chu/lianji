/* ==========================================================================
   本草经纬 · 药性小测
   依赖：assets/herbs.js（window.SITE）
   题目由 193 味药的数据现场生成；成绩与错题保存在 localStorage
   ========================================================================== */
(function () {
  'use strict';

  var S = window.SITE;
  if (!S || !S.herbs) { console.warn('[本草经纬] 做题页未找到站点数据'); return; }

  var HERBS = S.herbs.filter(function (h) { return h && h.n; });
  var herbByName = {};
  var pageByFile = {};
  HERBS.forEach(function (h) { herbByName[h.n] = h; });
  S.pages.forEach(function (p) { pageByFile[p.file] = p; });

  var MODES = {
    herb2fx: {
      no: '一', name: '药 → 功效', accent: '#a8342a',
      desc: '给出一味药，从四个功效里选出正确的一项；可限定训练范围。'
    },
    fx2herb: {
      no: '二', name: '功效 → 药', accent: '#2e6f9e',
      desc: '给出一个功效关键词（如「安胎」），选出对应的药。'
    },
    cat2herb: {
      no: '三', name: '分类 → 药', accent: '#4a7f6b',
      desc: '给出一个分类，选出属于该分类的药材。'
    },
    multi: {
      no: '四', name: '多选挑战', accent: '#8a5a9e',
      desc: '分类选多药、功效选多药或药选多功效，全部选对才得分。'
    },
    mixed: {
      no: '五', name: '混合挑战', accent: '#a97c33',
      desc: '单选与多选随机出现，检验真正的横向记忆。'
    },
    wrong: {
      no: '错', name: '错题重练', accent: '#7a6650',
      desc: '从错题集里重新作答。'
    }
  };

  var COUNTS = [5, 10, 20];
  var STORE_KEY = 'bc_quiz_v1';
  var TERM_MIN = 1;
  var TERM_MAX = 6;
  var WRONG_LIMIT = 200;

  /* ---------------- 小工具 ---------------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function escAttr(s) { return esc(s).replace(/\n/g, ' '); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
  function uniqPush(arr, v) { if (v && arr.indexOf(v) < 0) arr.push(v); }
  function sample(arr, n) { return shuffle(arr.slice()).slice(0, n); }
  function indexList(v) {
    if (typeof v === 'number') return v >= 0 ? [v] : [];
    return Array.isArray(v) ? v.filter(function (i) {
      return typeof i === 'number' && i >= 0 && i === Math.floor(i);
    }) : [];
  }
  function validAnswer(v, len) {
    var list = indexList(v);
    return list.length > 0 && list.every(function (i) { return i < len; });
  }
  function optionText(options, ans) {
    var list = indexList(ans).filter(function (i) { return i < options.length; }).sort(function (a, b) {
      return a - b;
    });
    return list.length ? list.map(function (i) { return options[i]; }).join('、') : '—';
  }
  function promptHTML(text) {
    return esc(text).replace(/「([^」]*)」/g, '<mark>$1</mark>');
  }
  function dateText(ts) {
    var d = new Date(ts || Date.now());
    if (isNaN(d.getTime())) return '';
    return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate();
  }

  /* ---------------- 本地缓存 ---------------- */
  function readStore() {
    var base = {
      stats: { answered: 0, correct: 0, best: 0 },
      wrong: [],
      prefs: { mode: 'mixed', count: 10, scope: '' }
    };
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return base;
      var o = JSON.parse(raw);
      if (!o || typeof o !== 'object') return base;
      if (o.stats && typeof o.stats === 'object') {
        base.stats.answered = Number(o.stats.answered) || 0;
        base.stats.correct = Number(o.stats.correct) || 0;
        base.stats.best = Number(o.stats.best) || 0;
      }
      if (Array.isArray(o.wrong)) {
        base.wrong = o.wrong.filter(function (e) {
          return e && e.key && Array.isArray(e.options) &&
            validAnswer(e.answer, e.options.length) &&
            (!e.multi || Array.isArray(e.answer));
        });
      }
      if (o.prefs && typeof o.prefs === 'object') {
        if (MODES[o.prefs.mode]) base.prefs.mode = o.prefs.mode;
        if (COUNTS.indexOf(Number(o.prefs.count)) > -1) base.prefs.count = Number(o.prefs.count);
        if (typeof o.prefs.scope === 'string') base.prefs.scope = o.prefs.scope;
      }
    } catch (e) { /* 无痕模式或 file:// 禁用存储时静默降级为内存 */ }
    return base;
  }
  var store = readStore();
  function persist() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) {}
  }
  function wrongIndex(key) {
    for (var i = 0; i < store.wrong.length; i++) {
      if (store.wrong[i].key === key) return i;
    }
    return -1;
  }

  /* ---------------- 题库索引 ---------------- */
  var byCat = {};
  var byPage = {};
  var catNames = [];
  var termIndex = {};
  var usableTerms = [];

  function termsOf(gx) {
    return String(gx || '').split(/[,，、;；]/).map(function (t) {
      return t.replace(/[（(].*$/, '').trim();
    }).filter(function (t) {
      return t.length >= 2 && t.length <= 8;
    });
  }

  HERBS.forEach(function (h) {
    if (h.cat) {
      if (!byCat[h.cat]) { byCat[h.cat] = []; catNames.push(h.cat); }
      byCat[h.cat].push(h);
    }
    if (h.p) {
      if (!byPage[h.p]) byPage[h.p] = [];
      byPage[h.p].push(h);
    }
    termsOf(h.gx).forEach(function (t) {
      if (!termIndex[t]) termIndex[t] = [];
      if (termIndex[t].indexOf(h) < 0) termIndex[t].push(h);
    });
  });

  Object.keys(termIndex).forEach(function (t) {
    var n = termIndex[t].length;
    if (n >= TERM_MIN && n <= TERM_MAX) usableTerms.push(t);
  });

  var categories = catNames.filter(function (c) { return byCat[c].length >= 3; });
  var multiCats = catNames.filter(function (c) { return byCat[c].length >= 4; });

  var scopeList = [{ key: '', label: '全站', full: '全站 193 味药', herbs: HERBS, count: HERBS.length }];
  S.pages.forEach(function (p) {
    var list = byPage[p.file] || [];
    if (!list.length) return;
    scopeList.push({ key: p.file, label: p.short, full: p.name, herbs: list, count: list.length });
  });

  function scopeByKey(key) {
    for (var i = 0; i < scopeList.length; i++) {
      if (scopeList[i].key === key) return scopeList[i];
    }
    return null;
  }

  function containsTerm(h, term) {
    var text = [h.n, h.t, h.gx, h.zz, h.tx, h.cat, h.g, h.note].join(' ');
    return text.indexOf(term) > -1;
  }

  /* ---------------- 出题 ---------------- */
  function genHerbToFx(used, usedTerms, scopeHerbs) {
    var base = scopeHerbs && scopeHerbs.length ? scopeHerbs : HERBS;
    var pool = base.filter(function (h) { return h.gx && !used[h.n]; });
    if (!pool.length) pool = base.filter(function (h) { return h.gx; });
    if (!pool.length) return null;
    var h = pick(pool);
    var correct = h.gx;
    var ds = [];

    function harvest(list) {
      shuffle(list).forEach(function (o) {
        if (ds.length >= 3) return;
        if (!o.gx || o.gx === correct) return;
        uniqPush(ds, o.gx);
      });
    }
    if (scopeHerbs && scopeHerbs.length) harvest(scopeHerbs);
    harvest(byCat[h.cat] || []);
    harvest(byPage[h.p] || []);
    harvest(HERBS);
    if (ds.length < 3) return null;

    var options = shuffle([correct].concat(ds.slice(0, 3)));
    return {
      key: 'herb2fx|' + h.n + '|' + correct,
      mode: 'herb2fx',
      prompt: '「' + h.n + '」的主要功效是？',
      meta: '选出与药名对应的功效',
      options: options,
      answer: options.indexOf(correct),
      herb: h
    };
  }

  function genFxToHerb(used, usedTerms) {
    var termPool = usableTerms.filter(function (t) {
      if (usedTerms[t]) return false;
      return termIndex[t].some(function (h) { return !used[h.n]; });
    });
    if (!termPool.length) {
      termPool = usableTerms.filter(function (t) { return !usedTerms[t]; });
    }
    if (!termPool.length) return null;

    var term = pick(termPool);
    var herbPool = termIndex[term].filter(function (h) { return !used[h.n]; });
    if (!herbPool.length) herbPool = termIndex[term];
    var h = pick(herbPool);
    var ds = [];

    function harvest(list) {
      shuffle(list).forEach(function (o) {
        if (ds.length >= 3) return;
        if (o.n === h.n) return;
        if (containsTerm(o, term)) return;
        uniqPush(ds, o.n);
      });
    }
    harvest(byCat[h.cat] || []);
    harvest(byPage[h.p] || []);
    harvest(HERBS);
    if (ds.length < 3) return null;

    var options = shuffle([h.n].concat(ds.slice(0, 3)));
    return {
      key: 'fx2herb|' + term + '|' + h.n,
      mode: 'fx2herb',
      prompt: '下列哪味药具有「' + term + '」的功效？',
      meta: '从功效反推药名',
      options: options,
      answer: options.indexOf(h.n),
      herb: h,
      term: term
    };
  }

  function genCatToHerb(used) {
    var catPool = categories.filter(function (c) {
      return byCat[c].some(function (h) { return !used[h.n]; });
    });
    if (!catPool.length) catPool = categories;
    if (!catPool.length) return null;

    var cat = pick(catPool);
    var herbPool = byCat[cat].filter(function (h) { return !used[h.n]; });
    if (!herbPool.length) herbPool = byCat[cat];
    var h = pick(herbPool);
    var ds = [];

    function harvest(list) {
      shuffle(list).forEach(function (o) {
        if (ds.length >= 3) return;
        if (o.cat === cat) return;
        uniqPush(ds, o.n);
      });
    }
    harvest(byPage[h.p] || []);
    harvest(HERBS);
    if (ds.length < 3) return null;

    var options = shuffle([h.n].concat(ds.slice(0, 3)));
    return {
      key: 'cat2herb|' + cat + '|' + h.n,
      mode: 'cat2herb',
      prompt: '下列哪味药属于「' + cat + '」？',
      meta: '判断分类归属',
      options: options,
      answer: options.indexOf(h.n),
      herb: h
    };
  }

  function genCatMulti(used) {
    var pool = multiCats.filter(function (c) {
      return byCat[c].some(function (h) { return !used[h.n]; });
    });
    if (!pool.length) pool = multiCats.slice();
    if (!pool.length) return null;

    var cat = pick(pool);
    var members = byCat[cat];
    var avail = members.filter(function (h) { return !used[h.n]; });
    if (avail.length < 2) avail = members.slice();

    var want = Math.min(3, avail.length);
    if (want < 2) return null;
    var correct = sample(avail, want);
    var correctNames = correct.map(function (h) { return h.n; });
    var ds = [];
    var need = 6 - want;

    function harvest(list) {
      shuffle(list).forEach(function (o) {
        if (ds.length >= need) return;
        if (o.cat === cat || correctNames.indexOf(o.n) > -1) return;
        uniqPush(ds, o.n);
      });
    }
    harvest(byPage[correct[0].p] || []);
    harvest(HERBS);
    if (ds.length < need) return null;

    var options = shuffle(correctNames.concat(ds.slice(0, need)));
    var answer = [];
    options.forEach(function (o, i) { if (correctNames.indexOf(o) > -1) answer.push(i); });

    return {
      key: 'multi|cat|' + cat + '|' + correctNames.slice().sort().join('+'),
      mode: 'multi', kind: 'cat', multi: true,
      prompt: '下列哪些药属于「' + cat + '」？（多选）',
      meta: '多选 · 选出全部正确项，漏选或多选都不得分',
      options: options,
      answer: answer,
      herbs: correct,
      category: cat,
      usedHerbs: correct
    };
  }

  function genFxMulti(used, usedTerms) {
    var pool = usableTerms.filter(function (t) {
      if (usedTerms[t] || termIndex[t].length < 2) return false;
      return termIndex[t].some(function (h) { return !used[h.n]; });
    });
    if (!pool.length) {
      pool = usableTerms.filter(function (t) { return termIndex[t].length >= 2; });
    }
    if (!pool.length) return null;

    var term = pick(pool);
    var herbs = termIndex[term];
    var avail = herbs.filter(function (h) { return !used[h.n]; });
    if (avail.length < 2) avail = herbs.slice();

    var want = Math.min(herbs.length >= 4 ? 3 : 2, avail.length);
    if (want < 2) return null;
    var correct = sample(avail, want);
    var correctNames = correct.map(function (h) { return h.n; });
    var ds = [];
    var need = 6 - want;

    function harvest(list) {
      shuffle(list).forEach(function (o) {
        if (ds.length >= need) return;
        if (correctNames.indexOf(o.n) > -1) return;
        if (containsTerm(o, term)) return;
        uniqPush(ds, o.n);
      });
    }
    harvest(byPage[correct[0].p] || []);
    harvest(HERBS);
    if (ds.length < need) return null;

    var options = shuffle(correctNames.concat(ds.slice(0, need)));
    var answer = [];
    options.forEach(function (o, i) { if (correctNames.indexOf(o) > -1) answer.push(i); });

    return {
      key: 'multi|fx|' + term + '|' + correctNames.slice().sort().join('+'),
      mode: 'multi', kind: 'fx', multi: true,
      prompt: '下列哪些药具有「' + term + '」的功效？（多选）',
      meta: '多选 · 选出全部正确项，漏选或多选都不得分',
      options: options,
      answer: answer,
      herbs: correct,
      term: term,
      usedHerbs: correct
    };
  }

  function genHerbFxMulti(used) {
    var pool = HERBS.filter(function (h) {
      return termsOf(h.gx).length >= 2 && !used[h.n];
    });
    if (!pool.length) pool = HERBS.filter(function (h) { return termsOf(h.gx).length >= 2; });
    if (!pool.length) return null;

    var h = pick(pool);
    var terms = [];
    termsOf(h.gx).forEach(function (t) { uniqPush(terms, t); });
    if (terms.length < 2) return null;

    var want = Math.min(3, terms.length);
    var correct = sample(terms, want);
    var ds = [];
    var need = 6 - want;

    function harvest(list) {
      shuffle(list).forEach(function (o) {
        if (ds.length >= need) return;
        termsOf(o.gx).forEach(function (t) {
          if (ds.length >= need) return;
          if (correct.indexOf(t) > -1 || containsTerm(h, t)) return;
          uniqPush(ds, t);
        });
      });
    }
    harvest(byCat[h.cat] || []);
    harvest(byPage[h.p] || []);
    harvest(HERBS);
    if (ds.length < need) return null;

    var options = shuffle(correct.concat(ds.slice(0, need)));
    var answer = [];
    options.forEach(function (o, i) { if (correct.indexOf(o) > -1) answer.push(i); });

    return {
      key: 'multi|herbfx|' + h.n + '|' + correct.slice().sort().join('+'),
      mode: 'multi', kind: 'herbfx', multi: true,
      prompt: '「' + h.n + '」具有下列哪些功效？（多选）',
      meta: '多选 · 选出全部正确功效，漏选或多选都不得分',
      options: options,
      answer: answer,
      herbs: [h],
      herb: h,
      usedHerbs: [h]
    };
  }

  var multiKindBag = [];
  var MULTI_GENS = { cat: genCatMulti, fx: genFxMulti, herbfx: genHerbFxMulti };

  function genMulti(used, usedTerms) {
    if (!multiKindBag.length) multiKindBag = shuffle(['cat', 'fx', 'herbfx']);
    var order = multiKindBag.slice();
    for (var i = 0; i < order.length; i++) {
      var q = MULTI_GENS[order[i]](used, usedTerms);
      if (q) {
        multiKindBag = order.slice(i + 1);
        return q;
      }
    }
    multiKindBag = [];
    return null;
  }

  var GENS = {
    herb2fx: genHerbToFx, fx2herb: genFxToHerb,
    cat2herb: genCatToHerb, multi: genMulti
  };

  function buildQuestions(mode, count, scopeHerbs) {
    if (mode === 'herb2fx' && scopeHerbs && scopeHerbs.length) {
      count = Math.min(count, scopeHerbs.filter(function (h) { return h.gx; }).length);
    }
    if (count <= 0) return [];

    var isMixed = mode === 'mixed';
    var bag = isMixed ? shuffle(['herb2fx', 'fx2herb', 'cat2herb', 'multi']) : null;
    var used = {};
    var usedTerms = {};
    var seen = {};
    var out = [];
    var guard = 0;
    multiKindBag = [];

    while (out.length < count && guard < count * 80) {
      guard++;
      var m;
      if (isMixed) {
        if (!bag.length) bag = shuffle(['herb2fx', 'fx2herb', 'cat2herb', 'multi']);
        m = bag.pop();
      } else {
        m = mode;
      }
      var q = GENS[m](used, usedTerms, mode === 'herb2fx' ? scopeHerbs : null);
      if (!q || seen[q.key]) continue;
      seen[q.key] = 1;
      (q.usedHerbs || []).forEach(function (h) { used[h.n] = 1; });
      if (q.term) usedTerms[q.term] = 1;
      out.push(q);
    }
    return out;
  }

  /* ---------------- 状态与 DOM ---------------- */
  var round = null;
  var lastRound = null;
  var els = {};
  var selectedMode = store.prefs.mode;
  var selectedCount = store.prefs.count;
  var selectedScope = store.prefs.scope || '';
  if (!scopeByKey(selectedScope)) selectedScope = '';

  function isTyping(target) {
    return target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' || target.isContentEditable);
  }

  /* ---------------- 统计渲染 ---------------- */
  function statHTML(label, value, cls) {
    return '<div class="q-stat' + (cls ? ' ' + cls : '') + '"><b>' + esc(value) +
      '</b><span>' + esc(label) + '</span></div>';
  }

  function renderStats() {
    var st = store.stats;
    var rate = st.answered ? Math.round(st.correct / st.answered * 100) : null;
    var html = '';
    html += statHTML('累计答题', st.answered ? st.answered : '0');
    html += statHTML('总正确率', rate == null ? '—' : rate + '%', rate != null && rate >= 70 ? 'is-good' : '');
    html += statHTML('待复习错题', store.wrong.length, store.wrong.length ? 'is-wrong' : '');
    html += statHTML('最佳正确率', st.best ? st.best + '%' : '—', st.best >= 80 ? 'is-good' : '');
    if (els.stats) els.stats.innerHTML = html;
  }

  /* ---------------- 模式 / 题量渲染 ---------------- */
  function renderModes() {
    if (!els.modes) return;
    var html = ['herb2fx', 'fx2herb', 'cat2herb', 'multi', 'mixed'].map(function (k) {
      var m = MODES[k];
      return '<button type="button" class="q-mode' + (selectedMode === k ? ' is-active' : '') + '"' +
        ' data-mode="' + k + '" style="--a:' + escAttr(m.accent) + '" aria-pressed="' + (selectedMode === k) + '">' +
        '<span class="q-mode-num">' + esc(m.no) + '</span>' +
        '<span class="q-mode-check">已选</span>' +
        '<strong>' + esc(m.name) + '</strong>' +
        '<p>' + esc(m.desc) + '</p>' +
        '</button>';
    }).join('');
    els.modes.innerHTML = html;
  }

  function renderCounts() {
    if (!els.counts) return;
    els.counts.innerHTML = COUNTS.map(function (n) {
      return '<button type="button" class="' + (selectedCount === n ? 'is-active' : '') + '"' +
        ' data-count="' + n + '" aria-pressed="' + (selectedCount === n) + '">' + n + ' 题</button>';
    }).join('');
  }

  function updateScopeNote() {
    if (!els.scopeNote) return;
    var s = scopeByKey(selectedScope) || scopeList[0];
    var text = selectedScope ? '本范围共 ' + s.count + ' 味药' : '全站共 ' + s.count + ' 味药';
    if (selectedCount > s.count) text += '，本轮最多出 ' + s.count + ' 题';
    els.scopeNote.textContent = text;
  }

  function updateScopeVisibility() {
    if (els.scopeWrap) els.scopeWrap.hidden = selectedMode !== 'herb2fx';
    updateScopeNote();
  }

  function renderScopes() {
    if (!els.scopes) return;
    els.scopes.innerHTML = scopeList.map(function (s) {
      var on = selectedScope === s.key;
      return '<button type="button" class="' + (on ? 'is-active' : '') + '"' +
        ' data-scope="' + escAttr(s.key) + '" aria-pressed="' + on + '"' +
        ' title="' + escAttr(s.full) + '">' + esc(s.label) +
        '<em>' + s.count + '</em></button>';
    }).join('');
    updateScopeVisibility();
  }

  /* ---------------- 答题流程 ---------------- */
  function startRound(mode, count, questions, scopeKey) {
    var key = mode === 'herb2fx' ? (scopeKey == null ? selectedScope : scopeKey) : '';
    var scopeHerbs = key ? (scopeByKey(key) || {}).herbs : null;
    var qs = questions || buildQuestions(mode, count, scopeHerbs);
    if (!qs.length) {
      window.alert('题目生成失败，请重试或换一个题型。');
      return;
    }
    round = {
      mode: mode,
      scope: key,
      questions: qs,
      index: 0,
      answered: false,
      picked: [],
      correctCount: 0,
      score: 0,
      wrongList: []
    };
    if (els.setup) els.setup.hidden = true;
    if (els.result) els.result.hidden = true;
    if (els.game) els.game.hidden = false;
    renderQuestion();
    scrollToPanel(els.game);
  }

  function scrollToPanel(el) {
    if (!el) return;
    try { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    catch (e) { el.scrollIntoView(); }
  }

  function updateProgress() {
    if (!round) return;
    var total = round.questions.length;
    var done = round.index + (round.answered ? 1 : 0);
    if (els.progressBar) els.progressBar.style.width = (done / total * 100) + '%';
    if (els.progressText) {
      els.progressText.textContent = '第 ' + (round.index + 1) + ' / ' + total + ' 题';
    }
    if (els.score) els.score.textContent = round.score;
  }

  function renderQuestion() {
    var q = round.questions[round.index];
    var m = MODES[q.mode] || MODES.mixed;
    round.picked = [];

    if (els.modeChip) {
      els.modeChip.textContent = m.name;
      els.modeChip.style.setProperty('--a', m.accent);
    }
    updateProgress();

    if (els.question) {
      els.question.innerHTML = '<h3>' + promptHTML(q.prompt) + '</h3>' +
        (q.meta ? '<p class="q-qmeta">' + esc(q.meta) + '</p>' : '');
    }

    if (els.options) {
      els.options.innerHTML = q.options.map(function (opt, i) {
        return '<button type="button" class="q-opt" data-i="' + i + '"' +
          (q.multi ? ' aria-pressed="false"' : '') + '>' +
          '<span class="q-opt-key">' + (i + 1) + '</span>' +
          '<span class="q-opt-txt">' + esc(opt) + '</span>' +
          '<span class="q-opt-flag"></span>' +
          '</button>';
      }).join('');
    }

    if (els.hint) {
      els.hint.textContent = q.multi
        ? '按 1–6 勾选 · Enter 提交 · 全部选对才得分'
        : '按 1–4 作答 · Enter 下一题';
    }

    if (els.feedback) {
      els.feedback.hidden = true;
      els.feedback.innerHTML = '';
    }
    if (els.next) {
      els.next.disabled = true;
      els.next.textContent = q.multi
        ? '提交答案'
        : (round.index + 1 >= round.questions.length ? '查看本轮成绩 →' : '下一题 →');
    }
  }

  function optionNodes() {
    return els.options
      ? Array.prototype.slice.call(els.options.querySelectorAll('.q-opt'))
      : [];
  }

  function setFlag(node, text) {
    var f = node.querySelector('.q-opt-flag');
    if (f) f.textContent = text;
  }

  function selectOption(i) {
    if (!round || round.answered) return;
    var q = round.questions[round.index];
    if (i < 0 || i >= q.options.length) return;

    round.answered = true;
    optionNodes().forEach(function (node) {
      var idx = parseInt(node.getAttribute('data-i'), 10);
      node.disabled = true;
      if (idx === q.answer) {
        node.classList.add('is-correct');
        setFlag(node, '正确答案');
      } else if (idx === i) {
        node.classList.add('is-wrong');
        setFlag(node, '你的选择');
      }
    });

    finishAnswer(q, i, i === q.answer);
  }

  function toggleOption(i) {
    if (!round || round.answered) return;
    var q = round.questions[round.index];
    if (!q.multi) { selectOption(i); return; }
    if (i < 0 || i >= q.options.length) return;

    var pos = round.picked.indexOf(i);
    if (pos > -1) round.picked.splice(pos, 1);
    else round.picked.push(i);

    var on = round.picked.indexOf(i) > -1;
    var node = els.options ? els.options.querySelector('.q-opt[data-i="' + i + '"]') : null;
    if (node) {
      node.classList.toggle('is-picked', on);
      node.setAttribute('aria-pressed', on ? 'true' : 'false');
    }

    if (els.next) {
      els.next.disabled = round.picked.length === 0;
      els.next.textContent = round.picked.length
        ? '提交答案 · 已选 ' + round.picked.length + ' 项'
        : '提交答案';
    }
  }

  function submitMulti() {
    if (!round || round.answered) return;
    var q = round.questions[round.index];
    if (!q.multi || !round.picked.length) return;

    round.answered = true;
    var chosen = round.picked.slice().sort(function (a, b) { return a - b; });
    var answer = q.answer.slice().sort(function (a, b) { return a - b; });
    var ok = chosen.length === answer.length && chosen.every(function (v, i) {
      return v === answer[i];
    });

    var chosenMap = {};
    var answerMap = {};
    chosen.forEach(function (i) { chosenMap[i] = 1; });
    answer.forEach(function (i) { answerMap[i] = 1; });

    optionNodes().forEach(function (node) {
      var idx = parseInt(node.getAttribute('data-i'), 10);
      node.disabled = true;
      node.classList.remove('is-picked');
      if (answerMap[idx]) {
        node.classList.add('is-correct');
        if (chosenMap[idx]) setFlag(node, '选对');
        else { node.classList.add('is-missed'); setFlag(node, '漏选'); }
      } else if (chosenMap[idx]) {
        node.classList.add('is-wrong');
        setFlag(node, '错选');
      }
    });

    finishAnswer(q, chosen, ok);
  }

  function finishAnswer(q, chosen, ok) {
    var removed = false;

    store.stats.answered++;
    if (ok) {
      round.correctCount++;
      round.score += 10;
      store.stats.correct++;
      if (q.fromWrong) {
        var wi = wrongIndex(q.key);
        if (wi > -1) { store.wrong.splice(wi, 1); removed = true; }
      }
    } else {
      addWrong(q, chosen);
      round.wrongList.push({ q: q, chosen: chosen });
    }
    persist();
    renderStats();
    renderWrong();

    if (els.feedback) {
      els.feedback.innerHTML = feedbackHTML(q, chosen, ok, removed);
      els.feedback.hidden = false;
    }
    updateProgress();
    if (els.next) {
      els.next.disabled = false;
      els.next.textContent = round.index + 1 >= round.questions.length ? '查看本轮成绩 →' : '下一题 →';
      try { els.next.focus({ preventScroll: true }); } catch (e) {}
    }
  }

  function fbRow(k, v) {
    return v ? '<div class="q-fb-row"><dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd></div>' : '';
  }

  function herbHref(h) {
    return h.p ? escAttr(h.p) + '#herb-' + encodeURIComponent(h.n) : '';
  }

  function herbCardHTML(h, rows) {
    var page = pageByFile[h.p] || {};
    var accent = page.accent || '#a97c33';
    var tags = [page.short, h.cat, h.g].filter(Boolean).join(' · ');
    var href = herbHref(h);
    var link = href ? '<a class="q-fb-link" href="' + href + '">在导图中查看「' +
      esc(h.n) + '」→</a>' : '';

    return '<div class="q-fb-card" style="--a:' + escAttr(accent) + '">' +
        '<div class="q-fb-name"><strong>' + esc(h.n) + '</strong>' +
          (h.t ? '<em>' + esc(h.t) + '</em>' : '') +
        '</div>' +
        (tags ? '<div class="q-fb-tags">' + esc(tags) + '</div>' : '') +
        '<div class="q-fb-rows">' + rows + '</div>' +
        link +
      '</div>';
  }

  function multiFeedbackHTML(q) {
    if (q.kind === 'herbfx' && q.herb) {
      var h = q.herb;
      return herbCardHTML(h,
        fbRow('功效', h.gx) + fbRow('主证', h.zz) +
        fbRow('特长', h.tx) + fbRow('注意', h.note));
    }

    var title = q.kind === 'cat'
      ? '属于「' + q.category + '」的药有：'
      : '具有「' + q.term + '」功效的药有：';

    var list = (q.herbs || []).map(function (herb) {
      var href = herbHref(herb);
      var name = '<strong>' + esc(herb.n) + '</strong>' +
        (herb.t ? '<em>' + esc(herb.t) + '</em>' : '') +
        (href ? '<span class="q-fb-herb-go">导图 →</span>' : '');
      var head = href
        ? '<a class="q-fb-herb-name" href="' + href + '">' + name + '</a>'
        : '<div class="q-fb-herb-name">' + name + '</div>';
      return '<div class="q-fb-herb-row">' + head +
        (herb.gx ? '<p>' + esc(herb.gx) + '</p>' : '') + '</div>';
    }).join('');

    return '<div class="q-fb-list"><p class="q-fb-list-title">' + esc(title) + '</p>' +
      list + '</div>';
  }

  function feedbackHTML(q, chosen, ok, removed) {
    var extra = '';
    if (q.multi && !ok) {
      var chosenMap = {};
      var answerMap = {};
      indexList(chosen).forEach(function (i) { chosenMap[i] = 1; });
      indexList(q.answer).forEach(function (i) { answerMap[i] = 1; });
      var missed = indexList(q.answer).filter(function (i) { return !chosenMap[i]; }).length;
      var wrong = indexList(chosen).filter(function (i) { return !answerMap[i]; }).length;
      var parts = [];
      if (missed) parts.push('漏选 ' + missed + ' 项');
      if (wrong) parts.push('错选 ' + wrong + ' 项');
      if (parts.length) extra = '<span class="q-fb-note">' + esc(parts.join(' · ')) + '</span>';
    }

    var head = '<div class="q-fb-head ' + (ok ? 'is-ok' : 'is-bad') + '">' +
        '<b>' + (ok ? '答对了' : '答错了') + '</b>' +
        '<span>正确答案：<strong>' + esc(optionText(q.options, q.answer)) + '</strong></span>' +
        extra +
        (removed ? '<span class="q-fb-remove">已从错题集移除</span>' : '') +
      '</div>';

    if (q.multi) return head + multiFeedbackHTML(q);

    var h = q.herb || {};
    var rows = '';
    if (q.mode === 'fx2herb' && q.term) rows += fbRow('关键词', q.term);
    rows += fbRow('功效', h.gx);
    rows += fbRow('主证', h.zz);
    rows += fbRow('特长', h.tx);
    rows += fbRow('注意', h.note);

    return head + herbCardHTML(h, rows);
  }

  function addWrong(q, chosen) {
    var existing = wrongIndex(q.key);
    if (existing > -1) {
      var old = store.wrong[existing];
      old.chosen = chosen;
      old.ts = Date.now();
      old.count = (old.count || 1) + 1;
      return;
    }
    store.wrong.unshift({
      key: q.key,
      mode: q.mode,
      prompt: q.prompt,
      meta: q.meta || '',
      options: q.options.slice(),
      answer: q.answer,
      multi: !!q.multi,
      kind: q.kind || '',
      category: q.category || '',
      herbName: q.herb ? q.herb.n : '',
      herbNames: (q.herbs || []).map(function (h) { return h.n; }),
      term: q.term || '',
      chosen: chosen,
      ts: Date.now(),
      count: 1
    });
    if (store.wrong.length > WRONG_LIMIT) store.wrong.length = WRONG_LIMIT;
  }

  function nextQuestion() {
    if (!round || !round.answered) return;
    if (round.index + 1 >= round.questions.length) { finishRound(); return; }
    round.index++;
    round.answered = false;
    renderQuestion();
  }

  function finishRound() {
    var finished = round;
    var total = finished.questions.length;
    var pct = Math.round(finished.correctCount / total * 100);
    if (pct > store.stats.best) store.stats.best = pct;
    persist();
    renderStats();

    if (els.game) els.game.hidden = true;
    if (els.result) {
      els.result.hidden = false;
      els.result.innerHTML = resultHTML(finished, pct);
    }
    renderWrong();
    scrollToPanel(els.result);
    lastRound = finished;
    round = null;
  }

  function resultHTML(r, pct) {
    var ring = pct >= 80 ? '#2f8a63' : (pct >= 60 ? '#a97c33' : '#b23f31');
    var msg;
    if (pct >= 90) msg = '几乎全对，可以去导图里读一读「组内怎么分」了。';
    else if (pct >= 70) msg = '主线已经稳了，错的题正好补上盲区。';
    else if (pct >= 50) msg = '框架有了，建议把错题所在的那一组再看一遍。';
    else msg = '先别急着刷题，回到对应导图把分类轴过一遍再来。';

    var wrongHTML = '';
    if (r.wrongList.length) {
      wrongHTML = '<div class="q-result-wrong"><h3>本轮错题 · ' + r.wrongList.length + ' 道</h3>' +
        '<div class="q-wrong-list">' + r.wrongList.map(function (w) {
          var m = MODES[w.q.mode] || MODES.mixed;
          return '<div class="q-wrong-item" style="--a:' + escAttr(m.accent) + '">' +
            '<span class="q-wrong-mode">' + esc(m.name) + '</span>' +
            '<p class="q-wrong-prompt">' + esc(w.q.prompt) +
              (w.q.meta ? '<small>' + esc(w.q.meta) + '</small>' : '') + '</p>' +
            '<div class="q-wrong-ans">' +
              '<span class="bad">你答：' + esc(optionText(w.q.options, w.chosen)) + '</span>' +
              '<span class="good">正确：' + esc(optionText(w.q.options, w.q.answer)) + '</span>' +
            '</div>' +
          '</div>';
        }).join('') + '</div></div>';
    }

    var againLabel = r.mode === 'wrong' ? '再练一组错题' : '再来一轮';
    var actions = '<button type="button" class="primary" data-act="again">' + againLabel + '</button>';
    if (r.wrongList.length && r.mode !== 'wrong') {
      actions += '<button type="button" data-act="practice-wrong">只练本轮错题（' + r.wrongList.length + '）</button>';
    }
    actions += '<button type="button" data-act="setup">返回选择题型</button>';

    return '<div class="q-result-top">' +
        '<div class="q-score-ring" style="--pct:' + pct + ';--ring:' + ring + '"><div>' +
          '<b>' + pct + '%</b><span>正确率</span>' +
        '</div></div>' +
        '<div class="q-result-copy">' +
          '<h2>答对 ' + r.correctCount + ' / ' + r.questions.length + ' 题，得分 ' + r.score + '</h2>' +
          '<p>' + esc(msg) + '<br>' +
            (r.correctCount === r.questions.length
              ? '本轮全对，继续保持。'
              : '本轮错题已自动收进错题集，答对错题集的题目会自动移出。') + '</p>' +
        '</div>' +
      '</div>' +
      '<div class="q-result-actions">' + actions + '</div>' +
      wrongHTML;
  }

  function showSetup() {
    round = null;
    if (els.game) els.game.hidden = true;
    if (els.result) els.result.hidden = true;
    if (els.setup) els.setup.hidden = false;
    scrollToPanel(els.setup);
  }

  /* ---------------- 错题集 ---------------- */
  function entryToQuestion(e) {
    var h = e.herbName ? (herbByName[e.herbName] || { n: e.herbName }) : null;
    var herbs = (Array.isArray(e.herbNames) ? e.herbNames : []).map(function (n) {
      return herbByName[n] || { n: n };
    });
    if (!herbs.length && h) herbs = [h];
    return {
      key: e.key,
      mode: e.mode,
      prompt: e.prompt,
      meta: e.meta || '',
      options: e.options.slice(),
      answer: e.answer,
      multi: !!e.multi,
      kind: e.kind || '',
      category: e.category || '',
      herb: h,
      herbs: herbs,
      term: e.term || '',
      fromWrong: true
    };
  }

  function renderWrong() {
    if (!els.wrongList) return;
    var list = store.wrong;
    if (els.wrongBadge) {
      els.wrongBadge.textContent = list.length;
      els.wrongBadge.hidden = list.length === 0;
    }
    if (els.wrongTools) {
      els.wrongTools.innerHTML = list.length
        ? '<button type="button" data-act="redo-all">重做全部错题（' + list.length + '）</button>' +
          '<button type="button" class="ghost" data-act="clear">清空错题集</button>'
        : '';
    }
    if (!list.length) {
      els.wrongList.innerHTML = '<div class="q-wrong-empty"><b>错题集是空的</b>' +
        '答错的题会自动收进来，在这里重做；答对后会自动移出。</div>';
      return;
    }
    els.wrongList.innerHTML = list.map(function (e) {
      var m = MODES[e.mode] || MODES.mixed;
      var chosen = optionText(e.options, e.chosen);
      var answer = optionText(e.options, e.answer);
      return '<div class="q-wrong-item" data-key="' + escAttr(e.key) + '" style="--a:' + escAttr(m.accent) + '">' +
          '<span class="q-wrong-mode">' + esc(m.name) + '</span>' +
          '<p class="q-wrong-prompt">' + esc(e.prompt) +
            (e.meta ? '<small>' + esc(e.meta) + '</small>' : '') + '</p>' +
          '<div class="q-wrong-ans">' +
            '<span class="bad">你答：' + esc(chosen) + '</span>' +
            '<span class="good">正确：' + esc(answer) + '</span>' +
          '</div>' +
          '<div class="q-wrong-foot">' +
            '<span>答错 ' + (e.count || 1) + ' 次 · 最近 ' + esc(dateText(e.ts)) + '</span>' +
            '<span class="q-wrong-actions">' +
              '<button type="button" data-act="redo">重做</button>' +
              '<button type="button" class="del" data-act="del">移除</button>' +
            '</span>' +
          '</div>' +
        '</div>';
    }).join('');
  }

  function removeWrong(key) {
    var i = wrongIndex(key);
    if (i > -1) { store.wrong.splice(i, 1); persist(); renderWrong(); renderStats(); }
  }

  /* ---------------- 事件绑定 ---------------- */
  function bind() {
    if (els.modes) {
      els.modes.addEventListener('click', function (e) {
        var btn = e.target.closest('.q-mode');
        if (!btn) return;
        selectedMode = btn.getAttribute('data-mode');
        store.prefs.mode = selectedMode;
        persist();
        var all = els.modes.querySelectorAll('.q-mode');
        for (var i = 0; i < all.length; i++) {
          var on = all[i] === btn;
          all[i].classList.toggle('is-active', on);
          all[i].setAttribute('aria-pressed', on ? 'true' : 'false');
        }
        updateScopeVisibility();
      });
    }

    if (els.scopes) {
      els.scopes.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-scope]');
        if (!btn) return;
        selectedScope = btn.getAttribute('data-scope') || '';
        store.prefs.scope = selectedScope;
        persist();
        var all = els.scopes.querySelectorAll('[data-scope]');
        for (var i = 0; i < all.length; i++) {
          var on = all[i] === btn;
          all[i].classList.toggle('is-active', on);
          all[i].setAttribute('aria-pressed', on ? 'true' : 'false');
        }
        updateScopeNote();
      });
    }

    if (els.counts) {
      els.counts.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-count]');
        if (!btn) return;
        selectedCount = parseInt(btn.getAttribute('data-count'), 10);
        store.prefs.count = selectedCount;
        persist();
        var all = els.counts.querySelectorAll('[data-count]');
        for (var i = 0; i < all.length; i++) {
          var on = all[i] === btn;
          all[i].classList.toggle('is-active', on);
          all[i].setAttribute('aria-pressed', on ? 'true' : 'false');
        }
        updateScopeNote();
      });
    }

    if (els.start) {
      els.start.addEventListener('click', function () {
        startRound(selectedMode, selectedCount);
      });
    }

    if (els.options) {
      els.options.addEventListener('click', function (e) {
        var btn = e.target.closest('.q-opt');
        if (!btn || btn.disabled || !round) return;
        var i = parseInt(btn.getAttribute('data-i'), 10);
        if (round.questions[round.index].multi) toggleOption(i);
        else selectOption(i);
      });
    }

    if (els.next) {
      els.next.addEventListener('click', function () {
        if (round && !round.answered) submitMulti();
        else nextQuestion();
      });
    }

    if (els.quit) {
      els.quit.addEventListener('click', function () {
        if (!round) { showSetup(); return; }
        var started = round.index > 0 || round.answered;
        if (started && !window.confirm('退出本轮？已答题目仍会计入累计成绩。')) return;
        showSetup();
      });
    }

    if (els.result) {
      els.result.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-act]');
        if (!btn) return;
        var act = btn.getAttribute('data-act');
        if (act === 'again') {
          if (lastRound && lastRound.mode === 'wrong') {
            var entries = store.wrong.slice(0, 50);
            if (!entries.length) { showSetup(); return; }
            startRound('wrong', entries.length, entries.map(entryToQuestion));
          } else if (lastRound) {
            startRound(lastRound.mode, lastRound.questions.length, null, lastRound.scope);
          } else {
            startRound(selectedMode, selectedCount);
          }
        } else if (act === 'practice-wrong') {
          var qs = (lastRound ? lastRound.wrongList : []).map(function (w) {
            var q = w.q;
            return {
              key: q.key, mode: q.mode, prompt: q.prompt, meta: q.meta,
              options: q.options.slice(), answer: q.answer,
              multi: !!q.multi, kind: q.kind || '', category: q.category || '',
              herb: q.herb, herbs: q.herbs, term: q.term, fromWrong: true
            };
          });
          if (qs.length) startRound('wrong', qs.length, qs);
        } else if (act === 'setup') {
          showSetup();
        }
      });
    }

    if (els.wrongTools) {
      els.wrongTools.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-act]');
        if (!btn) return;
        var act = btn.getAttribute('data-act');
        if (act === 'redo-all') {
          var entries = store.wrong.slice(0, 50);
          if (!entries.length) return;
          startRound('wrong', entries.length, entries.map(entryToQuestion));
        } else if (act === 'clear') {
          if (!window.confirm('清空全部错题？此操作不可撤销。')) return;
          store.wrong = [];
          persist();
          renderWrong();
          renderStats();
        }
      });
    }

    if (els.wrongList) {
      els.wrongList.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-act]');
        if (!btn) return;
        var item = btn.closest('.q-wrong-item');
        if (!item) return;
        var key = item.getAttribute('data-key');
        var act = btn.getAttribute('data-act');
        if (act === 'del') {
          removeWrong(key);
        } else if (act === 'redo') {
          var i = wrongIndex(key);
          if (i > -1) startRound('wrong', 1, [entryToQuestion(store.wrong[i])]);
        }
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (!round || !els.game || els.game.hidden) return;
      var q = round.questions[round.index];
      if (!round.answered) {
        if (/^[1-9]$/.test(e.key)) {
          var i = parseInt(e.key, 10) - 1;
          if (i < q.options.length) {
            e.preventDefault();
            if (q.multi) toggleOption(i);
            else selectOption(i);
          }
        } else if (q.multi && e.key === 'Enter') {
          e.preventDefault();
          submitMulti();
        }
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        nextQuestion();
      }
    });
  }

  /* ---------------- 启动 ---------------- */
  function init() {
    els = {
      stats: $('quizStats'),
      setup: $('quizSetup'),
      modes: $('quizModes'),
      scopeWrap: $('quizScopeWrap'),
      scopes: $('quizScopes'),
      scopeNote: $('quizScopeNote'),
      counts: $('quizCounts'),
      start: $('quizStart'),
      game: $('quizGame'),
      modeChip: $('gameMode'),
      progressText: $('gameProgressText'),
      progressBar: $('gameProgressBar'),
      score: $('gameScore'),
      quit: $('gameQuit'),
      question: $('gameQuestion'),
      options: $('gameOptions'),
      feedback: $('gameFeedback'),
      next: $('gameNext'),
      hint: $('gameHint'),
      result: $('quizResult'),
      wrongBadge: $('wrongCountBadge'),
      wrongTools: $('wrongTools'),
      wrongList: $('wrongList')
    };

    renderStats();
    renderModes();
    renderScopes();
    renderCounts();
    renderWrong();
    bind();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();