// ============================================
// EL JASUS — TUTORIAL  (multi-page, with the 3D spy guide)
//
//  • Shows once for a new player: players/{uid}/tutorial === "ns" (not seen)  →  "seen" when finished (or skipped)
//  • Starts on home.html and follows the player to shop / leaderboard / friends (progress kept in sessionStorage)
//  • While it is open every touch / click outside the tutorial card is blocked — the player can only use
//    Previous / Next / Finish (and Skip)
//  • Replay any time:  EJTutorial.start()   or open  home.html?tutorial=1
//  Needs: spy3d.js, friend-invite-enhanced.js (for the shared Firebase connection)
// ============================================
(function () {
    'use strict';
    if (window.EJTutorial) return;

    var KEY = 'ej_tut_i';
    var page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();

    // ── steps ─────────────────────────────────────
    // page:   file the step lives on (a step on another page navigates there)
    // target: selector or function → element to highlight (none / hidden = centered card)
    // pose:   3D spy pose   before: runs when the step opens
    var STEPS = [
        { page: 'home.html', pose: 'wave', title: 'أهلاً يا عميل! 🕵️', text: 'أنا مرشدك في «الجاسوس». جولة سريعة (دقيقتين) وهتعرف كل حاجة في اللعبة. تقدر تتنقل بـ التالي / السابق.' },
        { page: 'home.html', pose: 'point', target: function () { var b = document.getElementById('setLocal'); return b && b.parentElement; }, before: function () { call('switchMode', 'local'); },
          title: 'اختار طريقة اللعب', text: '🏠 محلي: جهاز واحد بتمرّروه بينكم. 🌐 أونلاين: غرفة مع أصحابك. 🤖 ضد الذكاء الاصطناعي: الـ AI بيفتكر الإجابات ويشكّ في اللي بيرد غريب!' },
        { page: 'home.html', pose: 'pointLeft', target: '#gameCat', before: function () { call('switchMode', 'local'); },
          title: 'اختار الفئة', text: 'أماكن، أكل، حيوانات… وفيه فئة جديدة «مشاهير اللاعبين» ⚽. الكلمة السرية بتطلع منها.' },
        { page: 'home.html', pose: 'explain', target: function () { var b = document.getElementById('createBtn'); return b && b.parentElement; }, before: function () { call('switchMode', 'online'); },
          title: 'إنشاء غرفة أو انضمام', text: 'اعمل غرفة عامة (الكل يشوفها) أو خاصة (بالكود بس) وادخل بكود صاحبك. الغرفة تسع لحد ١٥ لاعب.' },
        { page: 'home.html', pose: 'point', target: '#publicRoomsLink', before: function () { call('switchMode', 'online'); },
          title: 'الغرف العامة', text: 'هنا تلاقي غرف مفتوحة تنضم لها فوراً. لو فيه لعبة شغالة ممكن تتفرج، ولو فاضية هتلاقيها «غرفة فاضية 👻» تقدر تبدأ فيها.' },
        { page: 'home.html', pose: 'explain', title: 'إزاي الجولة بتمشي؟', text: 'كل لاعب بيشوف الكلمة السرية ما عدا الجاسوس. بتسألوا بعض أسئلة، بتناقشوا، وبعدين بتصوّتوا. تكتشفوا الجاسوس تكسبوا — يخمّن الكلمة صح هو اللي يكسب. وممكن يبقى فيه ١–٣ جواسيس حسب عدد اللاعبين.' },
        { page: 'home.html', pose: 'point', title: 'إعدادات الغرفة ⚙️', text: 'صاحب الغرفة يضبط عدد الجواسيس ومؤقت النقاش والتصويت من لوحة الإعدادات — زي Among Us. والمؤقت يقفل المرحلة تلقائي.' },
        { page: 'home.html', pose: 'wave', title: 'شات، صوت وردود فعل 🎙️', text: 'جوه الغرفة: شات نصي (١٠٠ حرف + إيموجي)، دردشة صوتية بالميكروفون، وردود فعل سريعة (إيموجي + صوت) بتطلع فوق الشاشة باسمك.' },
        { page: 'home.html', pose: 'thumbs', title: 'مفاتيح المواصفات 🔑', text: 'لو تهت، مفتاح المواصفات بيكشفلك تلميح عن الكلمة السرية. تشتري لحد ٥ من المتجر، ولكل لعبة مفتاحين بس — عشان اللعب يفضل عادل.' },
        { page: 'home.html', pose: 'explain', title: 'الرتب والمواسم 👑', text: 'من برونز لحد كراون وإيس — الرتب العالية ليها أنيميشن دخول وخلفيات وإطارات خاصة لبطاقة اسمك. كل شهرين موسم جديد وبتنزل نقاطك شوية عشان المنافسة تفضل شغالة.' },
        { page: 'home.html', pose: 'point', target: '#openNav', title: 'القائمة', text: 'من هنا توصل للملف الشخصي والأصدقاء والمتصدرين والمتجر وتبلّغ عن مشكلة. هنزور كام صفحة سوا.' },
        { page: 'shop.html', pose: 'point', target: function () { var b = document.querySelector('.tab-btn[data-tab="bgs"]'); return b && b.parentElement; },
          title: 'المتجر 🛒', text: 'ثيمات وألقاب وخلفيات وإطارات لبطاقة اسمك ومفاتيح المواصفات. كله شكل بس — مفيش حاجة بتديك أفضلية في اللعب.' },
        { page: 'leaderboard.html', pose: 'thumbs', title: 'المتصدرين 🏆', text: 'شوف ترتيبك مقابل باقي اللاعبين. كل فوز بيرفع نقاطك، وسلسلة الانتصارات بتجيبلك شارات.' },
        { page: 'friends.html', pose: 'point', target: function () { var b = document.getElementById('tab-friends'); return b && b.parentElement; },
          title: 'الأصدقاء 👥', text: 'ضيف أصحابك بالكود وشوف مين أونلاين — «في غرفة» أو «في لعبة» — وابعتلهم دعوة تنضموا سوا.' },
        { page: 'friends.html', pose: 'wave', title: 'خلصنا! 🎉', text: 'جاهز يا عميل. اضغط «إنهاء» وابدأ أول لعبة. تقدر تعيد الجولة دي أي وقت من القائمة.' }
    ];

    function call(name) { try { var a = [].slice.call(arguments, 1); if (typeof window[name] === 'function') window[name].apply(null, a); } catch (e) {} }

    // ── styles ────────────────────────────────────
    function css() {
        if (document.getElementById('ejt-css')) return;
        var s = document.createElement('style'); s.id = 'ejt-css';
        s.textContent = [
            '#ejt-root{position:fixed;inset:0;z-index:2147483000;direction:rtl;font-family:"Cairo",system-ui,sans-serif;touch-action:none;-webkit-user-select:none;user-select:none}',
            '#ejt-hole{position:fixed;border-radius:16px;border:2px solid #a3e635;box-shadow:0 0 0 9999px rgba(0,0,0,.8),0 0 24px rgba(163,230,53,.55);transition:all .35s cubic-bezier(.4,0,.2,1);pointer-events:none}',
            '#ejt-hole.none{border-color:transparent;box-shadow:0 0 0 9999px rgba(0,0,0,.82)}',
            '#ejt-card{position:fixed;display:flex;gap:6px;align-items:flex-end;background:linear-gradient(160deg,#0b1310,#06090a);border:1.5px solid rgba(163,230,53,.55);border-radius:20px;padding:12px 16px 14px 12px;width:min(94vw,460px);box-shadow:0 18px 60px rgba(0,0,0,.7),0 0 30px rgba(0,242,255,.12);color:#e8f1ee;transition:top .35s,left .35s,bottom .35s;-webkit-touch-callout:none}',
            '#ejt-spy{flex:0 0 auto;margin-inline-start:-4px;margin-bottom:-6px;pointer-events:none}',
            '#ejt-body{flex:1;min-width:0}',
            '#ejt-step{font:700 11px/1 "Orbitron",monospace;color:#00f2ff;letter-spacing:.12em;margin-bottom:6px;direction:ltr;unicode-bidi:isolate;text-align:right}',
            '#ejt-title{font-weight:900;font-size:17px;color:#a3e635;margin:0 0 6px}',
            '#ejt-text{font-size:14px;line-height:1.75;color:#d5e2de;margin:0 0 12px}',
            '#ejt-dots{display:flex;gap:4px;margin-bottom:10px}',
            '#ejt-dots i{height:4px;flex:1;border-radius:3px;background:rgba(255,255,255,.14);transition:background .25s}',
            '#ejt-dots i.on{background:#a3e635}',
            '#ejt-btns{display:flex;gap:8px;align-items:center}',
            '.ejt-b{font:800 13px "Cairo",sans-serif;border:0;border-radius:12px;padding:9px 16px;cursor:pointer;transition:transform .12s,opacity .2s}',
            '.ejt-b:active{transform:scale(.95)}',
            '#ejt-next{background:#a3e635;color:#06090a;flex:1;box-shadow:0 0 18px rgba(163,230,53,.35)}',
            '#ejt-prev{background:rgba(255,255,255,.08);color:#e8f1ee;border:1px solid rgba(255,255,255,.18)}',
            '#ejt-prev[disabled]{opacity:.3;cursor:default}',
            '#ejt-skip{background:none;color:#8fa39d;padding:9px 6px;font-weight:600;font-size:12px}',
            '@media (max-width:560px){#ejt-spy canvas{width:104px!important;height:120px!important}#ejt-title{font-size:15px}#ejt-text{font-size:13px;line-height:1.65}}'
        ].join('');
        document.head.appendChild(s);
    }

    // ── state ─────────────────────────────────────
    var S = { i: 0, root: null, hole: null, card: null, spy: null, open: false, target: null };

    function load3D() {
        return new Promise(function (res) {
            if (window.EJSpy3D) return res();
            var base = (document.currentScript && document.currentScript.src) || '';
            var sc = document.querySelector('script[src*="tutorial.js"]');
            var src = (sc && sc.src.replace('tutorial.js', 'spy3d.js')) || '../Assets/spy3d.js';
            var el = document.createElement('script'); el.src = src; el.onload = function () { res(); }; el.onerror = function () { res(); };
            document.head.appendChild(el);
        });
    }

    function build() {
        css();
        var root = document.createElement('div'); root.id = 'ejt-root'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true');
        root.innerHTML =
            '<div id="ejt-hole" class="none"></div>' +
            '<div id="ejt-card">' +
            '  <div id="ejt-spy"></div>' +
            '  <div id="ejt-body">' +
            '    <div id="ejt-step"></div>' +
            '    <h3 id="ejt-title"></h3><p id="ejt-text"></p>' +
            '    <div id="ejt-dots"></div>' +
            '    <div id="ejt-btns"><button class="ejt-b" id="ejt-prev">السابق</button><button class="ejt-b" id="ejt-next">التالي</button><button class="ejt-b" id="ejt-skip">تخطي</button></div>' +
            '  </div>' +
            '</div>';
        document.body.appendChild(root);
        S.root = root; S.hole = root.querySelector('#ejt-hole'); S.card = root.querySelector('#ejt-card');

        // block every touch / click / scroll that is not on the card
        var block = function (e) { if (!S.card.contains(e.target)) { e.preventDefault(); e.stopPropagation(); } };
        ['click', 'dblclick', 'mousedown', 'mouseup', 'touchstart', 'touchmove', 'touchend', 'pointerdown', 'contextmenu', 'wheel'].forEach(function (ev) {
            root.addEventListener(ev, block, { passive: false });
        });
        S.keyHandler = function (e) {
            if (!S.open) return;
            if (e.key === 'Enter' || e.key === 'ArrowLeft') { e.preventDefault(); next(); }
            else if (e.key === 'ArrowRight') { e.preventDefault(); prev(); }
            else if (e.key === 'Tab') { /* keep focus on the card */ e.preventDefault(); S.card.querySelector('#ejt-next').focus(); }
            else e.stopPropagation();
        };
        document.addEventListener('keydown', S.keyHandler, true);
        S.onResize = function () { place(); };
        window.addEventListener('resize', S.onResize);
        window.addEventListener('scroll', S.onResize, true);

        root.querySelector('#ejt-next').onclick = next;
        root.querySelector('#ejt-prev').onclick = prev;
        root.querySelector('#ejt-skip').onclick = skip;
        var dots = root.querySelector('#ejt-dots'); STEPS.forEach(function () { dots.appendChild(document.createElement('i')); });
        document.body.style.overflow = 'hidden';
    }

    function resolveTarget(st) {
        try {
            var t = typeof st.target === 'function' ? st.target() : (st.target ? document.querySelector(st.target) : null);
            if (!t) return null;
            var r = t.getBoundingClientRect();
            if (r.width < 4 || r.height < 4) return null;
            var cs = getComputedStyle(t); if (cs.display === 'none' || cs.visibility === 'hidden') return null;
            return t;
        } catch (e) { return null; }
    }

    function place() {
        if (!S.open) return;
        var st = STEPS[S.i], t = S.target = resolveTarget(st);
        var vw = window.innerWidth, vh = window.innerHeight, hole = S.hole, card = S.card;
        var cw = card.offsetWidth, ch = card.offsetHeight, pad = 8;
        if (t) {
            var r = t.getBoundingClientRect();
            hole.className = '';
            hole.style.left = (r.left - pad) + 'px'; hole.style.top = (r.top - pad) + 'px';
            hole.style.width = (r.width + pad * 2) + 'px'; hole.style.height = (r.height + pad * 2) + 'px';
            // card below the target if there is room, otherwise above, otherwise bottom of the screen
            var below = r.bottom + pad + 14, above = r.top - pad - 14 - ch;
            var top = below + ch <= vh - 8 ? below : (above >= 8 ? above : Math.max(8, vh - ch - 10));
            card.style.top = top + 'px'; card.style.bottom = 'auto';
            card.style.left = Math.max(8, Math.min(vw - cw - 8, r.left + r.width / 2 - cw / 2)) + 'px';
        } else {
            hole.className = 'none';
            hole.style.left = vw / 2 + 'px'; hole.style.top = vh / 2 + 'px'; hole.style.width = '0px'; hole.style.height = '0px';
            card.style.top = Math.max(8, (vh - ch) / 2) + 'px'; card.style.bottom = 'auto';
            card.style.left = Math.max(8, (vw - cw) / 2) + 'px';
        }
    }

    function render() {
        var st = STEPS[S.i], last = S.i === STEPS.length - 1;
        try { sessionStorage.setItem(KEY, String(S.i)); } catch (e) {}
        if (st.before) st.before();
        S.card.querySelector('#ejt-step').textContent = '\u200E' + (S.i + 1) + ' / ' + STEPS.length;
        S.card.querySelector('#ejt-title').textContent = st.title;
        S.card.querySelector('#ejt-text').textContent = st.text;
        S.card.querySelector('#ejt-prev').disabled = S.i === 0;
        var nx = S.card.querySelector('#ejt-next'); nx.textContent = last ? 'إنهاء ✓' : 'التالي';
        S.card.querySelector('#ejt-skip').style.display = last ? 'none' : '';
        [].forEach.call(S.card.querySelectorAll('#ejt-dots i'), function (d, k) { d.className = k <= S.i ? 'on' : ''; });
        if (S.spy) S.spy.setPose(st.pose || 'idle');
        // bring the highlighted element into view first, then position
        var t = resolveTarget(st);
        if (t) { try { t.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch (e) {} }
        place(); setTimeout(place, 120); setTimeout(place, 420);
    }

    function go(delta) {
        var ni = S.i + delta;
        if (ni < 0 || ni >= STEPS.length) return;
        var np = STEPS[ni].page;
        if (np !== page) {                                   // next step is on another page → navigate, tutorial resumes there
            try { sessionStorage.setItem(KEY, String(ni)); } catch (e) {}
            location.href = np;
            return;
        }
        S.i = ni; render();
    }
    function next() { if (S.i === STEPS.length - 1) finish(); else go(1); }
    function prev() { go(-1); }

    async function skip() {
        var ok = true; if (S.root) S.root.style.display = 'none';
        try { ok = window.UIConfirm ? await window.UIConfirm('تخطي الشرح؟ تقدر تعيده من القائمة في أي وقت.', { title: 'تخطي الجولة', confirmText: 'تخطي', cancelText: 'كمّل' }) : confirm('تخطي الشرح؟'); } catch (e) { ok = true; }
        if (S.root) S.root.style.display = '';
        if (ok) finish();
    }

    function close() {
        S.open = false;
        try { sessionStorage.removeItem(KEY); } catch (e) {}
        document.removeEventListener('keydown', S.keyHandler, true);
        window.removeEventListener('resize', S.onResize); window.removeEventListener('scroll', S.onResize, true);
        if (S.spy) { S.spy.destroy(); S.spy = null; }
        if (S.root) { S.root.remove(); S.root = null; }
        document.body.style.overflow = '';
    }

    async function finish() {
        close();
        try {
            var FI = window.FI;
            if (FI && FI.user && FI.db && FI.fb) await FI.fb.set(FI.fb.ref(FI.db, 'players/' + FI.user.uid + '/tutorial'), 'seen');   // ns → seen
        } catch (e) { console.warn('[tutorial] could not save flag', e); }
        if (page !== 'home.html') { /* stay where we are; the player can walk to home from the menu */ }
    }

    async function open(index) {
        if (S.open) return;
        await load3D();
        S.open = true; S.i = Math.max(0, Math.min(STEPS.length - 1, index || 0));
        build();
        if (window.EJSpy3D) {
            S.spy = window.EJSpy3D.mount(S.card.querySelector('#ejt-spy'), { size: 150, pose: STEPS[S.i].pose });
        } else {
            S.card.querySelector('#ejt-spy').textContent = '🕵️'; S.card.querySelector('#ejt-spy').style.fontSize = '54px';
        }
        render();
    }

    // ── entry: resume after navigation, replay, or first-time ("ns") ──
    function whenReady(fn) { if (document.readyState === 'complete') setTimeout(fn, 450); else window.addEventListener('load', function () { setTimeout(fn, 450); }); }

    async function init() {
        var saved = null; try { saved = sessionStorage.getItem(KEY); } catch (e) {}
        var q = new URLSearchParams(location.search);
        if (saved !== null && STEPS[+saved] && STEPS[+saved].page === page) return whenReady(function () { open(+saved); });
        if (q.get('tutorial') === '1' && page === 'home.html') return whenReady(function () { open(0); });
        if (page !== 'home.html') return;
        // first-time players: flag "ns"
        var t0 = Date.now();
        while (!(window.FI && window.FI.whenUser) && Date.now() - t0 < 8000) await new Promise(function (r) { setTimeout(r, 120); });
        if (!window.FI) return;
        try {
            var user = await Promise.race([window.FI.whenUser(), new Promise(function (r) { setTimeout(function () { r(null); }, 9000); })]);
            if (!user) return;
            await window.FI.ready;
            var snap = await window.FI.fb.get(window.FI.fb.ref(window.FI.db, 'players/' + user.uid + '/tutorial'));
            if (snap.val() === 'ns') whenReady(function () { open(0); });
        } catch (e) { console.warn('[tutorial] flag check failed', e); }
    }

    window.EJTutorial = { start: function () { try { sessionStorage.removeItem(KEY); } catch (e) {} if (page !== 'home.html') { location.href = 'home.html?tutorial=1'; } else open(0); }, steps: STEPS };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
