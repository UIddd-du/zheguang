/* ============================================================
   折光 App · 运行层
   1) 375×812 设计像素等比缩放铺满真机
   2) hash 路由 #/p08 + 200ms 转场 + 返回键可用
   3) 所有交互状态落 localStorage，刷新不丢
   ============================================================ */
(function () {
  'use strict';

  var SCREENS = window.SCREENS || {};
  var stage = document.getElementById('stage');
  var wrap = document.getElementById('stageWrap');
  var app = document.getElementById('app');

  /* ---------------- 缩放 ---------------- */
  function fit() {
    var pad = 0;
    var rect = app.getBoundingClientRect();
    var w = rect.width - pad, h = rect.height - pad;
    var k = Math.min(w / 375, h / 812);
    if (!isFinite(k) || k <= 0) k = 1;
    stage.style.transform = 'scale(' + k + ')';
    wrap.style.width = (375 * k) + 'px';
    wrap.style.height = (812 * k) + 'px';
  }
  window.addEventListener('resize', fit);
  window.addEventListener('orientationchange', function () { setTimeout(fit, 120); });

  /* ---------------- 状态栏 ---------------- */
  var ICONS = '<span class="sicons">'
    + '<svg width="17" height="11" viewBox="0 0 17 11"><rect x="0" y="7" width="3" height="4" rx="1" fill="currentColor"/><rect x="4.5" y="5" width="3" height="6" rx="1" fill="currentColor"/><rect x="9" y="2.5" width="3" height="8.5" rx="1" fill="currentColor"/><rect x="13.5" y="0" width="3" height="11" rx="1" fill="currentColor" opacity=".4"/></svg>'
    + '<svg width="16" height="11" viewBox="0 0 16 12"><path d="M8 9.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3zM8 5.5c-2 0-3.7.7-5 2l1.6 1.8A4.9 4.9 0 018 7.7c1.3 0 2.5.6 3.4 1.6L13 7.5c-1.3-1.3-3-2-5-2zM8 1C4.7 1 1.8 2.2 0 4.3l1.6 1.8A8.9 8.9 0 018 3.2c2.4 0 4.6 1 6.4 2.9L16 4.3C14.2 2.2 11.3 1 8 1z" fill="currentColor"/></svg>'
    + '<svg width="25" height="12" viewBox="0 0 25 12"><rect x="0.5" y="0.5" width="21" height="11" rx="3.5" fill="none" stroke="currentColor" opacity=".5"/><rect x="2" y="2" width="15" height="8" rx="2" fill="currentColor"/><path d="M23 4v4c1-.3 1.6-1 1.6-2S24 4.3 23 4z" fill="currentColor" opacity=".5"/></svg>'
    + '</span>';

  function clock() {
    var d = new Date();
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }
  function sbHTML() { return '<span>' + clock() + '</span>' + ICONS; }

  /* 判断一段背景是否深色 → 状态栏/正文用白字 */
  function isDarkBg(src) {
    var parts = src.match(/rgba?\([\d.,\s]+\)/g);
    if (!parts) return false;
    var sum = 0, cnt = 0;
    parts.forEach(function (p) {
      var v = p.match(/[\d.]+/g).map(Number);
      if (v.length > 3 && v[3] === 0) return;
      sum += v[0] * 0.299 + v[1] * 0.587 + v[2] * 0.114;
      cnt++;
    });
    return cnt > 0 && sum / cnt < 118;
  }

  function topDark(el) {
    var sb = el.querySelector('.statusbar');
    if (!sb) return false;
    var n = sb.parentElement;
    while (n) {
      var cs = getComputedStyle(n);
      var src = (cs.backgroundImage && cs.backgroundImage !== 'none')
        ? cs.backgroundImage
        : (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' ? cs.backgroundColor : '');
      if (src) return isDarkBg(src);
      n = n.parentElement;
    }
    return false;
  }

  /* ---------------- 表情 ---------------- */
  var EMOS = [
    ['😊', '愉悦'], ['🥰', '温暖'], ['😌', '平静'], ['💪', '充实'],
    ['😐', '普通'], ['😔', '低落'], ['😤', '烦躁'], ['😰', '焦虑'],
    ['😩', '疲惫'], ['😢', '难过'], ['🥺', '委屈'], ['😶', '麻木']
  ];

  /* ---------------- 底栏 ---------------- */
  var TABS = [
    ['home', '首页', 'p08', 'M3 10.5L12 3l9 7.5M5 9.5V21h14V9.5', null],
    ['record', '记录', 'p09', null, 'i-record'],
    ['ai', '棱', 'p10', null, 'i-spark'],
    ['growth', '成长', 'p11', null, 'i-grow'],
    ['mine', '我的', 'p12', null, 'i-mine']
  ];
  function tabSvg(t) {
    return t[4]
      ? '<svg class="ico ico-22"><use href="#' + t[4] + '"/></svg>'
      : '<svg class="ic" width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="' + t[3] +
        '" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  function navHTML(act) {
    var h = '';
    TABS.forEach(function (t) {
      h += '<div class="ti' + (act === t[0] ? ' on' : '') + (t[0] === 'ai' ? ' ai' : '') +
        '" data-go="' + t[2] + '"' + (t[0] === 'ai' ? ' aria-label="和棱对话"' : '') + '>' +
        (t[0] === 'record' ? '<span class="rec">' + tabSvg(t) + '</span>' : tabSvg(t)) +
        '<span class="lb">' + t[1] + '</span></div>';
    });
    return h;
  }

  /* ---------------- 28 屏功能总览 ---------------- */
  var DIRECTORY_GROUPS = [
    ['初次见面', ['p01', 'p02', 'p03', 'p04', 'p05', 'p06', 'p07']],
    ['主要功能', ['p08', 'p09', 'p10', 'p11', 'p12', 'p13', 'p14']],
    ['记录与成长', ['p15', 'p16', 'p17', 'p18', 'p19', 'p20', 'p21']],
    ['照顾与设置', ['p22', 'p23', 'p24', 'p25', 'p26', 'p27', 'p28']]
  ];

  function closeDirectory(root) {
    if (!root) return;
    [].forEach.call(root.querySelectorAll('.directory-mask,.directory-panel'), function (el) { el.remove(); });
  }

  function openDirectory(root) {
    if (!root || root.querySelector('.directory-panel')) return;
    var mask = document.createElement('div');
    mask.className = 'directory-mask';
    mask.dataset.directoryClose = '';
    var panel = document.createElement('section');
    panel.className = 'directory-panel';
    panel.setAttribute('aria-label', '全部功能');
    var html = '<div class="directory-head"><div><h2>全部功能</h2><p>原型中的 28 个界面，都可以从这里打开</p></div>' +
      '<button type="button" class="directory-close" data-directory-close aria-label="关闭">×</button></div>' +
      '<div class="directory-scroll">';
    DIRECTORY_GROUPS.forEach(function (group) {
      html += '<h3>' + group[0] + '</h3><div class="directory-grid">';
      group[1].forEach(function (id) {
        if (!SCREENS[id]) return;
        var title = id === 'p10' ? '棱 · AI 对话' : SCREENS[id].title;
        html += '<button type="button" class="directory-item' + (id === 'p10' ? ' featured' : '') + '" data-go="' + id + '">' +
          '<span>' + id.toUpperCase() + '</span><strong>' + title + '</strong></button>';
      });
      html += '</div>';
    });
    panel.innerHTML = html + '</div>';
    root.appendChild(mask);
    root.appendChild(panel);
  }

  /* ---------------- 持久化 ---------------- */
  var BOOL_GROUPS = [
    ['emo', '.emo', 'sel'],
    ['sw', '.sw', 'on'],
    ['chk', '[data-chk]', 'done'],
    ['seg', '.seg span', 'on'],
    ['chip', '.cs-chip', 'sel'],
    ['opt', '.cs-opt', 'sel']
  ];
  var KEY = function (id) { return 'zg.ui.' + id; };

  function collect(root) {
    var st = {};
    BOOL_GROUPS.forEach(function (g) {
      st[g[0]] = [].map.call(root.querySelectorAll(g[1]), function (el) {
        return el.classList.contains(g[2]) ? 1 : 0;
      });
    });
    st.inp = [].map.call(root.querySelectorAll('input.inp,textarea'), function (el) { return el.value; });
    st.rng = [].map.call(root.querySelectorAll('input.rng'), function (el) {
      return { v: el.value, bg: el.style.background };
    });
    st.fold = [].map.call(root.querySelectorAll('[data-fold]'), function (el) {
      var t = document.getElementById(el.dataset.fold);
      return t && t.style.display === 'block' ? 1 : 0;
    });
    return st;
  }

  function save(root) {
    try { localStorage.setItem(KEY(root.dataset.pid), JSON.stringify(collect(root))); } catch (e) {}
  }

  function restore(root) {
    var raw;
    try { raw = JSON.parse(localStorage.getItem(KEY(root.dataset.pid)) || 'null'); } catch (e) { raw = null; }
    if (!raw) return;

    BOOL_GROUPS.forEach(function (g) {
      var list = root.querySelectorAll(g[1]);
      var arr = raw[g[0]] || [];
      [].forEach.call(list, function (el, i) {
        if (!arr[i]) return;
        el.classList.add(g[2]);
        if (g[0] === 'chk') {
          var b = el.querySelector('.box');
          if (b) b.classList.add('done');
        }
      });
    });

    [].forEach.call(root.querySelectorAll('input.inp,textarea'), function (el, i) {
      if (raw.inp && typeof raw.inp[i] === 'string') el.value = raw.inp[i];
    });

    [].forEach.call(root.querySelectorAll('input.rng'), function (el, i) {
      var r = raw.rng && raw.rng[i];
      if (!r) return;
      el.value = r.v;
      if (r.bg) el.style.background = r.bg;
      var wrapEl = el.closest('.rng-wrap');
      var lb = wrapEl && wrapEl.querySelector('.rv');
      if (lb) lb.textContent = el.value;
    });

    [].forEach.call(root.querySelectorAll('[data-fold]'), function (el, i) {
      if (!(raw.fold && raw.fold[i])) return;
      var t = document.getElementById(el.dataset.fold);
      if (t) {
        t.style.display = 'block';
        el.textContent = '－ 收起';
      }
    });
  }

  /* ---------------- 路由 ---------------- */
  var currentEl = null;
  var currentId = null;
  var cleanups = [];

  function parseHash() {
    var id = (location.hash || '').replace(/^#\/?/, '');
    return SCREENS[id] ? id : null;
  }

  function go(id) {
    if (!SCREENS[id] || id === currentId) return;
    if (parseHash() === id) { render(); return; }
    location.hash = '#/' + id;
  }

  function later(fn, ms) {
    var t = setTimeout(fn, ms);
    cleanups.push(function () { clearTimeout(t); });
    return t;
  }

  function mount(id) {
    var s = SCREENS[id];
    if (window.ZG_AI) window.ZG_AI.stopSpeak();
    var el = document.createElement('div');
    el.className = 'phone app-screen in ' + (s.cls || '');
    el.dataset.pid = id;
    if (s.style) el.setAttribute('style', s.style);
    el.innerHTML = s.html;

    /* 状态栏 */
    [].forEach.call(el.querySelectorAll('.statusbar'), function (sb) { sb.innerHTML = sbHTML(); });

    /* 返回箭头图标 */
    [].forEach.call(el.querySelectorAll('.nback'), function (b) {
      b.innerHTML = '<svg class="ico"><use href="#i-back"/></svg>';
    });

    /* 表情网格 */
    [].forEach.call(el.querySelectorAll('[data-emo]'), function (g) {
      g.innerHTML = EMOS.map(function (e) {
        return '<div class="emo"><span class="e-ic">' + e[0] + '</span><span class="e-lb">' + e[1] + '</span></div>';
      }).join('');
    });

    /* AI 对话保留底栏，并给输入区让出导航高度 */
    if (id === 'p10') {
      [].forEach.call(el.querySelectorAll('div[style*="overflow-y:auto"]'), function (d) {
        if (d.querySelector('.typing')) d.style.height = '522px';
      });
      var chatInput = el.querySelector('input[placeholder]');
      if (chatInput && chatInput.parentElement && chatInput.parentElement.parentElement) {
        chatInput.parentElement.parentElement.style.bottom = '64px';
      }
    }

    /* 底栏 */
    var navName = id === 'p10' ? 'ai' : s.nav;
    if (navName) {
      var nav = document.createElement('nav');
      nav.className = 'bnav';
      nav.dataset.nav = navName;
      nav.innerHTML = navHTML(navName);
      el.appendChild(nav);
    }

    /* 滑动条初始态 */
    [].forEach.call(el.querySelectorAll('.rng'), function (r) {
      var upd = function () {
        var p = ((r.value - r.min) / (r.max - r.min)) * 100;
        r.style.background = 'linear-gradient(to right,var(--primary) ' + p + '%,var(--border) ' + p + '%)';
        var wrapEl = r.closest('.rng-wrap');
        var lb = wrapEl && wrapEl.querySelector('.rv');
        if (lb) lb.textContent = r.value;
      };
      r.addEventListener('input', function () { upd(); save(el); });
      upd();
    });

    restore(el);

    /* 挂载 */
    if (currentEl) {
      var old = currentEl;
      old.classList.remove('in');
      old.classList.add('out');
      setTimeout(function () { old.remove(); }, 210);
    }
    stage.appendChild(el);
    var ownCs = getComputedStyle(el);
    if (isDarkBg(ownCs.backgroundImage !== 'none' ? ownCs.backgroundImage : ownCs.backgroundColor)) {
      el.classList.add('dark-page');
    }
    if (topDark(el)) el.classList.add('dark-top');

    /* 滚动区内的底部悬浮按钮 → 吸底，避免遮挡最后一行 */
    [].forEach.call(el.querySelectorAll('div[style*="overflow-y:auto"]'), function (sc) {
      [].forEach.call(sc.children, function (f) {
        var cs = getComputedStyle(f);
        if (cs.position === 'absolute' && cs.bottom === '0px') f.classList.add('dock');
      });
    });

    /* 上一屏清场 */
    cleanups.forEach(function (f) { try { f(); } catch (e) {} });
    cleanups = [];

    currentEl = el;
    currentId = id;

    initScreen(el, id);
  }

  /* ---------------- 各屏专属行为 ---------------- */
  function initScreen(el, id) {
    /* 「我的」置顶全部功能入口，避免二级页面只能靠隐蔽链接发现 */
    if (id === 'p12') {
      var recordBox = el.querySelector('.gtitle + div');
      if (recordBox) {
        var entry = document.createElement('div');
        entry.className = 'row';
        entry.dataset.directory = '';
        entry.innerHTML = '<span class="ric" style="background:var(--orange-bg);color:var(--primary-deep)">' +
          '<svg class="ico"><use href="#i-grid"/></svg></span><span class="rt">全部功能</span>' +
          '<span class="rv">28 个原型界面</span><span class="ra">›</span>';
        recordBox.insertBefore(entry, recordBox.firstChild);
      }
    }

    if (window.ZG_AI) {
      if (id === 'p10') window.ZG_AI.mountChat(el);
      if (id === 'p24') window.ZG_AI.mountSettings(el);
    }
    /* P28 倾诉：进来就开始听，说完就散 */
    if (id === 'p28' && window.ZG_VOICE) {
      cleanups.push(window.ZG_VOICE.mountVent(el, go));
      return;
    }

    /* P01 开场视频 */
    if (id === 'p01') {
      var leave = function () { if (currentId === 'p01') go('p08'); };
      var v = document.createElement('video');
      v.className = 'splash-video';
      v.src = 'assets/open.mp4';
      v.muted = true;
      v.playsInline = true;
      v.setAttribute('playsinline', '');
      v.setAttribute('webkit-playsinline', '');
      v.autoplay = true;
      el.insertBefore(v, el.firstChild);
      v.addEventListener('loadeddata', function () {
        v.classList.add('ready');
        v.play().catch(function () {});
      }, { once: true });
      v.addEventListener('ended', function () { later(leave, 620); }, { once: true });
      v.addEventListener('error', function () { later(leave, 1800); }, { once: true });
      later(leave, 7000);
      return;
    }

    /* P02 引导轮播 */
    var track = el.querySelector('#p02track');
    if (track) {
      var dots = el.querySelectorAll('#p02dots i');
      var btn = el.querySelector('#p02btn');
      var idx = 0;
      var render = function () {
        track.style.transform = 'translateX(-' + (idx * 375) + 'px)';
        [].forEach.call(dots, function (d, i) { d.classList.toggle('on', i === idx); });
        if (btn) btn.textContent = idx === 2 ? '开始使用' : '下一步';
      };
      if (btn) {
        btn.addEventListener('click', function () {
          if (idx < 2) { idx++; render(); } else { go('p03'); }
        });
      }
      [].forEach.call(dots, function (d, i) {
        d.addEventListener('click', function () { idx = i; render(); });
      });
      render();
    }

    /* P03 注册/登录 */
    var tabs = el.querySelectorAll('#p03tab span');
    [].forEach.call(tabs, function (s) {
      s.addEventListener('click', function () {
        [].forEach.call(tabs, function (x) { x.classList.remove('on'); });
        s.classList.add('on');
        [].forEach.call(el.querySelectorAll('.p03-pane'), function (p) { p.classList.remove('on'); });
        var pane = el.querySelector('#pane-' + s.dataset.pane);
        if (pane) pane.classList.add('on');
      });
    });

    /* P22 4-7-8 呼吸 */
    var phaseEl = el.querySelector('#p18phase');
    if (phaseEl) {
      var num = el.querySelector('#p18num');
      var round = el.querySelector('#p18round');
      var bar = el.querySelector('#p18bar');
      var SEQ = [['吸气', 4], ['屏住', 7], ['呼气', 8]];
      var si = 0, cnt = SEQ[0][1], rd = 1, tick = 0;
      var timer = setInterval(function () {
        cnt--;
        if (cnt <= 0) {
          si = (si + 1) % 3;
          if (si === 0) { rd = rd % 4 + 1; if (round) round.textContent = rd; }
          phaseEl.textContent = SEQ[si][0];
          cnt = SEQ[si][1];
        }
        if (num) num.textContent = cnt;
        tick++;
        if (bar) bar.style.width = Math.min(100, ((rd - 1) * 19 + (tick % 19) / 19 * 19 + 5)) + '%';
      }, 1000);
      cleanups.push(function () { clearInterval(timer); });
    }
  }

  /* ---------------- Toast ---------------- */
  function showToast(el) {
    var root = el.closest('.app-screen');
    if (!root) return;
    var t = root.querySelector('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; root.appendChild(t); }
    t.textContent = el.dataset.toast;
    t.classList.add('show');
    clearTimeout(t._tm);
    t._tm = setTimeout(function () { t.classList.remove('show'); }, 1600);
  }

  /* ---------------- 全局事件委托 ---------------- */
  document.addEventListener('click', function (e) {
    var t = e.target;

    /* 折叠 */
    var fold = t.closest('[data-fold]');
    if (fold) {
      var target = document.getElementById(fold.dataset.fold);
      if (target) {
        var open = target.style.display !== 'none';
        target.style.display = open ? 'none' : 'block';
        fold.textContent = open ? '＋ 想多说点吗？' : '－ 收起';
        save(fold.closest('.app-screen'));
      }
      return;
    }

    /* 全部功能目录 */
    var closeDir = t.closest('[data-directory-close]');
    if (closeDir) { closeDirectory(closeDir.closest('.app-screen')); return; }
    var openDir = t.closest('[data-directory]');
    if (openDir) { openDirectory(openDir.closest('.app-screen')); return; }

    /* 路由跳转 */
    var goEl = t.closest('[data-go]');
    if (goEl) {
      closeDirectory(goEl.closest('.app-screen'));
      go(goEl.dataset.go);
      return;
    }

    /* 轻提示 */
    var toastEl = t.closest('[data-toast]');
    if (toastEl) { showToast(toastEl); return; }

    var root = t.closest('.app-screen');
    if (!root) return;

    /* 单选：冷启动标签 / 选项 */
    var chip = t.closest('.cs-chip');
    if (chip) { chip.classList.toggle('sel'); save(root); return; }

    var opt = t.closest('.cs-opt');
    if (opt) {
      [].forEach.call(opt.parentElement.querySelectorAll('.cs-opt'), function (o) { o.classList.remove('sel'); });
      opt.classList.add('sel');
      save(root);
      return;
    }

    /* 行动勾选 */
    var chk = t.closest('[data-chk]');
    if (chk) {
      chk.classList.toggle('done');
      var b = chk.querySelector('.box');
      if (b) b.classList.toggle('done');
      save(root);
      return;
    }

    /* 分段切换 */
    var seg = t.closest('.seg span');
    if (seg) {
      [].forEach.call(seg.parentElement.querySelectorAll('span'), function (s) { s.classList.remove('on'); });
      seg.classList.add('on');
      save(root);
      return;
    }

    /* 开关 */
    var sw = t.closest('.sw');
    if (sw) { sw.classList.toggle('on'); save(root); return; }

    /* 情绪选择 */
    var emo = t.closest('.emo');
    if (emo) {
      [].forEach.call(emo.parentElement.querySelectorAll('.emo'), function (c) { c.classList.remove('sel'); });
      emo.classList.add('sel');
      save(root);
      return;
    }
  });

  /* 输入类：注意不要拦截 tab 切换 */
  document.addEventListener('change', function (e) {
    var root = e.target.closest && e.target.closest('.app-screen');
    if (root) save(root);
  });
  document.addEventListener('input', function (e) {
    if (e.target.matches && e.target.matches('input.rng')) {
      var root = e.target.closest('.app-screen');
      if (root) save(root);
    }
  });

  /* ---------------- 启动 ---------------- */
  function render() {
    var id = parseHash();
    if (!id) {
      history.replaceState(null, '', '#/p01');
      id = 'p01';
    }
    if (id === currentId) return;
    mount(id);
    /* 每次进入回到顶部 */
    window.scrollTo(0, 0);
  }

  window.addEventListener('hashchange', render);
  fit();
  render();
  window.addEventListener('load', fit);
  setTimeout(fit, 60);

  /* 暴露给调试 */
  window.zg = { go: go, fit: fit, screens: SCREENS };

  /* PWA 离线缓存 */
  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }
})();
