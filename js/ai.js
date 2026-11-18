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
  function getHistory() {
    try { return JSON.parse(localStorage.getItem(CHAT_KEY) || '[]'); } catch (e) { return []; }
  }
  function saveHistory(h) {
    try { localStorage.setItem(CHAT_KEY, JSON.stringify(h.slice(-20))); } catch (e) {}
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
    s.setAttribute('style', 'width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#F4A261,#E07A3A);flex-shrink:0;display:flex;align-items:center;justify-content:center');
    s.innerHTML = '<svg width="14" height="14" viewBox="0 0 52 52"><polygon points="26,6 46,42 6,42" fill="rgba(255,255,255,.3)" stroke="#fff" stroke-width="3"/></svg>';
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
    box.style.cssText = role === 'user'
      ? 'max-width:270px;background:var(--primary);border-radius:14px 14px 0 14px;padding:12px 16px;font-size:14px;color:#fff;line-height:1.7;white-space:pre-wrap'
      : 'max-width:270px;background:#fff;border:1px solid var(--border);border-radius:0 14px 14px 14px;padding:12px 16px;font-size:14px;line-height:1.7;white-space:pre-wrap';
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
    box.setAttribute('style', 'background:#fff;border:1px solid var(--border);border-radius:0 14px 14px 14px;padding:10px 16px');
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

    var history = getHistory();
    var busy = false;
    var extra = localStorage.getItem('zg.ai.style') || '';
    if (extra) extra = '\n' + extra;

    function scrollBottom() { scroller.scrollTop = scroller.scrollHeight; }

    if (history.length) {
      var seed = scroller.querySelector('.typing');
      if (seed) seed.parentElement.remove();
      history.forEach(function (m) { scroller.appendChild(bubble(m.r === 'u' ? 'user' : 'ai', m.t)); });
      scrollBottom();
    }

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

      var seedTyping = scroller.querySelector('.typing');
      if (seedTyping && !seedTyping.closest('.ai-typing')) seedTyping.closest('div[style*="display:flex"]').remove();

      scroller.appendChild(bubble('user', text));
      input.value = '';
      var tp = typingRow();
      scroller.appendChild(tp);
      scrollBottom();

      var msgs = [{ role: 'system', content: SYSTEM + extra }]
        .concat(history.slice(-10).map(function (m) {
          return { role: m.r === 'u' ? 'user' : 'assistant', content: m.t };
        }))
        .concat([{ role: 'user', content: text }]);

      var headers = { 'content-type': 'application/json' };
      if (cfg.key) headers['x-ai-key'] = cfg.key;   // 只有本机调试才可能用到

      fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ model: cfg.model, messages: msgs, temperature: 0.8, max_tokens: 300 })
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
        scroller.appendChild(bubble('ai', reply));
        scrollBottom();
        history.push({ r: 'u', t: text }, { r: 'a', t: reply });
        saveHistory(history);
        busy = false;
        if (sendBtn) sendBtn.style.opacity = '1';
        if (getCfg().auto) {
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

    [].forEach.call(el.querySelectorAll('.seg span'), function (s) {
      s.addEventListener('click', function () {
        var map = { '陪伴': '', '分析': '这次请多一点结构化的观察，但仍保持 80 字以内。', '引导': '这次可以轻轻给一个很小的可执行动作，不要清单。' };
        extra = map[s.textContent.trim()] || '';
        if (extra) extra = '\n' + extra;
        localStorage.setItem('zg.ai.style', map[s.textContent.trim()] || '');
      });
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
