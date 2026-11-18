/* ============================================================================
   EL JASUS — SMOOTH UI (EJSmooth)
   One shared file that makes every page feel fluid: page-to-page transitions, soft entrance of lists/cards,
   press / hover feedback, tab switching, modal pop-in, smooth scrolling.
   Rules it follows so it never breaks a page:
   • all CSS uses :where() (specificity 0) → a page's own CSS always wins;
   • hover/press use the independent `translate` / `scale` properties → they never fight a page's `transform`;
   • body only fades (no transform), so position:fixed layers keep working;
   • everything is switched off for prefers-reduced-motion.
   ============================================================================ */
(function () {
  'use strict';
  if (window.EJSmooth) return;
  var CSS = [
    ':root{--ej-ease:cubic-bezier(.22,1,.36,1);--ej-spring:cubic-bezier(.34,1.56,.64,1);}',
    '@view-transition{navigation:auto;}',
    '::view-transition-old(root){animation:ejVtOut .22s ease both;}',
    '::view-transition-new(root){animation:ejVtIn .32s var(--ej-ease) both;}',
    '@keyframes ejVtOut{to{opacity:0}}@keyframes ejVtIn{from{opacity:0}}',
    '@media (prefers-reduced-motion:no-preference){',
    ' :where(html){scroll-behavior:smooth;}',
    ' :where(body){animation:ejPageIn .45s var(--ej-ease) backwards;}',
    ' :where(body.ej-leaving){opacity:0;transition:opacity .16s ease;pointer-events:none;}',
    ' @keyframes ejPageIn{from{opacity:0}to{opacity:1}}',
    ' @keyframes ejRise{from{opacity:0;translate:0 14px}to{opacity:1;translate:0 0}}',
    ' @keyframes ejPop{from{opacity:0;translate:0 12px;scale:.95}to{opacity:1;translate:0 0;scale:1}}',
    ' @keyframes ejFade{from{opacity:0}to{opacity:1}}',
    ' @keyframes ejShimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}',
    /* soft state changes on interactive things */
    ' :where(a,button,.btn,[role=button],.tab-btn,.mode-btn,.filter-chip,.nav-item,input,select,textarea,.badge,.glass,.card){',
    '   transition-property:background-color,border-color,color,box-shadow,opacity,translate,scale,filter;',
    '   transition-duration:.22s;transition-timing-function:var(--ej-ease);}',
    ' :where(button,.btn,[role=button],.tab-btn,.mode-btn,.filter-chip,.cyber-btn,.nav-item):active{scale:.965;transition-duration:.08s;}',
    ' :where(input,select,textarea):focus{box-shadow:0 0 0 3px rgba(0,242,255,.18);}',
    ' @media (hover:hover){',
    '   :where(.card,.room-card,.friend-card,.shop-item,.lb-row,.thread,.report-card):hover{translate:0 -2px;}',
    '   :where(button,.btn,.cyber-btn,.tab-btn,.mode-btn,.filter-chip):not(:disabled):hover{filter:brightness(1.12);}',
    '   :where(.nav-item):hover{translate:-3px 0;}',
    ' }',
    /* tab / section panes fade in every time they are shown */
    ' :where(.tab-content,.admin-section,[id^=tab-],[id$=-tab]):not(.hidden):not([hidden]){animation:ejRise .38s var(--ej-ease) backwards;}',
    /* things we tag from JS */
    ' .ej-rise{animation:ejRise .45s var(--ej-ease) backwards;animation-delay:calc(var(--ej-i,0) * 45ms);}',
    ' .ej-pop{animation:ejPop .3s var(--ej-spring) backwards;}',
    ' .ej-fade{animation:ejFade .2s ease backwards;}',
    ' :where(.skeleton,.loading-shimmer){background:linear-gradient(90deg,rgba(255,255,255,.04) 25%,rgba(255,255,255,.12) 50%,rgba(255,255,255,.04) 75%);background-size:200% 100%;animation:ejShimmer 1.4s linear infinite;}',
    ' :where(progress,.progress-bar,[class*=progress-fill]){transition:width .6s var(--ej-ease);}',
    '}',
    '@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-delay:0s!important;transition-duration:.01ms!important;scroll-behavior:auto!important;}}'
  ].join('\n');

  var st = document.createElement('style'); st.id = 'ej-smooth-style'; st.textContent = CSS;
  (document.head || document.documentElement).appendChild(st);

  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion:reduce)').matches;
  var LISTY = /(list|grid|cards|table|threads|messages|results|rows|feed|tbody)/i;

  function hasAnim(el) { try { var a = getComputedStyle(el).animationName; return a && a !== 'none'; } catch (e) { return false; } }

  // new children of list-like containers rise in one after another; new full-screen layers pop in
  function onAdded(node, parent) {
    if (reduce || node.nodeType !== 1 || node.classList.contains('ej-rise') || node.classList.contains('ej-pop')) return;
    var tag = node.tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'LINK') return;
    if (parent && (LISTY.test(parent.id || '') || LISTY.test(typeof parent.className === 'string' ? parent.className : '') || parent.tagName === 'TBODY') && !hasAnim(node)) {
      var idx = Array.prototype.indexOf.call(parent.children, node);
      if (idx > 14) return;                          // long lists: don't delay the tail
      node.style.setProperty('--ej-i', idx < 0 ? 0 : idx);
      node.classList.add('ej-rise');
      node.addEventListener('animationend', function () { node.classList.remove('ej-rise'); node.style.removeProperty('--ej-i'); }, { once: true });
      return;
    }
    if (parent === document.body && !hasAnim(node)) {
      var cs = getComputedStyle(node);
      if (cs.position === 'fixed') {
        var inner = node.firstElementChild;
        node.classList.add('ej-fade');
        node.addEventListener('animationend', function () { node.classList.remove('ej-fade'); }, { once: true });
        if (inner && !hasAnim(inner)) { inner.classList.add('ej-pop'); inner.addEventListener('animationend', function () { inner.classList.remove('ej-pop'); }, { once: true }); }
      }
    }
  }
  function observe() {
    if (reduce || !window.MutationObserver) return;
    new MutationObserver(function (muts) {
      muts.forEach(function (m) { for (var i = 0; i < m.addedNodes.length && i < 40; i++) onAdded(m.addedNodes[i], m.target); });
    }).observe(document.body, { childList: true, subtree: true });
  }

  // browsers without cross-document view transitions: quick fade-out before following a plain link
  var nativeVT = typeof window.CSSViewTransitionRule !== 'undefined';
  function linkFade() {
    if (nativeVT || reduce) return;
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href]');
      if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (a.target && a.target !== '_self') return;
      var u; try { u = new URL(a.href, location.href); } catch (x) { return; }
      if (u.origin !== location.origin || u.pathname === location.pathname || a.hasAttribute('download') || /^(mailto|tel|javascript):/i.test(a.getAttribute('href'))) return;
      e.preventDefault();
      document.body.classList.add('ej-leaving');
      setTimeout(function () { location.href = a.href; }, 150);
    });
    window.addEventListener('pageshow', function (ev) { if (ev.persisted) document.body.classList.remove('ej-leaving'); });
  }

  function init() { observe(); linkFade(); }
  if (document.body) init(); else document.addEventListener('DOMContentLoaded', init);
  window.EJSmooth = { version: '1.0' };
})();
