// ============================================================
// EL JASUS — SEASONS & RANK-POINT DECAY
// ============================================================
(function () {
  'use strict';
  var TABLE = [ [7500, 3000], [6500, 3000], [5000, 3000], [3000, 1000], [2000, 500] ];  // min points → decay (Ace, Crown, Diamond, Platinum, Gold)
  function decayFor(points) {
    points = parseInt(points, 10) || 0;
    for (var i = 0; i < TABLE.length; i++) if (points >= TABLE[i][0]) return Math.min(TABLE[i][1], points);
    return 0;                                   // Silver / Bronze are constant
  }
  function seasonOf(ms) { var d = new Date(ms); return d.getUTCFullYear() * 6 + Math.floor(d.getUTCMonth() / 2); }
  function current() { return seasonOf(Date.now()); }
  function msUntilNext() {
    var d = new Date(), m = Math.floor(d.getUTCMonth() / 2) * 2 + 2, y = d.getUTCFullYear();
    if (m > 11) { m = 0; y++; }
    return Date.UTC(y, m, 1) - Date.now();
  }
  function apply(M, uid) {
    if (!M || !uid || !M.runTransaction) return Promise.resolve(null);
    var res = null, cur = current();
    return M.runTransaction(M.ref(M.db, 'players/' + uid), function (p) {
      res = null;
      if (!p) return p;                                   // nothing to do for an empty record
      var applied = p.seasonApplied;
      if (typeof applied !== 'number') { p.seasonApplied = cur; return p; }
      if (applied >= cur) return;                         // abort: already up to date
      var pts = parseInt(p.rankPoints, 10) || 0, from = pts;
      for (var s = applied; s < cur; s++) pts = Math.max(0, pts - decayFor(pts));
      p.seasonApplied = cur;
      if (pts !== from) {
        p.rankPoints = pts;
        try { if (window.NameThemes) p.rank = window.NameThemes.getRank(pts).name; } catch (e) {}
        res = { from: from, to: pts, lost: from - pts, seasons: cur - applied };
      }
      return p;
    }).then(function () { return res; }).catch(function (e) { console.warn('[EJSeasons] decay failed', e); return null; });
  }
  window.EJSeasons = { current: current, msUntilNext: msUntilNext, decayFor: decayFor, apply: apply, seasonOf: seasonOf };
})();
