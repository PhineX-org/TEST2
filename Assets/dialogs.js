// ============================================================
// EL JASUS — DIALOG SYSTEM v2.0  (Classic Edition)
// Replaces the browser alert / confirm / prompt with designed,
// accessible dialogs, and adds toasts.
//
//   await UIAlert(message, {title, type, icon, confirmText, html})
//   await UIConfirm(message, {title, type, danger, confirmText, cancelText, html})  -> true | false
//   await UIPrompt(message, {title, defaultValue, placeholder, inputType, maxLength,
//                            multiline, required, validate(v)->errorText|''})       -> string | null
//   UIToast(message, {type, duration, icon})                                        -> { close() }
//
// types: info (cyan) · success (lime) · warning (amber) · error (red)
//
// IMPORTANT — these are ASYNCHRONOUS. A bare `if (!confirm(...)) return;` can
// never work with them (a Promise is always truthy). Always write
// `if (!(await UIConfirm(...))) return;` and `await UIAlert(...)` before a redirect.
//
// Behaviour:
//   • plain text by default (safe for error messages / usernames); pass {html:true} to allow markup
//   • dialogs queue (never stacked), focus is trapped and restored, Esc cancels,
//     Enter confirms, a click on the dark backdrop cancels (alerts just close)
//   • phones (<=560px): bottom sheet with safe-area padding; desktops: centred HUD card
//   • honours prefers-reduced-motion
//   • also installs window.alert / confirm / prompt replacements (async)
// ============================================================
(function () {
  'use strict';
  if (window.__EJ_DIALOGS_V2__) return;
  window.__EJ_DIALOGS_V2__ = true;

  // ── PALETTE (Classic Edition: black + cyan + lime; amber/red only for warning/error) ──
  var THEMES = {
    info:    { c: '0,242,255',   hex: '#00f2ff', title: 'تنبيه' },
    success: { c: '163,230,53',  hex: '#a3e635', title: 'تم' },
    warning: { c: '251,191,36',  hex: '#fbbf24', title: 'تأكيد' },
    error:   { c: '248,113,113', hex: '#f87171', title: 'خطأ' }
  };

  var ICONS = {
    info:    '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>',
    success: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16.5 9.5"/>',
    warning: '<path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5M12 17.2v.01"/>',
    error:   '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
    edit:    '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    trash:   '<path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13M10 11v5M14 11v5"/>'
  };
  function svg(name) {
    return '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || ICONS.info) + '</svg>';
  }

  // ── STYLES ───────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('ejd-styles')) return;
    var s = document.createElement('style');
    s.id = 'ejd-styles';
    s.textContent = [
      '.ejd-overlay{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px;',
      'background:rgba(0,0,0,.78);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);animation:ejd-fade .16s ease both;}',
      '.ejd-overlay.ejd-out{animation:ejd-fade-out .16s ease both;}',
      '@keyframes ejd-fade{from{opacity:0}to{opacity:1}}@keyframes ejd-fade-out{from{opacity:1}to{opacity:0}}',
      '@keyframes ejd-pop{from{opacity:0;transform:translateY(14px) scale(.97)}to{opacity:1;transform:none}}',
      '@keyframes ejd-sheet{from{transform:translateY(100%)}to{transform:none}}',
      '@keyframes ejd-sheet-out{from{transform:none}to{transform:translateY(100%)}}',
      '@keyframes ejd-pop-out{from{opacity:1;transform:none}to{opacity:0;transform:translateY(10px) scale(.98)}}',

      '.ejd-box{--c:0,242,255;position:relative;width:100%;max-width:420px;max-height:calc(100dvh - 32px);overflow:auto;',
      'background:#000;color:#fff;direction:rtl;text-align:right;font-family:"Cairo",system-ui,sans-serif;',
      'border:1px solid rgba(var(--c),.45);border-radius:14px;padding:22px 20px 18px;',
      'box-shadow:0 0 0 1px rgba(0,0,0,.9),0 24px 70px rgba(0,0,0,.85),0 0 34px rgba(var(--c),.14);',
      'animation:ejd-pop .2s cubic-bezier(.2,.9,.3,1.1) both;outline:none;}',
      '.ejd-out .ejd-box{animation:ejd-pop-out .15s ease both;}',
      /* HUD corner brackets */
      '.ejd-box::before,.ejd-box::after{content:"";position:absolute;width:16px;height:16px;pointer-events:none;border:2px solid rgb(var(--c));opacity:.9;}',
      '.ejd-box::before{top:-1px;right:-1px;border-left:0;border-bottom:0;border-top-right-radius:14px;}',
      '.ejd-box::after{bottom:-1px;left:-1px;border-right:0;border-top:0;border-bottom-left-radius:14px;}',

      '.ejd-head{display:flex;align-items:center;gap:12px;margin-bottom:12px;}',
      '.ejd-ic{flex:none;width:46px;height:46px;border-radius:12px;display:grid;place-items:center;color:rgb(var(--c));',
      'background:rgba(var(--c),.09);border:1px solid rgba(var(--c),.4);}',
      '.ejd-title{margin:0;font-size:16px;font-weight:900;line-height:1.3;color:rgb(var(--c));letter-spacing:.01em;word-break:break-word;}',
      '.ejd-msg{margin:0 0 18px;font-size:14px;line-height:1.75;color:rgba(255,255,255,.8);white-space:pre-line;word-break:break-word;}',
      '.ejd-msg:empty{display:none}',

      '.ejd-in{display:block;width:100%;box-sizing:border-box;margin:0 0 6px;padding:12px 14px;min-height:46px;',
      'background:#000;color:#fff;border:1px solid rgba(255,255,255,.22);border-radius:10px;',
      'font:700 15px "Cairo",system-ui,sans-serif;outline:none;direction:auto;text-align:start;transition:border-color .15s,box-shadow .15s;}',
      'textarea.ejd-in{min-height:96px;resize:vertical;line-height:1.6}',
      '.ejd-in:focus{border-color:rgb(var(--c));box-shadow:0 0 0 3px rgba(var(--c),.18);}',
      '.ejd-in::placeholder{color:rgba(255,255,255,.3);font-weight:600}',
      '.ejd-in.bad{border-color:#f87171;box-shadow:0 0 0 3px rgba(248,113,113,.16);}',
      '.ejd-err{min-height:18px;margin:0 0 10px;font-size:12px;font-weight:700;color:#f87171;}',

      '.ejd-btns{display:flex;gap:10px;margin-top:2px;}',
      '.ejd-btn{flex:1;min-height:46px;padding:10px 14px;border-radius:10px;cursor:pointer;font:900 14px "Cairo",system-ui,sans-serif;',
      'transition:transform .12s,background .15s,border-color .15s,box-shadow .15s;-webkit-tap-highlight-color:transparent;}',
      '.ejd-btn:active{transform:scale(.97)}',
      '.ejd-btn:focus-visible{outline:2px solid #fff;outline-offset:2px}',
      '.ejd-ok{color:#000;background:rgb(var(--c));border:1px solid rgb(var(--c));box-shadow:0 0 18px rgba(var(--c),.3);}',
      '.ejd-ok:hover{filter:brightness(1.08)}',
      '.ejd-no{color:rgba(255,255,255,.75);background:transparent;border:1px solid rgba(255,255,255,.22);}',
      '.ejd-no:hover{border-color:rgba(255,255,255,.5);color:#fff}',

      /* toasts */
      '.ejd-toasts{position:fixed;z-index:2147483100;top:calc(14px + env(safe-area-inset-top,0px));left:50%;transform:translateX(-50%);',
      'display:flex;flex-direction:column;gap:8px;width:min(92vw,380px);pointer-events:none;direction:rtl;}',
      '.ejd-toast{--c:0,242,255;pointer-events:auto;display:flex;align-items:center;gap:10px;padding:11px 14px;background:#000;color:#fff;',
      'border:1px solid rgba(var(--c),.5);border-right:4px solid rgb(var(--c));border-radius:10px;font:700 13px/1.5 "Cairo",system-ui,sans-serif;',
      'box-shadow:0 10px 34px rgba(0,0,0,.75),0 0 20px rgba(var(--c),.12);animation:ejd-toast-in .22s ease both;cursor:pointer;}',
      '.ejd-toast .ejd-ti{flex:none;color:rgb(var(--c));display:grid;place-items:center}',
      '.ejd-toast .ejd-ti svg{width:20px;height:20px}',
      '.ejd-toast span.t{flex:1;min-width:0;word-break:break-word;white-space:pre-line}',
      '.ejd-toast.ejd-out{animation:ejd-toast-out .18s ease both}',
      '@keyframes ejd-toast-in{from{opacity:0;transform:translateY(-12px)}to{opacity:1;transform:none}}',
      '@keyframes ejd-toast-out{from{opacity:1}to{opacity:0;transform:translateY(-8px)}}',

      /* phones: bottom sheet */
      '@media (max-width:560px){',
      '.ejd-overlay{align-items:flex-end;padding:0}',
      '.ejd-box{max-width:none;border-radius:18px 18px 0 0;border-bottom:0;max-height:88dvh;padding:20px 18px calc(16px + env(safe-area-inset-bottom,0px));animation:ejd-sheet .26s cubic-bezier(.2,.9,.3,1) both}',
      '.ejd-out .ejd-box{animation:ejd-sheet-out .18s ease both}',
      '.ejd-box::before,.ejd-box::after{display:none}',
      '.ejd-box .ejd-grab{display:block}',
      '}',
      '.ejd-grab{display:none;width:42px;height:4px;border-radius:4px;background:rgba(255,255,255,.2);margin:-8px auto 14px}',
      '@media (prefers-reduced-motion:reduce){.ejd-overlay,.ejd-box,.ejd-toast{animation-duration:.01ms!important}}'
    ].join('');
    (document.head || document.documentElement).appendChild(s);
  }

  // ── HELPERS ──────────────────────────────────────────────
  var queue = [], showing = false, lockCount = 0, prevOverflow = '';
  function lockScroll(on) {
    var b = document.body; if (!b) return;
    if (on) { if (lockCount++ === 0) { prevOverflow = b.style.overflow; b.style.overflow = 'hidden'; } }
    else if (--lockCount <= 0) { lockCount = 0; b.style.overflow = prevOverflow; }
  }
  var LEAD = /^\s*(✅|✔️|☑️|🎉|❌|🚫|⛔|⚠️|ℹ️|💡)\s*/;
  // Infers the dialog type from a leading emoji / wording when the caller gave none (keeps old alert() calls looking right).
  function infer(message, type) {
    var msg = String(message == null ? '' : message), t = type, m = LEAD.exec(msg);
    if (m) {
      msg = msg.slice(m[0].length);
      if (!t) t = /✅|✔|☑|🎉/.test(m[1]) ? 'success' : /❌|🚫|⛔/.test(m[1]) ? 'error' : /⚠/.test(m[1]) ? 'warning' : 'info';
    }
    if (!t) {
      if (/^\s*(فشل|خطأ|حدث خطأ|تعذر|تعذّر|لا يمكن|يجب |غير )/.test(msg)) t = 'error';
      else if (/^\s*(تم|نجح)/.test(msg)) t = 'success';
      else t = 'info';
    }
    return { msg: msg, type: THEMES[t] ? t : 'info' };
  }

  function build(o) {
    return new Promise(function (resolve) {
      queue.push({ o: o, resolve: resolve });
      pump();
    });
  }

  function pump() {
    if (showing || !queue.length) return;
    if (!document.body) { document.addEventListener('DOMContentLoaded', pump, { once: true }); return; }
    showing = true;
    var job = queue.shift(), o = job.o;
    injectStyles();
    var theme = THEMES[o.type] || THEMES.info;
    var prevFocus = document.activeElement;
    var done = false;

    var overlay = document.createElement('div');
    overlay.className = 'ejd-overlay';
    var box = document.createElement('div');
    box.className = 'ejd-box';
    box.style.setProperty('--c', theme.c);
    box.setAttribute('role', o.kind === 'alert' ? 'alertdialog' : 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.tabIndex = -1;

    var uid = 'ejd' + Math.random().toString(36).slice(2, 7);
    var grab = document.createElement('div'); grab.className = 'ejd-grab'; box.appendChild(grab);

    var head = document.createElement('div'); head.className = 'ejd-head';
    var ic = document.createElement('div'); ic.className = 'ejd-ic';
    ic.innerHTML = svg(o.icon || (o.danger ? 'trash' : o.kind === 'prompt' ? 'edit' : o.type));
    var ttl = document.createElement('h2'); ttl.className = 'ejd-title'; ttl.id = uid + 't';
    ttl.textContent = o.title || theme.title;
    head.appendChild(ic); head.appendChild(ttl); box.appendChild(head);
    box.setAttribute('aria-labelledby', ttl.id);

    var msg = document.createElement('p'); msg.className = 'ejd-msg'; msg.id = uid + 'm';
    if (o.html) msg.innerHTML = o.message || ''; else msg.textContent = o.message || '';
    box.appendChild(msg); box.setAttribute('aria-describedby', msg.id);

    var input = null, err = null;
    if (o.kind === 'prompt') {
      input = document.createElement(o.multiline ? 'textarea' : 'input');
      input.className = 'ejd-in';
      if (!o.multiline) input.type = o.inputType || 'text';
      input.placeholder = o.placeholder || '';
      input.value = o.defaultValue == null ? '' : String(o.defaultValue);
      if (o.maxLength) input.maxLength = o.maxLength;
      input.setAttribute('aria-label', o.title || o.message || '');
      err = document.createElement('div'); err.className = 'ejd-err'; err.setAttribute('role', 'alert');
      box.appendChild(input); box.appendChild(err);
    }

    var row = document.createElement('div'); row.className = 'ejd-btns';
    var okBtn = document.createElement('button'); okBtn.type = 'button'; okBtn.className = 'ejd-btn ejd-ok';
    okBtn.textContent = o.confirmText || (o.kind === 'alert' ? 'حسناً' : 'تأكيد');
    if (o.danger) { okBtn.style.setProperty('--c', THEMES.error.c); okBtn.style.background = THEMES.error.hex; okBtn.style.borderColor = THEMES.error.hex; okBtn.style.boxShadow = '0 0 18px rgba(248,113,113,.3)'; }
    var noBtn = null;
    if (o.kind !== 'alert') {
      noBtn = document.createElement('button'); noBtn.type = 'button'; noBtn.className = 'ejd-btn ejd-no';
      noBtn.textContent = o.cancelText || 'إلغاء';
    }
    // RTL: first child sits on the right → primary first
    row.appendChild(okBtn); if (noBtn) row.appendChild(noBtn);
    box.appendChild(row);
    overlay.appendChild(box);

    function finish(value) {
      if (done) return; done = true;
      document.removeEventListener('keydown', onKey, true);
      overlay.classList.add('ejd-out');
      setTimeout(function () {
        overlay.remove(); lockScroll(false);
        try { if (prevFocus && prevFocus.focus && document.contains(prevFocus)) prevFocus.focus({ preventScroll: true }); } catch (e) {}
        showing = false; pump();
      }, 170);
      job.resolve(value);
    }
    function submit() {
      if (o.kind === 'prompt') {
        var v = o.multiline ? input.value.trim() : input.value.trim();
        var problem = '';
        if (o.required && !v) problem = 'هذا الحقل مطلوب';
        else if (typeof o.validate === 'function') { try { problem = o.validate(v) || ''; } catch (e) { problem = ''; } }
        if (problem) { err.textContent = problem; input.classList.add('bad'); input.focus(); return; }
        finish(v);
      } else finish(o.kind === 'alert' ? true : true);
    }
    function cancel() { finish(o.kind === 'prompt' ? null : o.kind === 'alert' ? true : false); }

    okBtn.addEventListener('click', submit);
    if (noBtn) noBtn.addEventListener('click', cancel);
    if (input) input.addEventListener('input', function () { err.textContent = ''; input.classList.remove('bad'); });
    overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) cancel(); });

    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(); return; }
      if (e.key === 'Enter' && !(o.multiline && e.target === input && !e.ctrlKey)) {
        if (e.target && e.target.tagName === 'BUTTON' && e.target !== okBtn) return; // let the focused button act
        e.preventDefault(); e.stopPropagation(); submit(); return;
      }
      if (e.key === 'Tab') { // focus trap
        var f = box.querySelectorAll('button,input,textarea'); if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        else if (!box.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', onKey, true);

    lockScroll(true);
    document.body.appendChild(overlay);
    setTimeout(function () {
      try { (input || (o.kind === 'confirm' && o.danger ? noBtn : okBtn)).focus({ preventScroll: true }); if (input && input.select) input.select(); } catch (e) {}
    }, 30);
  }

  // ── PUBLIC API ───────────────────────────────────────────
  window.UIAlert = function (message, opts) {
    opts = opts || {};
    var i = infer(message, opts.type);
    return build({ kind: 'alert', message: opts.html ? message : i.msg, html: opts.html, type: i.type, title: opts.title, icon: opts.icon && ICONS[opts.icon] ? opts.icon : null, confirmText: opts.confirmText });
  };
  window.UIConfirm = function (message, opts) {
    opts = opts || {};
    var i = infer(message, opts.type || (opts.danger ? 'warning' : 'warning'));
    return build({ kind: 'confirm', message: opts.html ? message : i.msg, html: opts.html, type: i.type, title: opts.title || 'تأكيد', danger: !!opts.danger, icon: opts.icon && ICONS[opts.icon] ? opts.icon : null, confirmText: opts.confirmText, cancelText: opts.cancelText });
  };
  window.UIPrompt = function (message, opts) {
    opts = opts || {};
    return build({ kind: 'prompt', message: message, html: opts.html, type: opts.type || 'info', title: opts.title || '', defaultValue: opts.defaultValue, placeholder: opts.placeholder,
      inputType: opts.inputType, maxLength: opts.maxLength, multiline: !!opts.multiline, required: !!opts.required, validate: opts.validate, confirmText: opts.confirmText, cancelText: opts.cancelText });
  };

  var toastBox = null;
  window.UIToast = function (message, opts) {
    opts = opts || {};
    injectStyles();
    var i = infer(message, opts.type);
    var th = THEMES[i.type];
    if (!document.body) { return { close: function () {} }; }
    if (!toastBox || !toastBox.isConnected) {
      toastBox = document.createElement('div'); toastBox.className = 'ejd-toasts';
      toastBox.setAttribute('aria-live', 'polite'); document.body.appendChild(toastBox);
    }
    while (toastBox.children.length >= 3) toastBox.firstChild.remove();
    var t = document.createElement('div'); t.className = 'ejd-toast'; t.style.setProperty('--c', th.c); t.setAttribute('role', 'status');
    t.innerHTML = '<span class="ejd-ti">' + svg(i.type) + '</span><span class="t"></span>';
    t.querySelector('.t').textContent = i.msg;
    toastBox.appendChild(t);
    var closed = false;
    function close() { if (closed) return; closed = true; t.classList.add('ejd-out'); setTimeout(function () { t.remove(); }, 190); }
    t.addEventListener('click', close);
    setTimeout(close, opts.duration || 3200);
    return { close: close };
  };

  // Drop-in async replacements for the native functions (pages that still call alert(...) get the new look).
  window.alert = function (msg) { return window.UIAlert(msg); };
  window.confirm = function (msg) { return window.UIConfirm(msg); };
  window.prompt = function (msg, def) { return window.UIPrompt(msg, { defaultValue: def }); };
})();
