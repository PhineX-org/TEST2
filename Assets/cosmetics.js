// ============================================================
// EL JASUS — COSMETICS (name-card backgrounds, name-card frames, legacy join animation)
//
// • Diamond / Crown / Ace unlock a rank background + a rank frame. Higher rank = better (more legacy) look.
//   They cannot be sold and are only usable while the player's rank is high enough.
// • The shop sells extra backgrounds (solid + animated) and extra frames, separate from the rank ones.
// • Crown and Ace players trigger a time-limited "legacy entry" animation for the whole room when they join
//   (Ace is longer and more dramatic than Crown), like PUBG.
//
// API
//   EJCos.tierOf(points)            -> null | 'diamond' | 'crown' | 'ace'
//   EJCos.decorate(el, {cardBg, cardFrame, rankPoints})   adds the CSS classes to a player card element
//   EJCos.isUsable(id, kind, points)                       rank items need the rank; shop items are trusted
//   EJCos.available(kind, points, inventoryArray)          -> ids the player may equip
//   EJCos.playEntry({username, rankPoints})                legacy entry animation (Crown / Ace only)
// ============================================================
(function () {
  'use strict';
  var ORDER = ['diamond', 'crown', 'ace'];
  var MIN = { diamond: 5000, crown: 6500, ace: 7500 };
  function tierOf(points) {
    points = parseInt(points, 10) || 0;
    if (points >= MIN.ace) return 'ace';
    if (points >= MIN.crown) return 'crown';
    if (points >= MIN.diamond) return 'diamond';
    return null;
  }
  function tierIndex(t) { return ORDER.indexOf(t); }

  // ---- catalogue -------------------------------------------------------------------------------
  // rank:'x' = granted by rank (not sold). price = shop price in coins.
  var BACKGROUNDS = {
    rank_diamond: { name: 'ألماس', rank: 'diamond', animated: true,  css: 'background:linear-gradient(135deg,#06222b,#0b4a5c 45%,#06222b);' },
    rank_crown:   { name: 'تاج ذهبي', rank: 'crown', animated: true, css: 'background:linear-gradient(135deg,#2a1d00,#6b4b00 45%,#2a1d00);' },
    rank_ace:     { name: 'آس الأساطير', rank: 'ace', animated: true, css: 'background:linear-gradient(135deg,#001a12,#0a4b2d 40%,#003a4a 70%,#001a12);' },
    bg_midnight:  { name: 'منتصف الليل', price: 150, animated: false, css: 'background:linear-gradient(160deg,#0a0a1f,#12123a);' },
    bg_forest:    { name: 'الغابة', price: 150, animated: false, css: 'background:linear-gradient(160deg,#04140a,#0b3a1c);' },
    bg_crimson:   { name: 'قرمزي', price: 150, animated: false, css: 'background:linear-gradient(160deg,#1c0408,#4a0d18);' },
    bg_aurora:    { name: 'الشفق', price: 400, animated: true, css: 'background:linear-gradient(120deg,#052b2b,#1b0b4a,#0b4a2d,#052b2b);' },
    bg_scan:      { name: 'ماسح ضوئي', price: 400, animated: true, css: 'background:#020a02;' },
    bg_plasma:    { name: 'بلازما', price: 450, animated: true, css: 'background:linear-gradient(120deg,#2b0a3a,#0a2b4a,#3a0a2b,#2b0a3a);' },
    // game owner only (database nameTag === "gameowner"): never sold, never shown to other players in the shop
    owner_gold:   { name: 'ذهب المالك', owner: true, animated: true, css: 'background:#3a2600;' }
  };
  var FRAMES = {
    rank_diamond: { name: 'إطار الألماس', rank: 'diamond', animated: true },
    rank_crown:   { name: 'إطار التاج', rank: 'crown', animated: true },
    rank_ace:     { name: 'إطار الآس', rank: 'ace', animated: true },
    fr_lime:      { name: 'ليموني', price: 200, animated: false },
    fr_cyan:      { name: 'سماوي', price: 200, animated: false },
    fr_gold:      { name: 'ذهبي', price: 250, animated: false },
    fr_dashed:    { name: 'متقطع', price: 200, animated: false },
    fr_pulse:     { name: 'نبض', price: 500, animated: true },
    fr_rainbow:   { name: 'قوس قزح', price: 550, animated: true },
    fr_glitch:    { name: 'تشويش', price: 550, animated: true },
    owner_gold:   { name: 'ذهب المالك', owner: true, animated: true }
  };

  // ---- styles ----------------------------------------------------------------------------------
  function css() {
    if (document.getElementById('ejcos-css')) return;
    var o = '';
    Object.keys(BACKGROUNDS).forEach(function (k) { o += '.cos-bg-' + k + '{' + BACKGROUNDS[k].css + 'background-size:300% 300%;}\n'; });
    o +=
      // animated backgrounds
      '.cos-bg-rank_diamond,.cos-bg-rank_crown,.cos-bg-rank_ace,.cos-bg-bg_aurora,.cos-bg-bg_plasma{animation:cosShift 7s ease-in-out infinite}' +
      '@keyframes cosShift{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}' +
      '.cos-bg-bg_scan{position:relative;overflow:hidden}' +
      '.cos-bg-bg_scan::after{content:"";position:absolute;left:0;right:0;top:-40%;height:40%;background:linear-gradient(180deg,transparent,rgba(163,230,53,.18),transparent);animation:cosScan 3s linear infinite;pointer-events:none}' +
      '@keyframes cosScan{to{top:110%}}' +
      // frames
      '[class*="cos-fr-"]{position:relative}' +
      '.cos-fr-fr_lime{border-color:#a3e635!important;box-shadow:0 0 0 1px #a3e635,0 0 14px rgba(163,230,53,.45)}' +
      '.cos-fr-fr_cyan{border-color:#00f2ff!important;box-shadow:0 0 0 1px #00f2ff,0 0 14px rgba(0,242,255,.45)}' +
      '.cos-fr-fr_gold{border-color:#fbbf24!important;box-shadow:0 0 0 1px #fbbf24,0 0 14px rgba(251,191,36,.45)}' +
      '.cos-fr-fr_dashed{border:2px dashed #a3e635!important;box-shadow:0 0 10px rgba(163,230,53,.3)}' +
      '.cos-fr-fr_pulse{border-color:#00f2ff!important;animation:cosPulse 1.6s ease-in-out infinite}' +
      '@keyframes cosPulse{0%,100%{box-shadow:0 0 0 1px #00f2ff,0 0 6px rgba(0,242,255,.3)}50%{box-shadow:0 0 0 2px #a3e635,0 0 22px rgba(163,230,53,.7)}}' +
      '.cos-fr-fr_rainbow{border-color:transparent!important;background-clip:padding-box;box-shadow:0 0 0 2px transparent}' +
      '.cos-fr-fr_rainbow::before{content:"";position:absolute;inset:-2px;border-radius:inherit;padding:2px;background:conic-gradient(from 0deg,#f43f5e,#f59e0b,#a3e635,#00f2ff,#8b5cf6,#f43f5e);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;animation:cosSpin 4s linear infinite;pointer-events:none}' +
      '@keyframes cosSpin{to{filter:hue-rotate(360deg)}}' +
      '.cos-fr-fr_glitch{border-color:#00f2ff!important;animation:cosGlitch 2.4s steps(1) infinite}' +
      '@keyframes cosGlitch{0%,90%,100%{box-shadow:0 0 0 1px #00f2ff;transform:none}92%{box-shadow:-3px 0 0 1px #f43f5e,3px 0 0 1px #00f2ff;transform:translateX(1px)}95%{box-shadow:3px 0 0 1px #f43f5e,-3px 0 0 1px #a3e635;transform:translateX(-1px)}}' +
      // rank frames — better with every tier
      '.cos-fr-rank_diamond{border-color:#67e8f9!important;animation:cosDia 2.4s ease-in-out infinite}' +
      '@keyframes cosDia{0%,100%{box-shadow:0 0 0 1px #67e8f9,0 0 10px rgba(103,232,249,.5)}50%{box-shadow:0 0 0 2px #e0faff,0 0 22px rgba(103,232,249,.9)}}' +
      '.cos-fr-rank_crown{border-color:#fbbf24!important;animation:cosCrown 2.2s ease-in-out infinite}' +
      '@keyframes cosCrown{0%,100%{box-shadow:0 0 0 2px #b45309,0 0 16px rgba(251,191,36,.55)}50%{box-shadow:0 0 0 2px #fde68a,0 0 32px rgba(251,191,36,.95)}}' +
      '.cos-fr-rank_ace{border-color:transparent!important;box-shadow:0 0 26px rgba(163,230,53,.55),0 0 48px rgba(0,242,255,.3)}' +
      '.cos-fr-rank_ace::before{content:"";position:absolute;inset:-3px;border-radius:inherit;padding:3px;background:conic-gradient(from 0deg,#a3e635,#00f2ff,#fbbf24,#a3e635);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;animation:cosSpin 2.5s linear infinite;pointer-events:none}' +
      // ---- OWNER GOLD (game owner only) — golden, moving, legendary ------------------------------
      '.cos-bg-owner_gold{background:radial-gradient(circle,rgba(255,244,180,.95) 0 1.3px,transparent 2px),radial-gradient(circle,rgba(255,211,77,.85) 0 1px,transparent 1.7px),linear-gradient(115deg,#2a1c00 0%,#7a5200 16%,#e8b100 30%,#fff3b0 40%,#e8b100 50%,#7a5200 64%,#2a1c00 80%,#7a5200 100%);background-size:46px 38px,29px 33px,300% 300%;background-position:0 0,13px 9px,0% 50%;animation:ownerShift 6s linear infinite;position:relative;color:#fff6c8;text-shadow:0 1px 3px rgba(60,30,0,.85)}' +
      '@keyframes ownerShift{0%{background-position:0 0,13px 9px,0% 50%}100%{background-position:46px 38px,-16px 42px,100% 50%}}' +
      '.cos-bg-owner_gold::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;background:linear-gradient(100deg,transparent 38%,rgba(255,255,255,.55) 50%,transparent 62%);background-size:260% 100%;background-position:150% 0;animation:ownerSweep 3.4s ease-in-out infinite}' +
      '@keyframes ownerSweep{0%{background-position:150% 0}60%,100%{background-position:-60% 0}}' +
      '@property --oa{syntax:"<angle>";inherits:false;initial-value:0deg}' +
      '.cos-fr-owner_gold{border-color:transparent!important;box-shadow:0 0 18px rgba(255,200,40,.65),0 0 44px rgba(255,170,0,.35)}' +
      '.cos-fr-owner_gold::before{content:"";position:absolute;inset:-3px;border-radius:inherit;padding:3px;background:conic-gradient(from var(--oa),#7a5200,#ffd34d,#fff8d0,#ffd34d,#7a5200,#ffd34d,#fff8d0,#ffd34d,#7a5200);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;animation:ownerSpin 3s linear infinite,ownerGlow 2.2s ease-in-out infinite;pointer-events:none}' +
      '@keyframes ownerSpin{to{--oa:360deg}}' +
      '@keyframes ownerGlow{0%,100%{filter:drop-shadow(0 0 3px rgba(255,200,40,.7)) brightness(1)}50%{filter:drop-shadow(0 0 10px rgba(255,220,90,1)) brightness(1.25)}}' +
      // ---- legacy entry (every colour comes from the player's RANK colour: --rc / --rgb) ----------
      '.cos-entry{position:fixed;inset:0;z-index:99997;pointer-events:none;display:flex;align-items:center;justify-content:center;overflow:hidden;--rc:#ffd700;--rgb:255,215,0}' +
      '.cos-entry .tag{position:relative;text-align:center;font-weight:900;white-space:nowrap;color:#fff}' +
      '.cos-entry .nm{font-size:clamp(20px,5.2vw,40px);color:var(--rc);text-shadow:0 0 18px var(--rc)}' +
      '.cos-entry .sub{font-size:clamp(11px,2.6vw,15px);letter-spacing:.35em;opacity:.9;margin-top:4px;color:#fff}' +
      '.cos-entry .rk{margin-top:10px;display:flex;flex-direction:column;align-items:center;gap:5px}' +
      '.cos-entry .rk img,.cos-entry .rk .fb{width:clamp(56px,15vw,88px);height:clamp(56px,15vw,88px);object-fit:contain;filter:drop-shadow(0 0 12px var(--rc)) drop-shadow(0 0 28px rgba(var(--rgb),.65));animation:cosRk 1.6s ease-in-out infinite}' +
      '.cos-entry .rk .fb{font-size:clamp(44px,12vw,68px);display:flex;align-items:center;justify-content:center;line-height:1}' +
      '.cos-entry .rkn{font-size:clamp(13px,3.4vw,20px);letter-spacing:.22em;color:var(--rc);text-shadow:0 0 12px var(--rc);text-transform:uppercase}' +
      '@keyframes cosRk{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-3px) scale(1.06)}}' +
      // crown — rank-coloured sweep banner, 3.6s
      '.cos-entry.crown{animation:cosFadeC 3.6s ease-out forwards}' +
      '.cos-entry.crown::before{content:"";position:absolute;left:0;right:0;top:50%;height:min(300px,46vh);transform:translateY(-50%);background:linear-gradient(90deg,transparent,rgba(var(--rgb),.22),rgba(var(--rgb),.45),rgba(var(--rgb),.22),transparent);animation:cosSweep 3.6s ease-out forwards}' +
      '.cos-entry.crown .tag{animation:cosPop 3.6s ease-out forwards}' +
      '@keyframes cosFadeC{0%{opacity:0}10%{opacity:1}85%{opacity:1}100%{opacity:0}}' +
      '@keyframes cosSweep{0%{transform:translateY(-50%) scaleX(0)}25%{transform:translateY(-50%) scaleX(1)}100%{transform:translateY(-50%) scaleX(1)}}' +
      '@keyframes cosPop{0%{transform:scale(.4);opacity:0}18%{transform:scale(1.15);opacity:1}30%{transform:scale(1)}100%{transform:scale(1)}}' +
      // ace — flash, lightning, big title, particles, 5s (all in the rank colour)
      '.cos-entry.ace{animation:cosFadeA 5s ease-out forwards;background:radial-gradient(circle at 50% 50%,rgba(var(--rgb),.22),rgba(0,0,0,.74) 70%)}' +
      '.cos-entry.ace::before{content:"";position:absolute;inset:0;background:var(--rc);animation:cosFlash 5s ease-out forwards}' +
      '.cos-entry.ace .bolt{position:absolute;top:-10%;width:3px;height:120%;background:linear-gradient(180deg,transparent,var(--rc),#fff,var(--rc),transparent);filter:drop-shadow(0 0 10px var(--rc));opacity:0;animation:cosBolt 5s linear forwards}' +
      '.cos-entry.ace .tag{animation:cosPopA 5s cubic-bezier(.2,1.4,.4,1) forwards}' +
      '.cos-entry.ace .big{font-size:clamp(44px,13vw,110px);line-height:1;letter-spacing:.12em;background:linear-gradient(90deg,var(--rc),rgba(var(--rgb),.4),var(--rc),rgba(var(--rgb),.4),var(--rc));background-size:300% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:cosShift 1.6s linear infinite;filter:drop-shadow(0 0 18px var(--rc))}' +
      '.cos-entry.ace .p{position:absolute;width:6px;height:6px;border-radius:50%;background:var(--rc);box-shadow:0 0 10px var(--rc);opacity:0;animation:cosPart 2.4s ease-out forwards}' +
      '@keyframes cosFadeA{0%{opacity:0}6%{opacity:1}88%{opacity:1}100%{opacity:0}}' +
      '@keyframes cosFlash{0%{opacity:.85}14%{opacity:0}100%{opacity:0}}' +
      '@keyframes cosBolt{0%,10%{opacity:0}14%{opacity:1}22%{opacity:.2}28%{opacity:1}40%,100%{opacity:0}}' +
      '@keyframes cosPopA{0%{transform:scale(.2) rotate(-6deg);opacity:0}16%{transform:scale(1.2) rotate(1deg);opacity:1}26%{transform:scale(1) rotate(0)}100%{transform:scale(1)}}' +
      '@keyframes cosPart{0%{transform:translate(0,0) scale(1);opacity:1}100%{transform:translate(var(--dx),var(--dy)) scale(0);opacity:0}}' +
      '@keyframes cosShake{0%,100%{transform:none}20%{transform:translate(-5px,3px)}40%{transform:translate(5px,-3px)}60%{transform:translate(-3px,-2px)}80%{transform:translate(3px,2px)}}' +
      '@media (prefers-reduced-motion:reduce){.cos-entry,.cos-entry *{animation-duration:.01s!important}.cos-bg-owner_gold,.cos-bg-owner_gold::after,.cos-fr-owner_gold::before{animation:none!important}}';
    var st = document.createElement('style'); st.id = 'ejcos-css'; st.textContent = o; document.head.appendChild(st);
  }

  // ---- usage rules -----------------------------------------------------------------------------
  // The game-owner flag comes ONLY from the database (players/{uid}/nameTag === 'gameowner'), same as the GAME OWNER tag.
  function isOwner(p) {
    if (!p) return false;
    if (p.nameTag === 'gameowner' || p.owner === true) return true;
    var inv = p.inventory && p.inventory.nameTags;
    return Array.isArray(inv) && inv.indexOf('gameowner') >= 0;
  }
  function isUsable(id, kind, points, owner) {
    var cat = kind === 'frame' ? FRAMES : BACKGROUNDS;
    var it = cat[id]; if (!it) return false;
    if (it.owner) return owner === true;                                     // owner gear needs the owner flag
    if (it.rank) return tierIndex(tierOf(points)) >= tierIndex(it.rank);   // rank gear needs the rank
    return true;                                                            // shop gear: ownership is checked at purchase/equip time
  }
  function available(kind, points, inventory, owner) {
    var cat = kind === 'frame' ? FRAMES : BACKGROUNDS, inv = Array.isArray(inventory) ? inventory : [];
    return Object.keys(cat).filter(function (k) { return (cat[k].rank || cat[k].owner) ? isUsable(k, kind, points, owner) : inv.indexOf(k) >= 0; });
  }
  function decorate(el, p) {
    if (!el) return;
    css();
    Array.prototype.slice.call(el.classList).forEach(function (c) { if (c.indexOf('cos-bg-') === 0 || c.indexOf('cos-fr-') === 0) el.classList.remove(c); });
    if (!p) return;
    var own = isOwner(p);
    if (p.cardBg && isUsable(p.cardBg, 'bg', p.rankPoints, own)) el.classList.add('cos-bg-' + p.cardBg);
    if (p.cardFrame && isUsable(p.cardFrame, 'frame', p.rankPoints, own)) el.classList.add('cos-fr-' + p.cardFrame);
  }

  // ---- legacy entry ----------------------------------------------------------------------------
  var playing = false, queue = [];
  function hexToRgb(h) {
    h = String(h || '#ffffff').replace('#', ''); if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    return parseInt(h.slice(0, 2), 16) + ',' + parseInt(h.slice(2, 4), 16) + ',' + parseInt(h.slice(4, 6), 16);
  }
  function rankInfo(points) { try { return window.NameThemes && window.NameThemes.getRank ? window.NameThemes.getRank(points) : null; } catch (e) { return null; } }
  function playEntry(p) {
    var tier = tierOf(p && p.rankPoints);
    if (tier !== 'crown' && tier !== 'ace') return false;
    if (playing) { if (queue.length < 3) queue.push(p); return true; }
    css(); playing = true;
    var ace = tier === 'ace', ms = ace ? 5000 : 3600;
    var info = rankInfo(p.rankPoints) || {};
    var color = info.color || (ace ? '#ffffff' : '#ffd700');
    var root = document.createElement('div'); root.className = 'cos-entry ' + tier; root.setAttribute('aria-hidden', 'true');
    root.style.setProperty('--rc', color); root.style.setProperty('--rgb', hexToRgb(color));   // every effect colour follows the rank colour
    var tag = document.createElement('div'); tag.className = 'tag';
    if (ace) {
      [18, 38, 62, 84].forEach(function (x) { var b = document.createElement('i'); b.className = 'bolt'; b.style.left = x + '%'; b.style.animationDelay = (x % 7) * 0.04 + 's'; root.appendChild(b); });
      for (var i = 0; i < 26; i++) {
        var pt = document.createElement('i'); pt.className = 'p';
        var a = Math.random() * Math.PI * 2, d = 120 + Math.random() * 260;
        pt.style.left = '50%'; pt.style.top = '50%'; pt.style.setProperty('--dx', Math.cos(a) * d + 'px'); pt.style.setProperty('--dy', Math.sin(a) * d + 'px');
        pt.style.animationDelay = (0.5 + Math.random() * 0.6) + 's'; root.appendChild(pt);
      }
      var big = document.createElement('div'); big.className = 'big'; big.textContent = 'ACE'; tag.appendChild(big);
    }
    var nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = (p && p.username) || '';
    var sub = document.createElement('div'); sub.className = 'sub'; sub.textContent = ace ? 'انضم إلى الغرفة · أسطورة' : 'انضم إلى الغرفة · تاج';
    tag.appendChild(nm); tag.appendChild(sub);
    // rank icon, and under it the rank name
    var rk = document.createElement('div'); rk.className = 'rk';
    var fb = function () { var f = document.createElement('div'); f.className = 'fb'; f.textContent = info.icon || (ace ? '🃏' : '👑'); return f; };
    if (info.image) {
      var img = document.createElement('img'); img.src = info.image; img.alt = info.nameAr || info.name || '';
      img.onerror = function () { img.replaceWith(fb()); };
      rk.appendChild(img);
    } else rk.appendChild(fb());
    var rn = document.createElement('div'); rn.className = 'rkn'; rn.textContent = (info.nameAr ? info.nameAr + ' · ' : '') + (info.name || (ace ? 'Ace' : 'Crown'));
    rk.appendChild(rn); tag.appendChild(rk);
    root.appendChild(tag);
    document.body.appendChild(root);
    if (ace) { document.body.style.animation = 'cosShake .45s 1'; setTimeout(function () { document.body.style.animation = ''; }, 500); }
    setTimeout(function () { root.remove(); playing = false; var n = queue.shift(); if (n) playEntry(n); }, ms);
    return true;
  }

  window.EJCos = {
    MIN: MIN, tierOf: tierOf, tierIndex: tierIndex,
    backgrounds: BACKGROUNDS, frames: FRAMES,
    isOwner: isOwner, isUsable: isUsable, available: available, decorate: decorate, playEntry: playEntry, injectCss: css
  };
  css();   // styles are injected on load so previews (shop) work without calling decorate() first
})();
