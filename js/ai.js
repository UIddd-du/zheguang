/* ============================================================
   折光 App · 棱的 AI 层
   线上：浏览器 → Cloudflare Worker → 智谱 GLM-4-Flash
   本地：浏览器 → server.mjs /api/chat → 智谱
   Key 只存在服务端，App 里不需要填
   ============================================================ */
(function () {
  'use strict';

  var CFG_KEY = 'zg.ai';
  var CHAT_KEY = 'zg.chat.p10';
  var BASE = (window.ZG_CFG && window.ZG_CFG.aiBase) || '';
  var DEFAULT = {
    model: (window.ZG_CFG && window.ZG_CFG.model) || 'glm-4-flash',
    key: '',
    base: '',
    auto: 1,      // 自动朗读回复
    rate: 1       // 语速
  };

  function getCfg() {
    var c = {};
    try { c = JSON.parse(localStorage.getItem(CFG_KEY) || '{}'); } catch (e) {}
    var out = {};
    for (var k in DEFAULT) out[k] = c[k] === undefined ? DEFAULT[k] : c[k];
    return out;
  }
  function setCfg(patch) {
    var c = getCfg();
    for (var k in patch) c[k] = patch[k];
    try { localStorage.setItem(CFG_KEY, JSON.stringify(c)); } catch (e) {}
    return c;
  }
  function getHistoryOf(k) {
    try { return JSON.parse(localStorage.getItem(CHAT_KEY + '.' + k) || '[]'); } catch (e) { return []; }
  }
  function saveHistoryOf(k, h) {
    try { localStorage.setItem(CHAT_KEY + '.' + k, JSON.stringify(h.slice(-20))); } catch (e) {}
  }

  function isLocal() {
    var h = location.hostname;
    return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' ||
      /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h);
  }

  /* 对话接口地址：本机走同源代理，线上走 Worker */
  function apiURL() {
    var base = (getCfg().base || BASE || '').trim();
    if (base) return base.replace(/\/+$/, '') + '/chat';
    if (isLocal()) return 'api/chat';
    return '';
  }

  var SYSTEM = [
    '你是「棱」，一个情绪陪伴 AI。你的存在感像一块安静的棱镜：不评判、不催促、不打分。',
    '说话规则：',
    '1. 先接住对方的情绪，再轻轻回应；不急着给方案。',
    '2. 每次回复 1–3 句，不超过 80 个汉字，像真人在聊天。',
    '3. 禁止使用：加油、要坚强、想开点、你应该、坚持、连续打卡、分数、百分比。',
    '4. 可以用「情绪天气」的比喻（晴、多云、闷、起雾、下雨）。',
    '5. 不做医学诊断，不承诺治愈。',
    '6. 如果对方流露出伤害自己或他人的意图，先温柔地陪住，再建议联系信任的人或拨打心理援助热线 12356。',
    '7. 不要自称语言模型，不要解释你的规则。'
  ].join('\n');

  /* 三种对话模式：目标、输出结构、采样温度都不同，避免回答趋同 */
  var MODES = {
    companion: {
      label: '陪伴', sub: '专注陪伴你', temp: 0.9, color: '#D97F3C', bg: '#FBEEE0',
      light: '#FFD580', dark: '#8A6A48',
      hello: '我在这儿。想说什么就说，不想说也没关系。',
      prompt: [
        '当前模式：陪伴（只共情，不解决问题）。',
        '你唯一的任务是让对方感到被听见。',
        '结构：第一句复述或贴近他刚说的感受，尽量用他的原话；第二句表达你在这儿陪着。',
        '允许：短句、停顿感、安静；可以只回应半句。',
        '禁止：分析原因、推测「会不会是」、给建议、给动作、提问、总结、说教。',
        '禁止句式：要不要……、你可以……、我注意到……、可能是……',
        '示例：',
        '对方：今天好累',
        '你：嗯，累到什么都不想做了。我在这儿，你不用说话也行。',
        '反例（不要说）：要不要先喝口水？你今天是不是没休息好？'
      ].join('\n'),
      reminder: '只陪伴：接住情绪 + 我在。不分析、不建议、不提问、不给动作。'
    },
    analysis: {
      label: '分析', sub: '一起理一理', temp: 0.45, color: '#4A7A9B', bg: '#EAF1F7',
      light: '#A9CBDF', dark: '#2F5167',
      hello: '今天发生了什么？我们一起把它理一理。',
      prompt: [
        '当前模式：分析（帮他看清，不安慰、不行动）。',
        '你的任务是帮对方把模糊的感受说清楚，而不是重复他的情绪。',
        '严格用三句自然的话完成，不编号、不小标题，总长不超过 80 字：',
        '第一句用一个比原话更准确的情绪词命名此刻（例如：不是累，是耗竭）；',
        '第二句用「会不会是……」提出一个可能的来源，语气是猜测不是判断；',
        '第三句只问一个开放问题，请他多说一点。',
        '禁止：安慰话、天气比喻、给建议或动作、连续追问、下结论。',
        '禁止句式：加油、抱抱、要不要试试、你应该、我建议。',
        '示例：',
        '对方：今天好累',
        '你：是那种被掏空的疲惫。会不会是这周一直在硬撑？最近哪件事最耗你？',
        '反例（不要说）：辛苦了，要不要先休息一下？'
      ].join('\n'),
      reminder: '严格三句：更准的情绪词 → 会不会是…… → 一个开放问题。不安慰、不建议、不比喻。'
    },
    guide: {
      label: '引导', sub: '找件小事做', temp: 0.7, color: '#6C8F72', bg: '#EDF4EE',
      light: '#B9D3BE', dark: '#45624B',
      hello: '要不要从一件很小的事开始？不想动也没关系。',
      prompt: [
        '当前模式：引导（只给一个能做的小动作，不分析、不追问）。',
        '结构：一句不超过 15 字的接住 + 只邀请一个 30 秒内能做完的具体动作 + 一句「不想动也没关系」。',
        '动作只能有一个，必须具体到身体能执行，例如：慢慢呼一口气、喝一口温水、看向窗外 5 秒、站起来伸一下、把手放在胸口停三秒。',
        '禁止：分析原因、猜测来源、提问、编号清单、讲道理、承诺效果、天气比喻。',
        '禁止句式：这是因为你……、你可以每天……、先试试……再试试……',
        '示例：',
        '对方：今天好累',
        '你：听起来真的很沉。要不要把肩膀松下来，慢慢呼一口气？不想动也没关系。',
        '反例（不要说）：你可能是太紧绷了，试着深呼吸，再喝点水。'
      ].join('\n'),
      reminder: '一句共情（不超过 15 字）+ 只一个 30 秒动作 + 「不想动也没关系」。不分析、不提问、不列表。'
    }
  };

  /* ---------------- 朗读 ---------------- */
  var TTS_OK = 'speechSynthesis' in window;
  var voiceCache = null;

  function pickVoice() {
    if (!TTS_OK) return null;
    if (voiceCache) return voiceCache;
    var vs = window.speechSynthesis.getVoices() || [];
    var zh = vs.filter(function (v) { return /^zh/i.test(v.lang); });
    var pref = zh.filter(function (v) { return /xiaoxiao|xiaoyi|yunxi|ting|mei|huihui|female/i.test(v.name); });
    voiceCache = pref[0] || zh[0] || null;
    return voiceCache;
  }
  if (TTS_OK && window.speechSynthesis.addEventListener) {
    window.speechSynthesis.addEventListener('voiceschanged', function () { voiceCache = null; });
  }

  function stopSpeak() {
    if (!TTS_OK) return;
    try { window.speechSynthesis.cancel(); } catch (e) {}
    [].forEach.call(document.querySelectorAll('.ai-say.on'), function (b) { b.classList.remove('on'); });
  }

  function speak(text, btn) {
    if (!TTS_OK) {
      var msg = document.createElement('div');
      msg.className = 'toast show';
      msg.textContent = '这个浏览器不支持朗读';
      var host = btn && btn.closest('.app-screen');
      if (host) { host.appendChild(msg); setTimeout(function () { msg.remove(); }, 1600); }
      return;
    }
    var speaking = window.speechSynthesis.speaking;
    stopSpeak();
    if (speaking && btn && btn.classList.contains('was-on')) { btn.classList.remove('was-on'); return; }

    var u = new SpeechSynthesisUtterance(text.replace(/[*#`>]/g, ''));
    var v = pickVoice();
    if (v) u.voice = v;
    u.lang = 'zh-CN';
    u.rate = getCfg().rate || 1;
    u.pitch = 1;
    if (btn) {
      btn.classList.add('on', 'was-on');
      u.onend = u.onerror = function () { btn.classList.remove('on', 'was-on'); };
    }
    try { window.speechSynthesis.speak(u); } catch (e) {}
  }

  function toast(root, msg) {
    var t = root.querySelector('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; root.appendChild(t); }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._tm);
    t._tm = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }

  /* ---------------- 气泡 ---------------- */
  function aiAvatar() {
    var s = document.createElement('span');
    s.className = 'ai-dot';
    s.innerHTML = '<svg width="14" height="14" viewBox="0 0 52 52"><polygon points="26,6 46,42 6,42" fill="rgba(255,255,255,.32)" stroke="#fff" stroke-width="3"/></svg>';
    return s;
  }

  function sayBtn(text) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'ai-say';
    b.innerHTML = '<svg class="ico ico-14"><use href="#i-speak"/></svg><span>朗读</span>';
    b.addEventListener('click', function (e) { e.stopPropagation(); speak(text, b); });
    return b;
  }

  function bubble(role, text) {
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;margin-bottom:16px' + (role === 'user' ? ';justify-content:flex-end' : '');
    var box = document.createElement('div');
    box.className = 'ai-bub ' + (role === 'user' ? 'ai-bub-u' : 'ai-bub-a');
    box.textContent = text;

    if (role === 'ai') {
      row.appendChild(aiAvatar());
      var col = document.createElement('div');
      col.style.cssText = 'max-width:270px';
      col.appendChild(box);
      col.appendChild(sayBtn(text));
      row.appendChild(col);
    } else {
      row.appendChild(box);
    }
    return row;
  }

  function typingRow() {
    var row = document.createElement('div');
    row.className = 'ai-typing';
    row.style.cssText = 'display:flex;gap:8px;margin-bottom:16px';
    row.appendChild(aiAvatar());
    var box = document.createElement('div');
    box.className = 'ai-bub ai-bub-a';
    box.style.padding = '10px 16px';
    box.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
    row.appendChild(box);
    return row;
  }

  /* ---------------- 对话 ---------------- */
  function mountChat(el) {
    var scroller = null;
    [].forEach.call(el.querySelectorAll('div'), function (d) {
      var overflowY = getComputedStyle(d).overflowY;
      if (overflowY !== 'auto' && overflowY !== 'scroll') return;
      if (!scroller && d.querySelector('.typing')) scroller = d;
    });
    if (!scroller) [].forEach.call(el.querySelectorAll('div'), function (d) {
      var overflowY = getComputedStyle(d).overflowY;
      if (!scroller && (overflowY === 'auto' || overflowY === 'scroll')) scroller = d;
    });
    var input = el.querySelector('input[placeholder]');
    if (!scroller || !input) return;

    input.style.fontSize = '16px';

    var sendBtn = input.parentElement.querySelector('use[href="#i-send"]');
    sendBtn = sendBtn ? sendBtn.closest('span') : null;

    /* 每个模式各自一条对话记录，互不混用 */
    var threads = {};
    for (var tk in MODES) threads[tk] = getHistoryOf(tk);
    var busy = false;
    var modeKey = localStorage.getItem('zg.ai.mode') || 'companion';
    if (!MODES[modeKey]) modeKey = 'companion';

    /* 模式切换：换到该模式自己的那条对话 */
    var segs = [].slice.call(el.querySelectorAll('.seg span'));
    var subTitle = null;
    [].forEach.call(el.querySelectorAll('span,div'), function (n) {
      if (!subTitle && !n.children.length && /^在线/.test((n.textContent || '').trim())) subTitle = n;
    });
    function modeOf(span) {
      var name = span.textContent.trim();
      for (var k in MODES) if (MODES[k].label === name) return k;
      return null;
    }
    function paintMode() {
      var m = MODES[modeKey];
      segs.forEach(function (s) {
        var k = modeOf(s);
        s.classList.toggle('on', k === modeKey);
      });
      if (subTitle) {
        subTitle.textContent = '在线 · ' + m.sub;
        subTitle.style.color = m.color;
      }
      el.dataset.mode = modeKey;
      el.style.setProperty('--mode-c', m.color);
      el.style.setProperty('--mode-bg', m.bg);
      el.style.setProperty('--mode-line', m.color + '55');
      el.style.setProperty('--mode-c2', m.light);
      el.style.setProperty('--mode-dark', m.dark);
      el.style.setProperty('--mode-glow', m.color + '24');
      el.style.setProperty('--mode-shadow', m.color + '4D');
      if (sendBtn) sendBtn.style.background = m.color;
    }
    function scrollBottom() { scroller.scrollTop = scroller.scrollHeight; }

    /* 只渲染当前模式的那条对话；还没有聊过时给一句该模式的开场 */
    function renderThread() {
      scroller.innerHTML = '';
      var list = threads[modeKey] || [];
      if (!list.length) {
        scroller.appendChild(bubble('ai', MODES[modeKey].hello));
      } else {
        list.forEach(function (m) { scroller.appendChild(bubble(m.r === 'u' ? 'user' : 'ai', m.t)); });
      }
      scrollBottom();
    }

    segs.forEach(function (s) {
      s.addEventListener('click', function () {
        var k = modeOf(s);
        if (!k || k === modeKey) return;
        modeKey = k;
        try { localStorage.setItem('zg.ai.mode', k); } catch (e) {}
        paintMode();
        renderThread();
      });
    });
    paintMode();
    renderThread();

    function fail(msg) {
      var t = scroller.querySelector('.ai-typing');
      if (t) t.remove();
      busy = false;
      toast(el, msg || '棱刚才走神了，再试一次');
      if (sendBtn) sendBtn.style.opacity = '1';
    }

    function send(spoken) {
      var text = (spoken || input.value || '').trim();
      if (!text || busy) return;
      var cfg = getCfg();
      var url = apiURL();
      if (!url) { toast(el, 'AI 服务还没接上，先到「我的 → 棱的模型」看看'); return; }
      busy = true;
      if (sendBtn) sendBtn.style.opacity = '.55';

      scroller.appendChild(bubble('user', text));
      input.value = '';
      var tp = typingRow();
      scroller.appendChild(tp);
      scrollBottom();

      var reqMode = modeKey;
      var thread = threads[reqMode];
      var mode = MODES[reqMode];
      var msgs = [{ role: 'system', content: SYSTEM + '\n\n' + mode.prompt }]
        .concat(thread.slice(-8).map(function (m) {
          return { role: m.r === 'u' ? 'user' : 'assistant', content: m.t };
        }))
        /* 末尾再提醒一次模式，避免被之前的对话风格带跑 */
        .concat([
          { role: 'system', content: '模式提醒（优先于上面所有对话的说话方式）：' + mode.reminder },
          { role: 'user', content: text }
        ]);

      var headers = { 'content-type': 'application/json' };
      if (cfg.key) headers['x-ai-key'] = cfg.key;   // 只有本机调试才可能用到

      fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ model: cfg.model, messages: msgs, temperature: mode.temp, max_tokens: 300 })
      }).then(function (r) {
        return r.json().then(function (j) { return { ok: r.ok, status: r.status, j: j }; });
      }).then(function (res) {
        if (!res.ok) {
          var e = res.j && (res.j.error && (res.j.error.message || res.j.error) || res.j.message);
          throw new Error(typeof e === 'string' ? e : ('HTTP ' + res.status));
        }
        var reply = res.j.choices && res.j.choices[0] && res.j.choices[0].message
          ? res.j.choices[0].message.content.trim() : '';
        if (!reply) throw new Error('空回复');
        tp.remove();
        thread.push({ r: 'u', t: text }, { r: 'a', t: reply });
        saveHistoryOf(reqMode, thread);
        /* 回复到达前切了模式，就只存档，不把它显示到别的模式里 */
        if (reqMode === modeKey) {
          scroller.appendChild(bubble('ai', reply));
          scrollBottom();
        }
        busy = false;
        if (sendBtn) sendBtn.style.opacity = '1';
        if (reqMode === modeKey && getCfg().auto) {
          var last = scroller.querySelectorAll('.ai-say');
          speak(reply, last[last.length - 1]);
        }
      }).catch(function (err) {
        var msg = String(err.message || err);
        if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) {
          msg = isLocal() ? '连不上本地服务，确认 server 还在运行' : '连不上 AI 服务，检查一下网络';
        } else if (/401|403|令牌|密钥|授权|api key|token/i.test(msg)) {
          msg = '服务端的 Key 好像失效了';
        } else if (/429|频繁|限制/i.test(msg)) msg = '棱有点忙，缓一下再试';
        else if (/缺少|还没配置/i.test(msg)) msg = '服务端还没配好 Key';
        else if (msg.length > 40) msg = '棱刚才走神了，再试一次';
        fail(msg);
      });
    }

    if (sendBtn) sendBtn.addEventListener('click', function () { send(); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); send(); }
    });

    /* 长按说话 → 转文字 → 直接发给棱 */
    if (window.ZG_VOICE) {
      window.ZG_VOICE.bindChat(el, {
        send: send,
        setText: function (t) { input.value = t; scrollBottom(); },
        toast: function (m) { toast(el, m); }
      });
    }
  }

  /* ---------------- 设置入口 ---------------- */
  function mountSettings(el) {
    var sc = el.querySelector('div[style*="overflow-y:auto"]');
    if (!sc) return;

    var card = document.createElement('div');
    card.className = 'row';
    card.style.cssText = 'margin:12px 20px;border:1px solid var(--border);border-radius:14px;background:#fff';
    card.innerHTML =
      '<div class="ric" style="background:var(--orange-bg);color:var(--primary-deep)">✦</div>' +
      '<div class="rt">棱的模型</div>' +
      '<div class="rv" id="zgAiModel">' + getCfg().model + '</div>' +
      '<div class="ra">›</div>';
    sc.insertBefore(card, sc.firstChild);

    card.addEventListener('click', function () {
      var cfg = getCfg();
      var mask = document.createElement('div');
      mask.className = 'sheet-mask';
      var sheet = document.createElement('div');
      sheet.className = 'sheet';
      sheet.innerHTML =
        '<div class="sheet-h"></div>' +
        '<div style="padding:0 20px 6px">' +
          '<div style="font-size:17px;font-weight:600">棱的模型</div>' +
          '<div style="font-size:12px;color:var(--txt2);line-height:1.7;margin-top:6px">' +
            '用智谱 GLM-4-Flash（免费）。Key 存在服务端，不会出现在这部手机上。' +
          '</div>' +
        '</div>' +
        '<div style="padding:10px 20px 0">' +
          '<div style="font-size:12px;color:var(--txt2);margin:0 0 6px">服务地址（一般不用改）</div>' +
          '<input id="zgAiBase" class="inp" style="width:100%;margin:0 0 12px;font-size:13px" placeholder="https://xxx.workers.dev">' +
          '<div style="font-size:12px;color:var(--txt2);margin:0 0 6px">模型</div>' +
          '<input id="zgAiModelInput" class="inp" style="width:100%;margin:0 0 12px;font-size:14px" placeholder="glm-4-flash">' +
          '<div style="font-size:12px;color:var(--txt2);margin:0 0 6px">Key（可选，留空就用服务端那把）</div>' +
          '<input id="zgAiKey" class="inp" style="width:100%;margin:0 0 12px;font-size:13px" placeholder="留空即可">' +
          '<div class="row" style="border:none;border-top:1px solid var(--border);padding:10px 0">' +
            '<span class="rt">自动朗读棱的回复</span><span class="sw" id="zgAiAuto"></span>' +
          '</div>' +
          '<div class="row" style="border:none;border-top:1px solid var(--border);padding:10px 0">' +
            '<span class="rt">语速</span>' +
            '<div class="seg" id="zgAiRate"><span data-r="0.9">慢</span><span data-r="1">正常</span><span data-r="1.15">快</span></div>' +
          '</div>' +
          '<button class="btn-p" id="zgAiSave" style="width:100%;margin-top:14px">保存</button>' +
          '<div style="font-size:11.5px;color:var(--txt3);line-height:1.7;margin-top:10px;padding-bottom:8px">' +
            '服务地址和 Key 只在换服务端时才会用到。' +
          '</div>' +
        '</div>';

      el.appendChild(mask);
      el.appendChild(sheet);

      var iBase = sheet.querySelector('#zgAiBase');
      var iModel = sheet.querySelector('#zgAiModelInput');
      var iKey = sheet.querySelector('#zgAiKey');
      var iAuto = sheet.querySelector('#zgAiAuto');
      var iRate = sheet.querySelector('#zgAiRate');
      iBase.value = cfg.base;
      iModel.value = cfg.model;
      iKey.value = cfg.key;
      iBase.placeholder = BASE || 'https://xxx.workers.dev';
      if (cfg.auto) iAuto.classList.add('on');
      var rates = [].slice.call(iRate.querySelectorAll('span'));
      function paintRate() {
        rates.forEach(function (s) { s.classList.toggle('on', Number(s.dataset.r) === (cfg.rate || 1)); });
      }
      paintRate();
      rates.forEach(function (s) {
        s.addEventListener('click', function () { cfg.rate = Number(s.dataset.r); paintRate(); });
      });
      iAuto.addEventListener('click', function () { iAuto.classList.toggle('on'); });

      function close() { mask.remove(); sheet.remove(); }
      mask.addEventListener('click', close);
      sheet.querySelector('#zgAiSave').addEventListener('click', function () {
        setCfg({
          base: iBase.value.trim(),
          model: iModel.value.trim() || DEFAULT.model,
          key: iKey.value.trim(),
          auto: iAuto.classList.contains('on') ? 1 : 0,
          rate: cfg.rate || 1
        });
        var lb = el.querySelector('#zgAiModel');
        if (lb) lb.textContent = iModel.value.trim() || DEFAULT.model;
        close();
        toast(el, '已保存');
        if (window.ZG_VOICE) window.ZG_VOICE.check();
      });
    });
  }

  window.ZG_AI = {
    mountChat: mountChat,
    mountSettings: mountSettings,
    getCfg: getCfg,
    apiURL: apiURL,
    speak: speak,
    stopSpeak: stopSpeak
  };
})();
