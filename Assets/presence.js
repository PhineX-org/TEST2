// ============================================================
// EL JASUS — PRESENCE (online status) — shared by every page
//
// A player is "online" only while they are actually interacting with the site:
//   • any touch / click / key / scroll renews their status
//   • 5 minutes without any interaction  → marked offline (idle)
//   • closing the tab                     → marked offline by Firebase (onDisconnect)
// Viewers must use EJPresence.isOnline(presence) so a stale "online:true" (crashed browser)
// is never shown as online.
//
// Usage (each page passes its own Firebase SDK functions, so any SDK version works):
//   EJPresence.start({ db, ref, update, onDisconnect, onValue, serverTimestamp }, uid);
//   EJPresence.setRoom({ code, phase });   // from room.html; setRoom(null) when leaving
// ============================================================
(function () {
  'use strict';
  var IDLE_MS = 5 * 60 * 1000;     // no interaction for this long = offline
  var BEAT_MS = 60 * 1000;         // heartbeat while active
  var STALE_MS = 7 * 60 * 1000;    // viewers ignore "online" older than this

  var S = { M: null, uid: null, last: Date.now(), online: false, room: null, timer: null, ref: null, started: false };

  function now() { return Date.now(); }
  function write(extra) {
    if (!S.M || !S.uid) return;
    var data = Object.assign({ lastSeen: now() }, extra || {});
    try { S.M.update(S.ref, data); } catch (e) {}
  }
  function goOnline() {
    S.online = true;
    var d = { online: true };
    if (S.room) { d.inGame = true; d.room = S.room.code; d.phase = S.room.phase; }
    write(d);
  }
  function goIdle() {
    S.online = false;
    write({ online: false });
  }
  function touch() {
    S.last = now();
    if (!S.online) goOnline();
  }
  function beat() {
    if (now() - S.last >= IDLE_MS) { if (S.online) goIdle(); }
    else if (S.online) write({});
  }

  function start(M, uid) {
    if (!M || !uid) return;
    if (S.started && S.uid === uid) return;
    S.M = M; S.uid = uid; S.ref = M.ref(M.db, 'players/' + uid + '/presence'); S.started = true;
    try { M.onDisconnect(S.ref).update({ online: false, inGame: false, phase: null, room: null, lastSeen: M.serverTimestamp ? M.serverTimestamp() : now() }); } catch (e) {}
    S.last = now();
    goOnline();
    ['pointerdown', 'touchstart', 'keydown', 'wheel', 'scroll', 'mousemove'].forEach(function (ev) {
      window.addEventListener(ev, throttled, { passive: true, capture: true });
    });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) touch(); });
    if (S.timer) clearInterval(S.timer);
    S.timer = setInterval(beat, BEAT_MS);
    // re-assert onDisconnect after a reconnect
    try {
      M.onValue(M.ref(M.db, '.info/connected'), function (s) {
        if (s.val() === true && S.started) {
          try { M.onDisconnect(S.ref).update({ online: false, inGame: false, phase: null, room: null, lastSeen: M.serverTimestamp ? M.serverTimestamp() : now() }); } catch (e) {}
          if (now() - S.last < IDLE_MS) goOnline();
        }
      });
    } catch (e) {}
  }
  var _t = 0;
  function throttled() { var n = now(); if (n - _t < 1000) return; _t = n; touch(); }

  // room.html tells us where the player is; the status label uses it
  function setRoom(r) {
    S.room = r && r.code ? { code: r.code, phase: r.phase || 'waiting' } : null;
    if (!S.M) return;
    if (S.room) write({ online: true, inGame: true, room: S.room.code, phase: S.room.phase });
    else write({ inGame: false, room: null, phase: null });
  }

  // ── viewer helpers ───────────────────────────────────────
  function isOnline(p) {
    if (!p || !p.online) return false;
    var ls = Number(p.lastSeen) || 0;
    return !ls || now() - ls < STALE_MS;
  }
  // 'offline' | 'online' | 'room' (waiting stage) | 'game' (started)
  function state(p) {
    if (!isOnline(p)) return 'offline';
    if (p.inGame && p.room) return (p.phase === 'waiting' || !p.phase) ? 'room' : 'game';
    return 'online';
  }
  var LABEL = { offline: 'غير متصل', online: 'متصل', room: 'في غرفة', game: 'في لعبة' };
  var COLOR = { offline: '#6b7280', online: '#a3e635', room: '#00f2ff', game: '#f59e0b' };
  function label(p) { return LABEL[state(p)]; }
  function color(p) { return COLOR[state(p)]; }

  window.EJPresence = { start: start, setRoom: setRoom, isOnline: isOnline, state: state, label: label, color: color, touch: touch, IDLE_MS: IDLE_MS };
})();
