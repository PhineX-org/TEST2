/* ═══════════════════════════════════════════════════════════════════════
   EJInbox — El Jasus inbox (news + announcements + notifications)
   • movable window (drag by header) + movable launcher button
   • News list on the left, large details pane on the right (title + body)
   • Mobile (<=720px): full-screen, list -> details with a back button
   Tabs:  📰 news   |   🔔 notifications = friend requests, room invites / join requests,
          unread chat messages (preview + quick reply + "open chat") and small notices
   Data:  news/{id}  userNews/{uid}/{id}  announcements/current
          invites/{uid}  joinRequests/{uid}  players/{uid}/friendRequests
          userChats/{uid}  notifications/{uid}
   API:   EJInbox.init(db, user, { onJoin(roomCode), dbApi? })   (idempotent per user)
          EJInbox.setHandlers({ acceptInvite, declineInvite, acceptRequest, declineRequest, getTheme,
                                acceptFriend, declineFriend, sendReply, loadMessages, markChatRead,
                                dismissNotice, chatUrl })
          EJInbox.open(tab?, id?)  .close()  .toggle()  .destroy()
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.EJInbox) return;

  var FB_DB = 'https://www.gstatic.com/firebasejs/12.7.0/firebase-database.js';
  var LS = { fab: 'ej_inbox_fab_v1', pos: 'ej_inbox_pos_v1', big: 'ej_inbox_big_v1', tab: 'ej_inbox_tab_v1', read: 'ej_inbox_read_v1_' };
  var CATS = {
    update:       { ico: '🚀', label: 'تحديث',  color: '#a3e635' },
    announcement: { ico: '📢', label: 'إعلان',  color: '#00f2ff' },
    event:        { ico: '🎉', label: 'حدث',    color: '#d9f99d' },
    maintenance:  { ico: '🛠️', label: 'صيانة',  color: '#fbbf24' },
    notice:       { ico: '🔔', label: 'إشعار',  color: '#67e8f9' }
  };

  var S = null; // runtime state
  var HANDLERS = {}; // optional page-supplied actions: acceptInvite, declineInvite, acceptRequest, declineRequest, getTheme

  /* ── tiny helpers ─────────────────────────────────────────────── */
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function isMobile() { return window.matchMedia('(max-width:720px)').matches; }
  function ago(ts) {
    if (!ts) return '';
    var d = Math.max(0, Date.now() - ts), m = Math.floor(d / 60000);
    if (m < 1) return 'الآن';
    if (m < 60) return 'منذ ' + m + ' د';
    var h = Math.floor(m / 60); if (h < 24) return 'منذ ' + h + ' س';
    var dd = Math.floor(h / 24); if (dd < 30) return 'منذ ' + dd + ' ي';
    return new Date(ts).toLocaleDateString('ar-EG');
  }
  function fullDate(ts) { try { return new Date(ts).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return ''; } }
  function safeUrl(u) {
    u = String(u || '').trim();
    if (/^https:\/\/[^\s"'<>]+$/i.test(u)) return u;
    if (/^(?!\/\/)[A-Za-z0-9_\-\/.]*\.html(\?[A-Za-z0-9_=&%\-]*)?(#[A-Za-z0-9_\-]*)?$/.test(u) && u.indexOf('..') < 0) return u;
    return '';
  }
  function inline(t) {
    t = esc(t);
    t = t.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    t = t.replace(/(https:\/\/[^\s<]+)/g, function (u) { return '<a href="' + u + '" target="_blank" rel="noopener noreferrer">' + u + '</a>'; });
    return t;
  }
  function fmt(body) { // safe mini-markdown: ## heading, - bullets, **bold**, https links
    var out = [], list = false;
    String(body || '').split(/\r?\n/).forEach(function (line) {
      var m;
      if ((m = line.match(/^\s*-\s+(.*)$/))) { if (!list) { out.push('<ul>'); list = true; } out.push('<li>' + inline(m[1]) + '</li>'); return; }
      if (list) { out.push('</ul>'); list = false; }
      if ((m = line.match(/^\s*#{1,3}\s+(.*)$/))) out.push('<h4>' + inline(m[1]) + '</h4>');
      else if (!line.trim()) out.push('<div class="ejx-gap"></div>');
      else out.push('<p>' + inline(line) + '</p>');
    });
    if (list) out.push('</ul>');
    return out.join('');
  }

  /* ── styles ───────────────────────────────────────────────────── */
  var CSS = [
    '.ejx,.ejx *{box-sizing:border-box}',
    '.ejx{--l:#a3e635;--c:#00f2ff;font-family:"Cairo","Orbitron",sans-serif;color:#e8fff4}',
    '.ejx-fab{position:fixed;z-index:9990;width:52px;height:52px;border-radius:16px;border:1.5px solid rgba(0,242,255,.7);background:#000;color:var(--c);font-size:22px;cursor:grab;display:flex;align-items:center;justify-content:center;box-shadow:0 0 18px rgba(0,242,255,.35),inset 0 0 12px rgba(0,242,255,.12);touch-action:none;user-select:none;padding:0;line-height:1}',
    '.ejx-fab:active{cursor:grabbing}',
    '.ejx-fab.on{border-color:var(--l);box-shadow:0 0 22px rgba(163,230,53,.5)}',
    '.ejx-badge{position:absolute;top:-7px;right:-7px;min-width:20px;height:20px;padding:0 5px;border-radius:10px;background:var(--l);color:#000;font:800 11px/20px "Orbitron",sans-serif;text-align:center;display:none}',
    '.ejx-badge.show{display:block}',
    '.ejx-win{position:fixed;z-index:9995;display:none;flex-direction:column;width:min(780px,96vw);height:min(540px,88vh);background:rgba(4,8,6,.985);border:1.5px solid rgba(163,230,53,.45);border-radius:18px;box-shadow:0 0 0 1px #000,0 24px 80px rgba(0,0,0,.85),0 0 40px rgba(163,230,53,.14);overflow:hidden;direction:rtl}',
    '.ejx-win.open{display:flex}',
    '.ejx-win.big{width:min(1060px,97vw);height:min(720px,93vh)}',
    '.ejx-head{display:flex;align-items:center;gap:10px;padding:10px 14px;background:linear-gradient(90deg,rgba(0,242,255,.12),rgba(163,230,53,.12));border-bottom:1px solid rgba(163,230,53,.3);cursor:move;touch-action:none;user-select:none;flex:none}',
    '.ejx-title{font-weight:900;font-size:16px;letter-spacing:.3px;margin-inline-end:auto;display:flex;align-items:center;gap:8px}',
    '.ejx-grip{opacity:.45;font-size:13px;letter-spacing:-2px}',
    ':where(.ejx button){font-family:inherit}',
    '.ejx-ib{width:34px;height:34px;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:rgba(0,0,0,.55);color:#e8fff4;cursor:pointer;font-size:15px;display:flex;align-items:center;justify-content:center;padding:0}',
    '.ejx-ib:hover{border-color:var(--c);color:var(--c)}',
    '.ejx-tabs{display:flex;gap:8px;padding:10px 14px 0;flex:none}',
    '.ejx-tab{flex:0 0 auto;padding:7px 16px;border-radius:999px;border:1px solid rgba(255,255,255,.16);background:#000;color:#b9d9c8;font-weight:800;font-size:13px;cursor:pointer;display:flex;align-items:center;gap:7px}',
    '.ejx-tab.on{border-color:var(--l);color:#000;background:var(--l)}',
    '.ejx-tab b{font:800 11px "Orbitron",sans-serif;background:rgba(0,0,0,.35);color:#fff;border-radius:9px;padding:1px 7px}',
    '.ejx-tab.on b{background:#000;color:var(--l)}',
    '.ejx-body{flex:1;min-height:0;display:grid;grid-template-columns:minmax(210px,34%) minmax(0,1fr);direction:ltr;margin-top:10px;border-top:1px solid rgba(255,255,255,.08)}',
    '.ejx-list,.ejx-detail{direction:rtl;min-height:0;min-width:0;overflow-y:auto;overscroll-behavior:contain}',
    '.ejx-list{border-right:1px solid rgba(163,230,53,.22);background:rgba(0,0,0,.4);padding:8px}',
    '.ejx-it{width:100%;display:block;text-align:right;padding:10px 12px;margin-bottom:6px;border-radius:12px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.025);color:inherit;cursor:pointer;position:relative}',
    '.ejx-it:hover{border-color:rgba(0,242,255,.5)}',
    '.ejx-it.sel{background:linear-gradient(270deg,rgba(163,230,53,.26),rgba(0,242,255,.1));border-color:var(--l)}',
    '.ejx-it .t{display:flex;align-items:center;gap:8px;font-weight:800;font-size:13.5px;line-height:1.4}',
    '.ejx-it .t span.tt{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.ejx-it.unread .tt{color:#fff}.ejx-it:not(.unread) .tt{color:#b9d9c8;font-weight:700}',
    '.ejx-dot{width:9px;height:9px;border-radius:50%;background:var(--l);box-shadow:0 0 8px var(--l);flex:none}',
    '.ejx-it .m{display:flex;gap:8px;align-items:center;margin-top:5px;font-size:11px;color:#8fb3a1}',
    '.ejx-chip{font-size:10.5px;font-weight:800;padding:1px 8px;border-radius:999px;border:1px solid currentColor;white-space:nowrap}',
    '.ejx-detail{padding:20px 24px 28px}',
    '.ejx-back{display:none}',
    '.ejx-d-top{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px}',
    '.ejx-d-title{font-size:26px;font-weight:900;line-height:1.35;margin:0 0 6px;color:#fff;overflow-wrap:anywhere}',
    '.ejx-d-meta{font-size:12px;color:#8fb3a1;margin-bottom:18px;padding-bottom:14px;border-bottom:1px dashed rgba(163,230,53,.3)}',
    '.ejx-d-body{font-size:15px;line-height:1.95;color:#dcefe4;overflow-wrap:anywhere}',
    '.ejx-d-body p{margin:0 0 6px}.ejx-d-body h4{margin:16px 0 6px;color:var(--c);font-size:16px;font-weight:900}',
    '.ejx-d-body ul{margin:4px 0 10px;padding-inline-start:22px}.ejx-d-body li{margin:2px 0}.ejx-d-body li::marker{color:var(--l)}',
    '.ejx-d-body a{color:var(--c);text-decoration:underline}.ejx-gap{height:8px}',
    '.ejx-act{display:inline-flex;align-items:center;gap:8px;margin-top:20px;padding:11px 22px;border-radius:12px;background:var(--l);color:#000;font-weight:900;font-size:14px;text-decoration:none;border:0;cursor:pointer}',
    '.ejx-act.sec{background:#000;color:#e8fff4;border:1px solid rgba(255,255,255,.25);margin-inline-start:8px}',
    '.ejx-act.no{background:#000;color:#ff7b7b;border:1px solid rgba(255,90,90,.5);margin-inline-start:8px}',
    '.ejx-link{background:none;border:0;color:#8fb3a1;text-decoration:underline;cursor:pointer;font-size:12px;margin-top:22px;display:block;padding:0}',
    '.ejx-empty{padding:40px 16px;text-align:center;color:#8fb3a1;font-size:13.5px;line-height:1.8}',
    '.ejx-empty .i{font-size:38px;display:block;margin-bottom:8px;opacity:.8}',
    '.ejx-code{display:inline-block;font:900 30px "Orbitron",monospace;letter-spacing:6px;color:var(--c);padding:8px 18px;border:1px dashed rgba(0,242,255,.6);border-radius:12px;margin:8px 0 4px;direction:ltr}',
    '.ejx-th-fire{--tc:#ff8c00;--tbg:linear-gradient(135deg,rgba(139,0,0,.55),rgba(255,69,0,.22))}.ejx-th-ice{--tc:#88ddff;--tbg:linear-gradient(135deg,rgba(0,50,100,.6),rgba(100,150,200,.22))}',
    '.ejx-th-neon{--tc:#a070ff;--tbg:linear-gradient(135deg,rgba(20,0,40,.7),rgba(80,20,120,.3))}.ejx-th-gold{--tc:#ffd700;--tbg:linear-gradient(135deg,rgba(50,40,0,.7),rgba(100,80,0,.3))}.ejx-th-emerald{--tc:#00ff88;--tbg:linear-gradient(135deg,rgba(0,50,40,.7),rgba(0,100,60,.3))}',
    '.ejx-it[class*="ejx-th-"]{border-color:var(--tc)}.ejx-it[class*="ejx-th-"].sel{background:var(--tbg)}.ejx-detail[class*="ejx-th-"]{background:var(--tbg)}',
    '.ejx-act:disabled,.ejx-act.no:disabled{opacity:.5;cursor:wait}',
    '.ejx-cnt{font:800 11px "Orbitron",sans-serif;background:var(--l);color:#000;border-radius:9px;padding:1px 7px;margin-inline-start:6px}',
    '.ejx-msgs{display:flex;flex-direction:column;gap:6px;margin:6px 0 12px;max-height:240px;overflow-y:auto;padding:10px;border-radius:14px;background:rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.08)}',
    '.ejx-b{max-width:82%;padding:7px 12px;border-radius:14px;font-size:14px;line-height:1.6;overflow-wrap:anywhere;white-space:pre-wrap}',
    '.ejx-b.them{align-self:flex-start;background:rgba(255,255,255,.08);border-bottom-left-radius:4px}',
    '.ejx-b.me{align-self:flex-end;background:rgba(163,230,53,.2);border:1px solid rgba(163,230,53,.4);border-bottom-right-radius:4px}',
    '.ejx-b small{display:block;font-size:10px;opacity:.55;margin-top:2px}',
    '.ejx-reply{display:flex;gap:8px;margin-top:4px}',
    '.ejx-reply input{flex:1;min-width:0;padding:11px 14px;border-radius:12px;background:#000;border:1px solid rgba(0,242,255,.4);color:#fff;font:600 14px "Cairo",sans-serif;outline:none}',
    '.ejx-reply input:focus{border-color:var(--c);box-shadow:0 0 0 2px rgba(0,242,255,.18)}',
    '.ejx-reply button{padding:0 18px;border-radius:12px;border:0;background:var(--l);color:#000;font:900 14px "Cairo",sans-serif;cursor:pointer;flex:none}',
    '.ejx-reply button:disabled{opacity:.5}',
    '.ejx-ok{margin-top:14px;padding:10px 14px;border-radius:12px;border:1px solid var(--l);color:var(--l);font-weight:800;font-size:13px}',
    '.ejx-err{margin-top:10px;color:#ff9a9a;font-size:12.5px;font-weight:700}',
    '.ejx-notice{font-size:16px;line-height:1.9;color:#e8fff4;margin:6px 0}',
    '.ejx-toasts{position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:9999;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;width:min(420px,94vw)}',
    '.ejx-toast{pointer-events:auto;width:100%;background:#000;border:1.5px solid var(--l);border-radius:14px;padding:11px 14px;font:700 13.5px "Cairo",sans-serif;color:#fff;cursor:pointer;box-shadow:0 0 24px rgba(163,230,53,.3);direction:rtl;display:flex;gap:10px;align-items:center}',
    '.ejx-toast small{display:block;color:#8fb3a1;font-weight:600;font-size:11.5px}',
    '@media (max-width:720px){',
    ' .ejx-reply input{font-size:16px}',
    ' .ejx-win,.ejx-win.big{inset:0!important;left:0!important;top:0!important;width:100vw;height:100dvh;border-radius:0;border-width:0}',
    ' .ejx-head{cursor:default}.ejx-grip,.ejx-bigbtn{display:none}',
    ' .ejx-body{grid-template-columns:minmax(0,1fr)}',
    ' .ejx-list{border-right:0}',
    ' .ejx-win .ejx-detail{display:none;padding:16px 16px 40px}',
    ' .ejx-win.det .ejx-list{display:none}.ejx-win.det .ejx-detail{display:block}',
    ' .ejx-back{display:inline-flex;align-items:center;gap:6px;margin-bottom:14px;padding:8px 14px;border-radius:10px;border:1px solid rgba(255,255,255,.2);background:#000;color:#fff;font-weight:800;font-size:13px;cursor:pointer}',
    ' .ejx-d-title{font-size:21px}.ejx-fab.hide{display:none}',
    '}',
    '@media (prefers-reduced-motion:no-preference){.ejx-toast{animation:ejxIn .25s ease-out}@keyframes ejxIn{from{opacity:0;transform:translateY(-10px)}}}'
  ].join('\n');

  /* ── state helpers ───────────────────────────────────────────── */
  function readMap() { return lsGet(LS.read + S.uid, {}) || {}; }
  function isRead(id) { return !!S.read[id]; }
  function markRead(id, val) {
    if (val) S.read[id] = Date.now(); else delete S.read[id];
    // prune entries for items that no longer exist (keeps storage small)
    var live = {}; S.news.forEach(function (n) { live[n.id] = 1; }); S.notices.forEach(function (n) { live[n.id] = 1; });
    Object.keys(S.read).forEach(function (k) { if (!live[k]) delete S.read[k]; });
    lsSet(LS.read + S.uid, S.read);
  }
  function newsVisible() {
    var now = Date.now();
    return S.news.filter(function (n) { return n.visible !== false && (!n.exp || n.exp > now); });
  }
  // everything that shows up in the 🔔 tab, newest first
  function invitesActive() {
    var now = Date.now();
    var live = function (v) { return (!v.status || v.status === 'pending') && (!v.exp || v.exp > now); };
    var reqs = HANDLERS.acceptRequest ? S.requests.filter(live) : []; // "ask to join" needs the page's handlers
    var msgs = S.threads.filter(function (t) { return t.unread > 0 || t.fromUid === S.pinThread; });
    var nts = S.notices.filter(function (n) { return !n.exp || n.exp > now; });
    return S.friendReqs.concat(S.invites.filter(live), reqs, msgs, nts).sort(function (a, b) { return b.ts - a.ts; });
  }
  function unreadNotifs() {
    return invitesActive().filter(function (v) {
      if (v.kind === 'notice') return !isRead(v.id);
      if (v.kind === 'msg') return v.unread > 0;
      return true;
    }).length;
  }
  function sortedNews() {
    return newsVisible().slice().sort(function (a, b) { return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.ts || 0) - (a.ts || 0); });
  }
  function normNews(prefix, id, v) {
    if (!v || typeof v !== 'object' || (!v.title && !v.body && !v.text)) return null;
    var cat = CATS[v.category] ? v.category : (prefix === 'user:' ? 'notice' : 'announcement');
    return {
      id: prefix + id, raw: id, personal: prefix === 'user:',
      cat: cat, title: String(v.title || v.text || '').slice(0, 140), body: String(v.body || v.text || '').slice(0, 6000),
      tag: v.tag ? String(v.tag).slice(0, 14) : '', pinned: !!v.pinned, visible: v.visible !== false,
      ts: Number(v.createdAt || v.timestamp || v.sentAt) || 0, exp: Number(v.expiresAt) || 0,
      by: v.sentBy || v.by || '', aLabel: v.actionLabel ? String(v.actionLabel).slice(0, 40) : '', aUrl: safeUrl(v.actionUrl)
    };
  }
  function rebuildNews() {
    var out = [], seen = {};
    Object.keys(S.raw.news || {}).forEach(function (k) { var n = normNews('news:', k, S.raw.news[k]); if (n) { out.push(n); seen[k] = 1; } });
    Object.keys(S.raw.user || {}).forEach(function (k) { var n = normNews('user:', k, S.raw.user[k]); if (n) out.push(n); });
    var a = S.raw.ann;
    if (a && a.active !== false && !a.newsId && (a.text || a.message)) { // legacy banner without a news entry
      var exp = Number(a.expiresAt) || (a.sentAt && a.duration ? a.sentAt + a.duration * 1000 : 0);
      if (!exp || exp > Date.now()) {
        var t = String(a.text || a.message);
        out.push({ id: 'ann:current:' + (a.sentAt || 0), raw: 'current', personal: false, cat: 'announcement', title: t.slice(0, 90), body: t, tag: '', pinned: false, visible: true, ts: Number(a.sentAt) || 0, exp: exp, by: a.sentBy || '', aLabel: '', aUrl: '' });
      }
    }
    S.news = out;
  }
  function rebuildInvites() {
    var out = [], o = S.raw.inv || {};
    Object.keys(o).forEach(function (k) {
      var v = o[k]; if (!v || (!v.roomCode && v.type !== 'proposal')) return;
      var prop = v.type === 'proposal';
      out.push({ id: 'inv:' + k, kind: prop ? 'proposal' : 'invite', key: k, fromUid: v.fromUid || '', fromName: String(v.fromName || 'لاعب').slice(0, 30), roomCode: String(v.roomCode || '').slice(0, 12), category: v.category || '', ts: Number(v.timestamp) || 0, exp: Number(v.expiresAt) || 0, status: v.status, raw: v });
    });
    S.invites = out.sort(function (a, b) { return b.ts - a.ts; });
  }
  function rebuildRequests() {
    var out = [], o = S.raw.jr || {};
    Object.keys(o).forEach(function (k) {
      var v = o[k]; if (!v || !v.fromUid) return;
      out.push({ id: 'req:' + k, kind: 'request', key: k, fromUid: v.fromUid, fromName: String(v.fromName || 'لاعب').slice(0, 30), roomCode: String(v.roomCode || '').slice(0, 12), ts: Number(v.timestamp) || 0, exp: Number(v.expiresAt) || 0, status: v.status, raw: v });
    });
    S.requests = out;
  }
  function rebuildFriendReqs() {
    var out = [], o = S.raw.fr || {};
    Object.keys(o).forEach(function (k) {
      var v = o[k]; if (!v || typeof v !== 'object') return;
      var from = v.from || {};
      out.push({ id: 'fr:' + k, kind: 'friendreq', key: k, fromUid: k, fromName: String(from.username || 'لاعب').slice(0, 30), ts: Number(v.timestamp) || 0, via: v.via || '', exp: 0 });
    });
    S.friendReqs = out;
  }
  function rebuildThreads() {
    var out = [], o = S.raw.uc || {};
    Object.keys(o).forEach(function (k) {
      var v = o[k]; if (!v || typeof v !== 'object') return;
      var unread = Number(v.unread) || 0;
      if (!unread && k !== S.pinThread) return;
      out.push({ id: 'msg:' + k, kind: 'msg', key: k, fromUid: k, fromName: String(v.name || 'صديق').slice(0, 30), text: String(v.lastText || ''), ts: Number(v.lastTs) || 0, unread: unread, lastFrom: v.lastFrom, exp: 0 });
    });
    S.threads = out;
  }
  function rebuildNotices() {
    var out = [], o = S.raw.nt || {};
    Object.keys(o).forEach(function (k) {
      var v = o[k]; if (!v || typeof v !== 'object' || !v.text) return;
      out.push({ id: 'nt:' + k, kind: 'notice', key: k, type: v.type || '', fromUid: v.fromUid || '', fromName: String(v.fromName || '').slice(0, 30), text: String(v.text).slice(0, 300), ts: Number(v.ts) || 0, exp: 0 });
    });
    S.notices = out;
  }
  function themeOf(it) { // inviter's name-theme -> accent class (supplied by the page via getTheme)
    if (!it.fromUid || !HANDLERS.getTheme) return '';
    if (!(it.fromUid in S.themes)) {
      S.themes[it.fromUid] = '';
      try { Promise.resolve(HANDLERS.getTheme(it.fromUid)).then(function (c) { c = String(c || '').replace(/^themed-/, ''); if (/^(fire|ice|neon|gold|emerald)$/.test(c)) { S.themes[it.fromUid] = 'ejx-th-' + c; render(); } }).catch(function () {}); } catch (e) {}
    }
    return S.themes[it.fromUid] || '';
  }
  function badgeCount() { return newsVisible().filter(function (n) { return !isRead(n.id); }).length + unreadNotifs(); }

  /* ── DOM ──────────────────────────────────────────────────────── */
  function build() {
    var st = document.createElement('style'); st.id = 'ejx-style'; st.textContent = CSS; document.head.appendChild(st);
    var root = document.createElement('div'); root.className = 'ejx'; root.id = 'ejx-root';
    root.innerHTML =
      '<button class="ejx-fab" id="ejx-fab" type="button" aria-label="صندوق الوارد" title="صندوق الوارد (اسحبه لتحريكه)">📬<span class="ejx-badge" id="ejx-badge"></span></button>' +
      '<section class="ejx-win" id="ejx-win" role="dialog" aria-label="صندوق الوارد">' +
        '<header class="ejx-head" id="ejx-head"><div class="ejx-title"><span class="ejx-grip" aria-hidden="true">⋮⋮</span>📬 صندوق الوارد</div>' +
          '<button class="ejx-ib ejx-bigbtn" id="ejx-big" type="button" title="تكبير / تصغير" aria-label="تكبير">⤢</button>' +
          '<button class="ejx-ib" id="ejx-x" type="button" title="إغلاق (Esc)" aria-label="إغلاق">✕</button></header>' +
        '<nav class="ejx-tabs" id="ejx-tabs"></nav>' +
        '<div class="ejx-body"><div class="ejx-list" id="ejx-list" role="listbox"></div><article class="ejx-detail" id="ejx-detail"></article></div>' +
      '</section>' +
      '<div class="ejx-toasts" id="ejx-toasts"></div>';
    document.body.appendChild(root);
    S.el = { root: root, fab: root.querySelector('#ejx-fab'), badge: root.querySelector('#ejx-badge'), win: root.querySelector('#ejx-win'), head: root.querySelector('#ejx-head'),
      tabs: root.querySelector('#ejx-tabs'), list: root.querySelector('#ejx-list'), detail: root.querySelector('#ejx-detail'), toasts: root.querySelector('#ejx-toasts') };
    S.el.win.classList.toggle('big', !!lsGet(LS.big, false));
    root.querySelector('#ejx-x').onclick = close;
    root.querySelector('#ejx-big').onclick = function () { var b = !S.el.win.classList.contains('big'); S.el.win.classList.toggle('big', b); lsSet(LS.big, b); place(); };
    initDrag(S.el.fab, S.el.fab, LS.fab, toggle, true);
    initDrag(S.el.head, S.el.win, LS.pos, null, false);
    S.onKey = function (e) {
      if (!S.isOpen) return;
      if (e.key === 'Escape') { close(); return; }
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && S.el.win.contains(document.activeElement) && document.activeElement.tagName !== 'INPUT') {
        var items = currentItems(), i = items.findIndex(function (x) { return x.id === S.sel; });
        i = Math.max(0, Math.min(items.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
        if (items[i]) { e.preventDefault(); select(items[i].id, true); var b = S.el.list.querySelector('[data-id="' + items[i].id.replace(/"/g, '') + '"]'); if (b) b.focus(); }
      }
    };
    document.addEventListener('keydown', S.onKey);
    S.onResize = function () { place(); placeFab(); };
    window.addEventListener('resize', S.onResize);
    placeFab();
  }

  function clampTo(el, x, y) {
    var w = el.offsetWidth, h = el.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
    return { x: Math.min(Math.max(6, x), Math.max(6, vw - w - 6)), y: Math.min(Math.max(6, y), Math.max(6, vh - h - 6)) };
  }
  function placeFab() {
    var f = S.el.fab, p = lsGet(LS.fab, null);
    var dock = document.getElementById('panelDock'), lift = (dock && getComputedStyle(dock).position === 'fixed') ? 1 : 0;   // on phones the room has a bottom toolbar: park the inbox button top-left instead
    var x = p ? p.x : 16, y = p ? p.y : (lift ? 10 : window.innerHeight - 52 - 18);
    var c = clampTo(f, x, y); f.style.left = c.x + 'px'; f.style.top = c.y + 'px';
  }
  function place() {
    if (isMobile()) return;
    var w = S.el.win; if (!S.isOpen) return;
    var p = lsGet(LS.pos, null);
    var x = p ? p.x : (window.innerWidth - w.offsetWidth) / 2, y = p ? p.y : (window.innerHeight - w.offsetHeight) / 2;
    var c = clampTo(w, x, y); w.style.left = c.x + 'px'; w.style.top = c.y + 'px';
  }
  function initDrag(handle, target, key, onTap, isFab) {
    var sx, sy, ox, oy, moved, active = false, pid;
    handle.addEventListener('pointerdown', function (e) {
      if (e.button != null && e.button !== 0) return;
      if (!isFab && (e.target.closest('button') || isMobile())) return;
      active = true; moved = false; pid = e.pointerId; sx = e.clientX; sy = e.clientY;
      var r = target.getBoundingClientRect(); ox = r.left; oy = r.top;
      try { handle.setPointerCapture(pid); } catch (er) {}
    });
    handle.addEventListener('pointermove', function (e) {
      if (!active) return;
      var dx = e.clientX - sx, dy = e.clientY - sy;
      if (!moved && Math.abs(dx) + Math.abs(dy) < 5) return;
      moved = true;
      var c = clampTo(target, ox + dx, oy + dy); target.style.left = c.x + 'px'; target.style.top = c.y + 'px';
    });
    function end() {
      if (!active) return; active = false;
      try { handle.releasePointerCapture(pid); } catch (er) {}
      if (moved) lsSet(key, { x: parseInt(target.style.left, 10) || 0, y: parseInt(target.style.top, 10) || 0 });
      else if (onTap) onTap();
    }
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', function () { active = false; });
  }

  /* ── rendering ────────────────────────────────────────────────── */
  function currentItems() { return S.tab === 'notifs' ? invitesActive() : sortedNews(); }

  function render() {
    if (!S) return;
    var n = badgeCount();
    S.el.badge.textContent = n > 99 ? '99+' : n; S.el.badge.classList.toggle('show', n > 0);
    S.el.fab.classList.toggle('on', n > 0);
    S.el.fab.classList.toggle('hide', S.isOpen && isMobile());
    if (!S.isOpen) return;
    var un = newsVisible().filter(function (x) { return !isRead(x.id); }).length, ic = unreadNotifs();
    S.el.tabs.innerHTML =
      '<button class="ejx-tab' + (S.tab === 'news' ? ' on' : '') + '" data-tab="news" type="button">📰 الأخبار <b>' + un + '</b></button>' +
      '<button class="ejx-tab' + (S.tab === 'notifs' ? ' on' : '') + '" data-tab="notifs" type="button">🔔 الإشعارات <b>' + ic + '</b></button>';
    Array.prototype.forEach.call(S.el.tabs.children, function (b) { b.onclick = function () { setTab(b.getAttribute('data-tab')); }; });

    var items = currentItems();
    if (!items.some(function (x) { return x.id === S.sel; })) S.sel = (!isMobile() && items[0]) ? items[0].id : null;
    var top = S.el.list.scrollTop;
    if (!items.length) {
      S.el.list.innerHTML = '<div class="ejx-empty"><span class="i">' + (S.tab === 'news' ? '📰' : '🔔') + '</span>' + (S.tab === 'news' ? 'لا توجد أخبار حالياً.<br>سنعلمك عند نشر تحديث جديد.' : 'لا توجد إشعارات.<br>طلبات الصداقة والدعوات والرسائل الجديدة من أصدقائك ستظهر هنا.') + '</div>';
    } else {
      S.el.list.innerHTML = items.map(function (it) { return S.tab === 'notifs' ? invItem(it) : newsItem(it); }).join('');
      Array.prototype.forEach.call(S.el.list.querySelectorAll('.ejx-it'), function (b) { b.onclick = function () { select(b.getAttribute('data-id'), false); }; });
    }
    S.el.list.scrollTop = top;
    renderDetail();
  }
  function newsItem(n) {
    var c = CATS[n.cat], un = !isRead(n.id);
    return '<button type="button" role="option" class="ejx-it' + (n.id === S.sel ? ' sel' : '') + (un ? ' unread' : '') + '" data-id="' + esc(n.id) + '" aria-selected="' + (n.id === S.sel) + '">' +
      '<div class="t">' + (un ? '<i class="ejx-dot"></i>' : '') + '<span class="tt">' + (n.pinned ? '📌 ' : '') + esc(n.title) + '</span></div>' +
      '<div class="m"><span class="ejx-chip" style="color:' + c.color + '">' + c.ico + ' ' + (n.tag ? esc(n.tag) : c.label) + '</span>' + (n.personal ? '<span>لك أنت</span>' : '') + '<span style="margin-inline-start:auto">' + ago(n.ts) + '</span></div></button>';
  }
  var KIND = {
    friendreq: { ico: '👋', chip: 'طلب صداقة', color: '#a3e635' },
    invite:    { ico: '🎮', chip: 'دعوة غرفة', color: '#00f2ff' },
    proposal:  { ico: '🎮', chip: 'دعوة للعب', color: '#00f2ff' },
    request:   { ico: '🤝', chip: 'طلب انضمام', color: '#a3e635' },
    msg:       { ico: '💬', chip: 'رسالة', color: '#67e8f9' },
    notice:    { ico: '🔔', chip: 'إشعار', color: '#d9f99d' }
  };
  function itemTitle(v) {
    switch (v.kind) {
      case 'friendreq': return esc(v.fromName) + ' يريد إضافتك كصديق';
      case 'proposal': return esc(v.fromName) + ' يدعوك لإنشاء غرفة';
      case 'invite': return 'دعوة من ' + esc(v.fromName);
      case 'request': return esc(v.fromName) + ' يريد الانضمام';
      case 'msg': return esc(v.fromName) + (v.unread > 1 ? ' <span class="ejx-cnt">' + v.unread + '</span>' : '');
      default: return esc(v.text);
    }
  }
  function itemMeta(v) {
    if (v.kind === 'invite' || v.kind === 'proposal' || v.kind === 'request') return '<span data-cd="' + v.exp + '">' + cd(v.exp) + '</span>';
    if (v.kind === 'msg') return esc(v.text.slice(0, 40));
    return ago(v.ts);
  }
  function invItem(v) {
    var k = KIND[v.kind] || KIND.notice, th = themeOf(v), un = v.kind === 'notice' ? !isRead(v.id) : (v.kind === 'msg' ? v.unread > 0 : true);
    return '<button type="button" role="option" class="ejx-it' + (v.id === S.sel ? ' sel' : '') + (un ? ' unread' : '') + (th ? ' ' + th : '') + '" data-id="' + esc(v.id) + '">' +
      '<div class="t">' + (un ? '<i class="ejx-dot"></i>' : '') + '<span style="flex:none">' + k.ico + '</span><span class="tt">' + itemTitle(v) + '</span></div>' +
      '<div class="m"><span class="ejx-chip" style="color:' + k.color + '">' + k.chip + (v.kind === 'invite' ? ' ' + esc(v.roomCode) : '') + '</span><span style="margin-inline-start:auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:55%">' + itemMeta(v) + '</span></div></button>';
  }
  function cd(exp) {
    if (!exp) return ago(0);
    var s = Math.max(0, Math.round((exp - Date.now()) / 1000)), m = Math.floor(s / 60);
    return 'تنتهي خلال ' + m + ':' + String(s % 60).padStart(2, '0');
  }
  function bubble(m, mine) { return '<div class="ejx-b ' + (mine ? 'me' : 'them') + '">' + esc(m.text) + '<small>' + (m.ts ? new Date(m.ts).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '') + '</small></div>'; }

  function renderDetail() {
    var d = S.el.detail, back = '<button type="button" class="ejx-back" id="ejx-back">→ رجوع</button>';
    var items = currentItems(), it = items.filter(function (x) { return x.id === S.sel; })[0];
    S.el.win.classList.toggle('det', !!it && S.mobileDetail);
    // typing a reply must not be wiped by an unrelated database update: refresh just the messages
    if (it && it.kind === 'msg' && S.shownMsg === it.id && d.querySelector('#ejx-reply-in')) { fillMessages(it, true); return; }
    S.shownMsg = null;
    if (!it) {
      d.innerHTML = back + '<div class="ejx-empty"><span class="i">' + (S.tab === 'news' ? '📖' : '🔔') + '</span>' + (items.length ? 'اختر عنصراً من القائمة لعرض تفاصيله.' : (S.tab === 'news' ? 'لا شيء لعرضه الآن.' : 'لا توجد إشعارات الآن.')) + '</div>';
    } else if (S.tab === 'notifs') {
      var busy = !!S.busy[it.id], k = KIND[it.kind] || KIND.notice, bk = busy ? ' disabled' : '';
      var head = back + '<div class="ejx-d-top"><span class="ejx-chip" style="color:' + k.color + '">' + k.ico + ' ' + k.chip + '</span></div>';
      if (it.kind === 'friendreq') {
        d.innerHTML = head + '<h2 class="ejx-d-title">' + esc(it.fromName) + ' يريد إضافتك كصديق</h2>' +
          '<div class="ejx-d-meta">' + fullDate(it.ts) + (it.via === 'code' ? ' &nbsp;·&nbsp; عبر كود الصديق' : it.via === 'email' ? ' &nbsp;·&nbsp; عبر البريد الإلكتروني' : it.via === 'room' ? ' &nbsp;·&nbsp; من داخل غرفة' : '') + '</div>' +
          '<div class="ejx-d-body"><p>لن تصبحا أصدقاء إلا إذا قبلت الطلب. يمكنك رفضه بدون أن يُضاف أحد إلى قائمتك.</p></div>' +
          '<button class="ejx-act" id="ejx-acc" type="button"' + bk + '>' + (busy ? '…' : '✅ قبول') + '</button><button class="ejx-act no" id="ejx-dec" type="button"' + bk + '>رفض</button>' +
          (window.ProfileViewer ? '<button class="ejx-act sec" id="ejx-prof" type="button">👤 الملف الشخصي</button>' : '') + '<div class="ejx-err" id="ejx-err"></div>';
        d.querySelector('#ejx-acc').onclick = function () { friendAction('acceptFriend', it, '✅ أصبحتما أصدقاء'); };
        d.querySelector('#ejx-dec').onclick = function () { friendAction('declineFriend', it, 'تم رفض الطلب'); };
        var pb = d.querySelector('#ejx-prof'); if (pb) pb.onclick = function () { window.ProfileViewer.open(it.fromUid, it.fromName); };
      } else if (it.kind === 'msg') {
        S.shownMsg = it.id;
        d.innerHTML = head + '<h2 class="ejx-d-title">' + esc(it.fromName) + '</h2><div class="ejx-d-meta">' + (it.unread ? it.unread + ' رسالة جديدة · ' : '') + ago(it.ts) + '</div>' +
          '<div class="ejx-msgs" id="ejx-msgs"><div class="ejx-empty" style="padding:12px">…</div></div>' +
          '<div class="ejx-reply"><input id="ejx-reply-in" type="text" maxlength="500" placeholder="اكتب رداً سريعاً…" autocomplete="off"><button id="ejx-reply-go" type="button">إرسال</button></div>' +
          '<div class="ejx-err" id="ejx-err"></div>' +
          '<a class="ejx-act sec" id="ejx-chat" href="' + esc(chatLink(it.fromUid)) + '" style="margin-inline-start:0">💬 فتح المحادثة</a>';
        var inp = d.querySelector('#ejx-reply-in'), go = d.querySelector('#ejx-reply-go');
        var send = function () { sendQuick(it, inp, go); };
        go.onclick = send; inp.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); send(); } };
        fillMessages(it, false);
        S.pinThread = it.fromUid;
        seenThread(it);
      } else if (it.kind === 'notice') {
        d.innerHTML = head + '<h2 class="ejx-d-title">' + esc(it.fromName || 'إشعار') + '</h2><div class="ejx-d-meta">' + fullDate(it.ts) + '</div><p class="ejx-notice">' + esc(it.text) + '</p>' +
          (it.fromUid && it.type === 'friend_accepted' ? '<a class="ejx-act" href="' + esc(chatLink(it.fromUid)) + '">💬 مراسلة</a>' : '') +
          '<button class="ejx-act sec" id="ejx-del" type="button"' + bk + '>حذف الإشعار</button>';
        d.querySelector('#ejx-del').onclick = function () { dismissNotice(it); };
        if (!isRead(it.id)) markRead(it.id, true);
      } else { // room invite / proposal / join request
        var req = it.kind === 'request', prop = it.kind === 'proposal';
        d.innerHTML = head + '<h2 class="ejx-d-title">' + esc(it.fromName) + (req ? ' يريد الانضمام إلى غرفتك' : prop ? ' يدعوك للعب' : ' يدعوك للعب') + '</h2>' +
          '<div class="ejx-d-meta">' + (it.ts ? fullDate(it.ts) : '') + ' &nbsp;·&nbsp; <span data-cd="' + it.exp + '">' + cd(it.exp) + '</span></div>' +
          (req ? '<div class="ejx-d-body"><p>عند القبول ستُرسل له دعوة إلى غرفتك الحالية (يجب أن تكون في غرفة انتظار).</p></div>'
               : prop ? '<div class="ejx-d-body"><p>لن تُنشأ الغرفة إلا إذا قبلت الدعوة — وعندها تنتقلان إليها معاً.</p></div>'
               : '<div class="ejx-d-body"><p>كود الغرفة:</p><span class="ejx-code">' + esc(it.roomCode) + '</span></div>') +
          '<button class="ejx-act" id="ejx-acc" type="button"' + bk + '>' + (busy ? '…' : req ? '✅ قبول وإرسال دعوة' : prop ? '✅ قبول وإنشاء الغرفة' : '🚪 انضم الآن') + '</button><button class="ejx-act no" id="ejx-dec" type="button"' + bk + '>رفض</button>';
        d.querySelector('#ejx-acc').onclick = function () { req ? acceptRequest(it) : acceptInvite(it); };
        d.querySelector('#ejx-dec').onclick = function () { req ? declineRequest(it) : declineInvite(it); };
      }
    } else {
      var c = CATS[it.cat];
      d.innerHTML = back + '<div class="ejx-d-top"><span class="ejx-chip" style="color:' + c.color + '">' + c.ico + ' ' + c.label + '</span>' + (it.tag ? '<span class="ejx-chip" style="color:#fff">' + esc(it.tag) + '</span>' : '') + (it.pinned ? '<span class="ejx-chip" style="color:#fbbf24">📌 مثبّت</span>' : '') + (it.personal ? '<span class="ejx-chip" style="color:#67e8f9">رسالة لك</span>' : '') + '</div>' +
        '<h2 class="ejx-d-title">' + esc(it.title) + '</h2>' +
        '<div class="ejx-d-meta">' + (it.by ? 'من ' + esc(it.by) + ' &nbsp;·&nbsp; ' : '') + (it.ts ? fullDate(it.ts) : '') + '</div>' +
        '<div class="ejx-d-body">' + fmt(it.body) + '</div>' +
        (it.aUrl ? '<a class="ejx-act" id="ejx-go" href="' + esc(it.aUrl) + '"' + (/^https:/i.test(it.aUrl) ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' + esc(it.aLabel || 'افتح') + ' ↗</a>' : '') +
        '<button type="button" class="ejx-link" id="ejx-unread">وضع علامة «غير مقروء»</button>';
      d.querySelector('#ejx-unread').onclick = function () { markRead(it.id, false); S.mobileDetail = false; render(); };
    }
    d.className = 'ejx-detail' + (it && S.tab === 'notifs' && themeOf(it) ? ' ' + themeOf(it) : '');
    var b = d.querySelector('#ejx-back'); if (b) b.onclick = function () { S.mobileDetail = false; S.pinThread = null; render(); };
    d.scrollTop = 0;
  }
  function chatLink(uid) { return HANDLERS.chatUrl ? HANDLERS.chatUrl(uid) : 'chat.html?with=' + encodeURIComponent(uid); }

  // last few messages of a thread (loaded through the page's handler)
  function fillMessages(it, keepScroll) {
    var box = S.el.detail.querySelector('#ejx-msgs'); if (!box) return;
    if (!HANDLERS.loadMessages) { box.innerHTML = '<div class="ejx-b them">' + esc(it.text) + '</div>'; return; }
    var token = (S.msgToken = (S.msgToken || 0) + 1);
    Promise.resolve(HANDLERS.loadMessages(it.fromUid, 6)).then(function (list) {
      if (!S || token !== S.msgToken) return;
      var b2 = S.el.detail.querySelector('#ejx-msgs'); if (!b2) return;
      list = list || [];
      b2.innerHTML = list.length ? list.map(function (m) { return bubble(m, m.from === S.uid); }).join('') : '<div class="ejx-b them">' + esc(it.text) + '</div>';
      b2.scrollTop = b2.scrollHeight;
    }, function () { var b3 = S && S.el.detail.querySelector('#ejx-msgs'); if (b3) b3.innerHTML = '<div class="ejx-b them">' + esc(it.text) + '</div>'; });
  }
  function seenThread(it) { // opening the preview counts as reading it
    if (!HANDLERS.markChatRead || !it.unread) return;
    Promise.resolve(HANDLERS.markChatRead(it.fromUid)).catch(function () {});
  }
  function sendQuick(it, inp, go) {
    var text = inp.value.trim(); if (!text || !HANDLERS.sendReply) return;
    go.disabled = true; var err = S.el.detail.querySelector('#ejx-err'); if (err) err.textContent = '';
    Promise.resolve(HANDLERS.sendReply(it.fromUid, text, it.fromName)).then(function (r) {
      if (!S) return;
      go.disabled = false;
      if (r === null) { if (err) err.textContent = 'تم حظر الرسالة بواسطة الإشراف'; return; }
      inp.value = '';
      var box = S.el.detail.querySelector('#ejx-msgs');
      if (box) { box.insertAdjacentHTML('beforeend', bubble({ text: text, ts: Date.now() }, true)); box.scrollTop = box.scrollHeight; }
      inp.focus();
    }, function (e) { if (!S) return; go.disabled = false; if (err) err.textContent = (e && e.message) || 'تعذر الإرسال'; });
  }
  function friendAction(kind, it, doneMsg) {
    var err0 = S.el.detail.querySelector('#ejx-err');
    act(kind, it, null, function (res) {
      if (res === false) { var e = S.el.detail.querySelector('#ejx-err'); if (e) e.textContent = 'تعذر تنفيذ الإجراء، حاول مرة أخرى'; return; }
      S.sel = null; S.mobileDetail = false;
      toast('<span style="font-size:22px">' + (kind === 'acceptFriend' ? '🎉' : '👋') + '</span><div>' + esc(doneMsg) + '<small>' + esc(it.fromName) + '</small></div>');
    }, it.fromUid);
  }
  function dismissNotice(it) {
    act('dismissNotice', it, function () { return S.api.remove(S.api.ref(S.db, 'notifications/' + S.uid + '/' + it.key)); }, function () { S.sel = null; S.mobileDetail = false; }, it.key);
  }
  function select(id, fromKey) {
    S.sel = id; S.mobileDetail = true;
    if (S.tab === 'news') markRead(id, true);
    if (S.tab === 'notifs') { var m = /^msg:(.+)$/.exec(id); S.pinThread = m ? m[1] : null; }
    render();
  }
  function setTab(t) { S.tab = t; lsSet(LS.tab, t); S.sel = null; S.mobileDetail = false; S.pinThread = null; render(); if (!isMobile()) { var it = currentItems()[0]; if (it) select(it.id); } }

  /* ── actions ──────────────────────────────────────────────────── */
  // Runs the page-supplied handler if there is one (friend-invite-enhanced.js does the room checks,
  // status writes and navigation); otherwise falls back to a simple default. Buttons stay disabled meanwhile.
  function act(kind, it, fallback, after, arg) {
    if (S.busy[it.id]) return;
    S.busy[it.id] = 1; render();
    var h = HANDLERS[kind], p;
    try { p = h ? h(arg !== undefined ? arg : Object.assign({ key: it.key }, it.raw || {}, { fromName: it.fromName, roomCode: it.roomCode })) : (fallback ? fallback() : Promise.resolve(false)); }
    catch (e) { p = Promise.reject(e); }
    Promise.resolve(p).then(function (r) { return r; }, function (e) { console.warn('[EJInbox] ' + kind + ' failed', e); return false; }).then(function (res) {
      if (!S) return; delete S.busy[it.id]; if (after) after(res); render();
    });
  }
  function acceptInvite(v) {
    act('acceptInvite', v, function () {
      var go = function () { if (S && S.onJoin && v.roomCode) S.onJoin(v.roomCode, v); };
      return Promise.resolve(S.api.remove(S.api.ref(S.db, 'invites/' + S.uid + '/' + v.key))).then(go, go);
    }, function (res) { if (res !== false) close(); }); // handler resolves false when joining failed (room full/gone): stay open
  }
  function declineInvite(v) {
    act('declineInvite', v, function () { return S.api.remove(S.api.ref(S.db, 'invites/' + S.uid + '/' + v.key)); },
      function () { S.invites = S.invites.filter(function (x) { return x.key !== v.key; }); S.sel = null; S.mobileDetail = false; });
  }
  function acceptRequest(r) { act('acceptRequest', r, null, function () { S.sel = null; S.mobileDetail = false; }); }
  function declineRequest(r) { act('declineRequest', r, null, function () { S.sel = null; S.mobileDetail = false; }); }
  function toast(html, onClick) {
    var t = document.createElement('div'); t.className = 'ejx-toast'; t.innerHTML = html;
    t.onclick = function () { t.remove(); onClick && onClick(); };
    S.el.toasts.appendChild(t); setTimeout(function () { t.remove(); }, 6500);
  }

  /* ── open / close ─────────────────────────────────────────────── */
  function open(tab, id) {
    if (!S) return;
    if (tab === 'invites') tab = 'notifs'; // old name
    if (tab) S.tab = tab;
    S.isOpen = true; S.el.win.classList.add('open'); S.mobileDetail = false;
    if (id) { S.sel = id; S.mobileDetail = true; if (S.tab === 'news') markRead(id, true); var m = /^msg:(.+)$/.exec(id); S.pinThread = m ? m[1] : null; }
    place(); render();
    if (!id && !isMobile() && S.tab === 'news' && S.sel && !isRead(S.sel)) { markRead(S.sel, true); render(); }
  }
  function close() { if (!S) return; S.isOpen = false; S.pinThread = null; S.shownMsg = null; S.el.win.classList.remove('open'); render(); }
  function toggle() { S && (S.isOpen ? close() : open()); }

  /* ── data wiring ──────────────────────────────────────────────── */
  function listen(path, key, after) {
    var first = true;
    var off = S.api.onValue(S.api.ref(S.db, path), function (snap) {
      S.raw[key] = snap.val() || (key === 'ann' ? null : {});
      after(first); first = false; render();
    }, function () { /* permission denied / offline: stay quiet */ });
    if (typeof off === 'function') S.offs.push(off);
  }
  function wire() {
    var known = {};
    function newsAfter(first) {
      var before = known; rebuildNews(); known = {};
      newsVisible().forEach(function (n) {
        known[n.id] = 1;
        if (!first && S.ready && !before[n.id] && !isRead(n.id) && !(S.isOpen && S.tab === 'news' && S.sel === n.id)) {
          var c = CATS[n.cat]; toast('<span style="font-size:22px">' + c.ico + '</span><div>' + esc(n.title) + '<small>' + c.label + ' جديد — اضغط للقراءة</small></div>', function () { open('news', n.id); });
        }
      });
    }
    var knownInv = {}, lastMsgTs = {};
    function notifAfter(first) {
      var before = knownInv; rebuildInvites(); rebuildRequests(); rebuildFriendReqs(); rebuildThreads(); rebuildNotices(); knownInv = {};
      invitesActive().forEach(function (v) {
        if (v.kind === 'msg') { // a thread toasts again for every new message
          var seen = lastMsgTs[v.fromUid]; lastMsgTs[v.fromUid] = v.ts;
          if (first || !S.ready || v.ts <= (seen || 0) || v.lastFrom === S.uid || window.EJ_ACTIVE_CHAT === v.fromUid) return;
          if (S.isOpen && S.sel === v.id) return;
          toast('<span style="font-size:22px">💬</span><div>' + esc(v.fromName) + '<small>' + esc(v.text.slice(0, 60)) + '</small></div>', function () { open('notifs', v.id); });
          return;
        }
        knownInv[v.id] = 1;
        if (first || !S.ready || before[v.id]) return;
        var t = { friendreq: [ '👋', esc(v.fromName) + ' أرسل لك طلب صداقة', 'اضغط للقبول أو الرفض' ], request: [ '🤝', esc(v.fromName) + ' يريد الانضمام إلى غرفتك', 'اضغط لعرضه والرد' ],
          proposal: [ '🎮', esc(v.fromName) + ' يدعوك لإنشاء غرفة', 'اضغط للقبول' ], invite: [ '🎮', 'دعوة من ' + esc(v.fromName), 'اضغط لعرضها والانضمام' ], notice: [ '🔔', esc(v.text), '' ] }[v.kind];
        if (t) toast('<span style="font-size:22px">' + t[0] + '</span><div>' + t[1] + '<small>' + t[2] + '</small></div>', function () { open('notifs', v.id); });
      });
      // seed the "already seen" map on the first snapshot so old messages do not toast
      if (first) S.threads.forEach(function (th) { lastMsgTs[th.fromUid] = th.ts; });
    }
    listen('news', 'news', newsAfter);
    listen('userNews/' + S.uid, 'user', newsAfter);
    listen('announcements/current', 'ann', newsAfter);
    listen('invites/' + S.uid, 'inv', notifAfter);
    listen('joinRequests/' + S.uid, 'jr', notifAfter);
    listen('players/' + S.uid + '/friendRequests', 'fr', notifAfter);
    listen('userChats/' + S.uid, 'uc', notifAfter);
    listen('notifications/' + S.uid, 'nt', notifAfter);
    setTimeout(function () { S.ready = true; }, 2500);
    S.timer = setInterval(function () {
      if (!S.isOpen) return;
      Array.prototype.forEach.call(S.el.root.querySelectorAll('[data-cd]'), function (e) { e.textContent = cd(Number(e.getAttribute('data-cd'))); });
      if (invitesActive().length !== S.lastInv) { S.lastInv = invitesActive().length; render(); }
    }, 1000);
  }

  function init(db, user, opts) {
    if (!user || !user.uid) return;
    opts = opts || {};
    if (S && S.uid === user.uid) { if (opts.onJoin) S.onJoin = opts.onJoin; return; } // already running for this user (page + invite script both call init)
    if (S) destroy();
    var tab = lsGet(LS.tab, 'news'); if (tab === 'invites') tab = 'notifs';
    S = { db: db, uid: user.uid, onJoin: opts.onJoin, raw: {}, news: [], invites: [], requests: [], friendReqs: [], threads: [], notices: [], busy: {}, themes: {}, offs: [], tab: tab, sel: null, isOpen: false, ready: false, mobileDetail: false, lastInv: 0, pinThread: null };
    S.read = readMap();
    var go = function (api) { S.api = api; build(); wire(); render(); };
    if (opts.dbApi) return go(opts.dbApi);
    import(FB_DB).then(function (m) { if (S) go({ ref: m.ref, onValue: m.onValue, remove: m.remove }); }).catch(function (e) { console.warn('[EJInbox] firebase import failed', e); });
  }
  function destroy() {
    if (!S) return;
    S.offs.forEach(function (f) { try { f(); } catch (e) {} });
    clearInterval(S.timer);
    document.removeEventListener('keydown', S.onKey); window.removeEventListener('resize', S.onResize);
    if (S.el) { S.el.root.remove(); var st = document.getElementById('ejx-style'); st && st.remove(); }
    S = null;
  }

  window.EJInbox = { setHandlers: function (h) { HANDLERS = Object.assign({}, HANDLERS, h || {}); if (S && S.el) render(); }, init: init, open: open, close: close, toggle: toggle, destroy: destroy };
})();
