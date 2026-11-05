// ============================================================
// EL JASUS — QUICK REACTIONS (room)
// One tap = emoji or sound reaction that floats up on everybody's screen, like Zoom,
// with the sender's username under it. Shown during discussion, voting and the result reveal.
//
//   RoomReactions.init({ send: (reaction) => {...}, myUid })
//   RoomReactions.show(reaction)         // called for every reaction coming from the database
//   RoomReactions.setVisible(true|false)
// ============================================================
(function () {
  'use strict';
  var EMOJIS = ['😂', '🔥', '😱', '🤔', '👏', '💀', '🫡', '❤️'];
  var SOUNDS = [
    { id: 'drum',  icon: '🥁', label: 'طبل' },
    { id: 'horn',  icon: '📯', label: 'بوق' },
    { id: 'bell',  icon: '🔔', label: 'جرس' },
    { id: 'sus',   icon: '😬', label: 'مريب' }
  ];
  var ctx = null, muted = false, lastSent = 0, cfg = null, bar = null, fab = null, open = false, floating = 0;

  function audio() {
    if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; } }
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(function () {});
    return ctx;
  }
  function tone(c, type, f0, f1, t0, dur, vol) {
    var o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(c.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function playSound(id) {
    if (muted) return;
    var c = audio(); if (!c) return;
    var t = c.currentTime;
    if (id === 'drum') {
      tone(c, 'sine', 160, 45, t, 0.28, 0.9);
      var n = c.createBufferSource(), b = c.createBuffer(1, c.sampleRate * 0.12, c.sampleRate), d = b.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      n.buffer = b; var g = c.createGain(); g.gain.value = 0.35; n.connect(g); g.connect(c.destination); n.start(t);
    } else if (id === 'horn') {
      tone(c, 'sawtooth', 220, 220, t, 0.18, 0.25); tone(c, 'sawtooth', 330, 330, t + 0.18, 0.35, 0.25);
    } else if (id === 'bell') {
      tone(c, 'sine', 1320, 1320, t, 0.9, 0.35); tone(c, 'sine', 1980, 1980, t, 0.6, 0.15);
    } else if (id === 'sus') {
      tone(c, 'triangle', 200, 190, t, 0.25, 0.4); tone(c, 'triangle', 170, 150, t + 0.3, 0.4, 0.4);
    }
  }

  function css() {
    if (document.getElementById('rr-css')) return;
    var s = document.createElement('style'); s.id = 'rr-css';
    s.textContent =
      '.rr-fab{position:fixed;bottom:18px;left:14px;z-index:1500;width:52px;height:52px;border-radius:50%;background:#000;border:2px solid #a3e635;font-size:26px;line-height:1;cursor:pointer;box-shadow:0 0 18px rgba(163,230,53,.35)}' +
      '.rr-bar{position:fixed;bottom:78px;left:10px;z-index:1500;display:none;flex-wrap:wrap;gap:6px;max-width:min(330px,calc(100vw - 20px));padding:10px;background:rgba(0,0,0,.94);border:2px solid rgba(163,230,53,.5);border-radius:18px}' +
      '.rr-bar.on{display:flex}' +
      '.rr-btn{min-width:44px;height:44px;border-radius:12px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);font-size:22px;cursor:pointer;color:#fff;padding:0 6px}' +
      '.rr-btn:active{transform:scale(.9)}.rr-btn.snd{border-color:rgba(0,242,255,.4)}' +
      '.rr-sep{width:100%;height:0}' +
      '.rr-fly{position:fixed;z-index:99998;pointer-events:none;display:flex;flex-direction:column;align-items:center;gap:2px;animation:rrUp 3.2s ease-out forwards}' +
      '.rr-fly .e{font-size:42px;filter:drop-shadow(0 4px 8px rgba(0,0,0,.6))}' +
      '.rr-fly .n{font-size:11px;font-weight:900;color:#a3e635;background:rgba(0,0,0,.75);border:1px solid rgba(163,230,53,.4);border-radius:10px;padding:1px 8px;max-width:110px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '@keyframes rrUp{0%{transform:translateY(0) scale(.6);opacity:0}12%{opacity:1;transform:translateY(-20px) scale(1.15)}100%{transform:translateY(-62vh) scale(1);opacity:0}}';
    document.head.appendChild(s);
  }

  function build() {
    css();
    fab = document.createElement('button'); fab.className = 'rr-fab'; fab.id = 'rrFab'; fab.type = 'button';
    fab.textContent = '😄'; fab.setAttribute('aria-label', 'ردود الفعل السريعة'); fab.style.display = 'none';
    bar = document.createElement('div'); bar.className = 'rr-bar'; bar.id = 'rrBar';
    EMOJIS.forEach(function (e) { bar.appendChild(btn(e, 'emoji', e)); });
    var sep = document.createElement('div'); sep.className = 'rr-sep'; bar.appendChild(sep);
    SOUNDS.forEach(function (s) { var b = btn(s.icon, 'sound', s.id); b.classList.add('snd'); b.title = s.label; bar.appendChild(b); });
    var mu = document.createElement('button'); mu.className = 'rr-btn'; mu.type = 'button'; mu.textContent = '🔊'; mu.title = 'كتم أصوات الردود';
    mu.onclick = function (ev) { ev.stopPropagation(); muted = !muted; mu.textContent = muted ? '🔇' : '🔊'; };
    bar.appendChild(mu);
    fab.onclick = function () { open = !open; bar.classList.toggle('on', open); };
    document.body.appendChild(bar); document.body.appendChild(fab);
  }
  function btn(text, kind, v) {
    var b = document.createElement('button'); b.className = 'rr-btn'; b.type = 'button'; b.textContent = text;
    b.setAttribute('data-kind', kind); b.setAttribute('data-v', v);
    b.onclick = function (ev) {
      ev.stopPropagation();
      var n = Date.now(); if (n - lastSent < 700) return; lastSent = n;
      audio();   // unlock audio on a user gesture
      if (cfg && cfg.send) cfg.send({ kind: kind, v: v });
    };
    return b;
  }

  function show(r) {
    if (!r || !r.v) return;
    if (floating > 14) return;
    floating++;
    var el = document.createElement('div'); el.className = 'rr-fly';
    var icon = r.v;
    if (r.kind === 'sound') { var s = SOUNDS.filter(function (x) { return x.id === r.v; })[0]; icon = s ? s.icon : '🔊'; playSound(r.v); }
    var e = document.createElement('div'); e.className = 'e'; e.textContent = icon;
    var n = document.createElement('div'); n.className = 'n'; n.textContent = r.name || '';
    el.appendChild(e); el.appendChild(n);
    el.style.left = (12 + Math.random() * 70) + 'vw'; el.style.bottom = (14 + Math.random() * 14) + 'vh';
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); floating--; }, 3300);
  }

  function init(c) { cfg = c || {}; if (!fab) build(); }
  function setVisible(v) {
    if (!fab) return;
    fab.style.display = v ? '' : 'none';
    if (!v) { open = false; bar.classList.remove('on'); }
  }
  window.RoomReactions = { init: init, show: show, setVisible: setVisible, EMOJIS: EMOJIS, SOUNDS: SOUNDS };
})();
