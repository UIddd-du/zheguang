/* ============================================================
   折光 App · 语音层
   1) P10「长按说」：按住说话 → 松手把文字发给棱
   2) P28「倾诉」：进来就听，说完不落记录
   3) 朗读：交给 ai.js 的 speak()
   用浏览器原生 Web Speech API，无需联网 Key；需要 HTTPS（localhost 也可以）
   ============================================================ */
(function () {
  'use strict';

  var SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  var cur = null;

  function ok() { return !!SR; }

  function stop() {
    if (!cur) return;
    try { cur.stop(); } catch (e) {}
  }
  function abort() {
    if (!cur) return;
    var c = cur;
    cur = null;
    try { c.abort(); } catch (e) {}
  }

  /* o: { onPartial, onFinal, onEnd, onError } */
  function listen(o) {
    if (!SR) { if (o.onError) o.onError('unsupported'); return null; }
    abort();
    var r = new SR();
    r.lang = 'zh-CN';
    r.interimResults = true;
    r.continuous = false;
    r.maxAlternatives = 1;

    var finalText = '';
    var done = false;

    r.onresult = function (ev) {
      var interim = '';
      for (var i = ev.resultIndex; i < ev.results.length; i++) {
        var t = ev.results[i][0].transcript;
        if (ev.results[i].isFinal) finalText += t;
        else interim += t;
      }
      if (o.onPartial) o.onPartial((finalText + interim).trim());
    };
    r.onerror = function (ev) {
      var code = ev.error || 'error';
      if (code === 'no-speech' || code === 'aborted') { if (o.onError) o.onError(code); return; }
      if (o.onError) o.onError(code);
    };
    r.onend = function () {
      if (done) return;
      done = true;
      cur = null;
      if (o.onEnd) o.onEnd(finalText.trim());
    };

    try { r.start(); } catch (e) { if (o.onError) o.onError('start'); return null; }
    cur = { stop: function () { try { r.stop(); } catch (e) {} }, abort: function () { try { r.abort(); } catch (e) {} } };
    return cur;
  }

  function setLabel(btn, text) {
    [].forEach.call(btn.childNodes, function (n) {
      if (n.nodeType === 3 && n.nodeValue.trim()) n.nodeValue = text;
    });
  }

  /* P10：长按说 */
  function bindChat(el, api) {
    var btn = el.querySelector('[data-go="p28"]');
    if (!btn) return;

    var lp = null, holding = false, rec = null, wd = null, lbTimer = null;

    function reset() {
      clearTimeout(wd);
      clearTimeout(lbTimer);
      btn.classList.remove('rec');
      setLabel(btn, '长按说');
      holding = false;
    }

    btn.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      holding = false;
      clearTimeout(lp);
      lp = setTimeout(function () {
        holding = true;
        btn.classList.add('rec');
        setLabel(btn, '松手发送');
        if (!ok()) {
          api.toast('这个浏览器不支持语音，先打字吧');
          reset();
          return;
        }
        api.setText('');
        rec = listen({
          onPartial: function (t) { api.setText(t); },
          onFinal: function (t) {
            reset();
            if (t) api.send(t);
            else api.toast('没听清，再说一次？');
          },
          onError: function (err) {
            reset();
            if (err === 'not-allowed' || err === 'service-not-allowed') api.toast('需要麦克风权限，允许一下再试');
            else if (err === 'unsupported') api.toast('这个浏览器不支持语音，先打字吧');
            else if (err !== 'no-speech' && err !== 'aborted') api.toast('没听清，再说一次？');
          }
        });
        /* 兜底：识别服务没回应时别让按钮一直停在录音态 */
        clearTimeout(wd);
        wd = setTimeout(function () {
          if (btn.classList.contains('rec')) {
            if (rec) rec.stop();
            lbTimer = setTimeout(function () {
              if (btn.classList.contains('rec')) { reset(); api.toast('没听到声音'); }
            }, 1200);
          }
        }, 9000);
      }, 280);
    });

    function release(e) {
      clearTimeout(lp);
      if (!holding) return;
      e.preventDefault();
      if (rec) rec.stop();
      /* 松手后最多再等 2.2s，避免一直显示「松手发送」 */
      clearTimeout(lbTimer);
      lbTimer = setTimeout(function () {
        if (btn.classList.contains('rec')) { reset(); api.toast('没听到声音'); }
      }, 2200);
    }
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointerleave', function (e) { clearTimeout(lp); if (holding) release(e); });
    btn.addEventListener('pointercancel', function (e) { clearTimeout(lp); if (holding) release(e); });

    /* 长按后松手不要顺带跳到 p28 */
    btn.addEventListener('click', function (e) {
      if (holding || btn.classList.contains('rec')) {
        e.preventDefault();
        e.stopPropagation();
        holding = false;
      }
    }, true);
  }

  /* P28：倾诉，说完就散 */
  function mountVent(el, go) {
    var label = null;
    [].forEach.call(el.querySelectorAll('div'), function (d) {
      if (!label && d.children.length === 0 && d.textContent.trim() === '正在听…') label = d;
    });

    var timer = null;
    function back(ms, keep) {
      clearTimeout(timer);
      timer = setTimeout(function () { go('p10'); }, ms);
      if (keep && label) label.textContent = keep;
    }

    if (!ok()) {
      if (label) label.textContent = '这个浏览器不支持语音';
      back(1500);
      return function () { clearTimeout(timer); };
    }

    var rec = listen({
      onPartial: function (t) {
        if (label && t) label.textContent = t.slice(-26);
      },
      onEnd: function (t) {
        if (label) label.textContent = t ? '说完了，收好了' : '没关系，下次再说';
        back(900);
      },
      onError: function (err) {
        if (label) {
          label.textContent = (err === 'not-allowed' || err === 'service-not-allowed')
            ? '需要麦克风权限' : '没听到声音';
        }
        back(1300);
      }
    });

    return function () {
      clearTimeout(timer);
      if (rec) rec.abort();
    };
  }

  window.ZG_VOICE = {
    ok: ok,
    check: function () { return ok(); },
    listen: listen,
    stop: stop,
    abort: abort,
    bindChat: bindChat,
    mountVent: mountVent
  };
})();
