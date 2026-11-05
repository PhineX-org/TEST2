// ============================================
// EL JASUS — FX  (vanilla ports of reactbits.dev-style effects)
// reactbits.dev ships React components; this game is plain HTML, so these are dependency-free re-implementations
// of the same ideas (same look & feel), not the React code itself.
//
//   .rb-shiny        ShinyText    – light sweep across text
//   .rb-spot         SpotlightCard– glow that follows the pointer inside a card
//   .rb-magnet       Magnet       – element leans toward the pointer (desktop only)
//   [data-rb-blur]   BlurText     – words fade in from blur, one by one (when scrolled into view)
//   [data-rb-count]  CountUp      – number counts up to its value   (data-rb-count="1250")
//   click sparks     ClickSpark   – tiny lime sparks on every tap/click (EJFX.sparks(false) to disable)
// Everything respects prefers-reduced-motion.
// ============================================
(function () {
    'use strict';
    if (window.EJFX) return;
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    var fine = window.matchMedia && matchMedia('(hover:hover) and (pointer:fine)').matches;

    var css = document.createElement('style');
    css.textContent = [
        '.rb-shiny{background:linear-gradient(110deg,currentColor 40%,#fff 50%,currentColor 60%);background-size:220% 100%;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;animation:rbShine 3.2s linear infinite}',
        '@keyframes rbShine{from{background-position:150% 0}to{background-position:-50% 0}}',
        '.rb-spot{position:relative}',
        '.rb-spot::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;opacity:0;transition:opacity .3s;background:radial-gradient(260px circle at var(--mx,50%) var(--my,50%),rgba(163,230,53,.14),transparent 70%)}',
        '.rb-spot.rb-on::after{opacity:1}',
        '.rb-magnet{transition:transform .25s cubic-bezier(.2,.8,.2,1);will-change:transform}',
        '[data-rb-blur] .rb-w{display:inline-block;opacity:0;filter:blur(10px);transform:translateY(8px);transition:opacity .6s ease,filter .6s ease,transform .6s ease;transition-delay:calc(var(--i)*70ms)}',
        '[data-rb-blur].rb-in .rb-w{opacity:1;filter:none;transform:none}',
        '.rb-spark{position:fixed;width:6px;height:6px;border-radius:50%;pointer-events:none;z-index:2147482000;background:#a3e635;box-shadow:0 0 8px #a3e635}',
        '@media (prefers-reduced-motion:reduce){.rb-shiny{animation:none;-webkit-text-fill-color:currentColor}[data-rb-blur] .rb-w{opacity:1;filter:none;transform:none;transition:none}}'
    ].join('');
    document.head.appendChild(css);

    function each(sel, fn, root) { [].forEach.call((root || document).querySelectorAll(sel), fn); }

    // SpotlightCard
    function spot(el) {
        if (el.__rbSpot) return; el.__rbSpot = 1;
        el.addEventListener('pointermove', function (e) { var r = el.getBoundingClientRect(); el.style.setProperty('--mx', (e.clientX - r.left) + 'px'); el.style.setProperty('--my', (e.clientY - r.top) + 'px'); el.classList.add('rb-on'); }, { passive: true });
        el.addEventListener('pointerleave', function () { el.classList.remove('rb-on'); });
    }
    // Magnet
    function magnet(el) {
        if (el.__rbMag || !fine || reduce) return; el.__rbMag = 1;
        var s = parseFloat(el.getAttribute('data-rb-strength')) || 0.25;
        el.addEventListener('pointermove', function (e) { var r = el.getBoundingClientRect(); el.style.transform = 'translate(' + ((e.clientX - r.left - r.width / 2) * s) + 'px,' + ((e.clientY - r.top - r.height / 2) * s) + 'px)'; });
        el.addEventListener('pointerleave', function () { el.style.transform = ''; });
    }
    // BlurText
    var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (en) { en.forEach(function (x) { if (x.isIntersecting) { x.target.classList.add('rb-in'); io.unobserve(x.target); } }); }, { threshold: 0.2 }) : null;
    function blur(el) {
        if (el.__rbBlur) return; el.__rbBlur = 1;
        var words = el.textContent.trim().split(/\s+/);
        el.setAttribute('aria-label', el.textContent.trim());
        el.innerHTML = words.map(function (w, i) { return '<span class="rb-w" aria-hidden="true" style="--i:' + i + '">' + w.replace(/</g, '&lt;') + '</span>'; }).join(' ');
        io ? io.observe(el) : el.classList.add('rb-in');
    }
    // CountUp
    function count(el) {
        if (el.__rbCount) return; el.__rbCount = 1;
        var to = parseFloat(el.getAttribute('data-rb-count')); if (isNaN(to)) return;
        if (reduce) { el.textContent = Math.round(to).toLocaleString('en-US'); return; }
        var t0 = null, dur = 900;
        function step(t) { if (!t0) t0 = t; var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = Math.round(to * e).toLocaleString('en-US'); if (k < 1) requestAnimationFrame(step); }
        requestAnimationFrame(step);
    }
    // ClickSpark
    var sparksOn = true;
    function spark(x, y) {
        for (var i = 0; i < 8; i++) {
            var d = document.createElement('i'); d.className = 'rb-spark'; d.style.left = x - 3 + 'px'; d.style.top = y - 3 + 'px';
            document.body.appendChild(d);
            var a = (i / 8) * Math.PI * 2 + Math.random() * 0.5, dist = 18 + Math.random() * 18;
            d.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: 'translate(' + Math.cos(a) * dist + 'px,' + Math.sin(a) * dist + 'px) scale(.2)', opacity: 0 }], { duration: 420, easing: 'ease-out' }).onfinish = (function (n) { return function () { n.remove(); }; })(d);
        }
    }
    document.addEventListener('pointerdown', function (e) { if (sparksOn && !reduce && !document.getElementById('ejt-root')) spark(e.clientX, e.clientY); }, { passive: true, capture: true });

    function scan(root) {
        each('.rb-spot', spot, root); each('.rb-magnet', magnet, root); each('[data-rb-blur]', blur, root); each('[data-rb-count]', count, root);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { scan(); }); else scan();

    window.EJFX = { scan: scan, sparks: function (on) { sparksOn = !!on; }, spark: spark };
})();
