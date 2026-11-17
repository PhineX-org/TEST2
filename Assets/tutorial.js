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
    // target: selector or function → element to highlight
    // pose:   3D spy pose   before: runs when the step opens
    // helpers used by the steps
    function sel(s) { return function () { return document.querySelector(s); }; }
    function par(s) { return function () { var e = document.querySelector(s); return e && e.parentElement; }; }
    function click(s) { return function () { try { var e = document.querySelector(s); if (e) e.click(); } catch (x) {} }; }
    function both() { var fs = [].slice.call(arguments); return function () { fs.forEach(function (f) { f(); }); }; }
    function mode(m) { return function () { call('switchMode', m); }; }
    function tab(n) { return function () { call('switchTab', n); }; }

    var STEPS = [
        // ───────────────────────────── الصفحة الرئيسية ─────────────────────────────
        { page: 'home.html', pose: 'wave', title: 'أهلاً يا عميل! 🕵️', text: 'أنا مرشدك في «الجاسوس». هنلف سوا على كل صفحات اللعبة ونشرح كل حاجة فيها بالتفصيل — حوالي ٥ دقايق. تقدر تتنقل بـ التالي / السابق، وتتخطى في أي وقت، وتعيد الجولة من القائمة (شرح اللعبة).' },
        { page: 'home.html', pose: 'point', target: par('#setLocal'), before: mode('local'),
          title: 'اختار طريقة اللعب', text: '🏠 محلي: هتلعبو على نفس الجهاز. 🌐 أونلاين: غرفة مع أصحابك كل واحد على جهازه. 🤖 ضد الذكاء الاصطناعي: هتقدر تلعب لوحدك. بدّل بينهم من هنا.' },
        { page: 'home.html', pose: 'explain', target: sel('#local-fields'), before: mode('local'),
          title: 'اللعب المحلي 🏠', text: 'حدّد عدد اللاعبين واكتب أسماءهم (بتتحفظ للمرة الجاية). بعد ما تدوس ابدأ، الجهاز بيعدّي من لاعب للي بعده: كل واحد بيشوف دوره في السر (الكلمة السرية أو «أنت الجاسوس») ويسلّم الجهاز. مفيش إنترنت ضروري للجولة نفسها.' },
        { page: 'home.html', pose: 'pointLeft', target: '#gameCat', before: mode('local'),
          title: 'اختار الفئة 📋', text: 'القائمة بتتحمّل من قاعدة بيانات اللعبة، وكل فئة ليها أيقونتها (أماكن، أكل، رياضة…). الإدارة بتضيف فئات وكلمات جديدة من غير ما تحتاج تحدّث اللعبة. لو الاتصال فشل، بتشتغل قايمة محلية احتياطية. الكلمة السرية بتتسحب عشوائي من الفئة اللي اخترتها.' },
        { page: 'home.html', pose: 'explain', target: par('#createBtn'), before: mode('online'),
          title: 'إنشاء غرفة أو انضمام', text: 'اعمل غرفة عامة (الكل يشوفها) أو خاصة (بالكود أو الرابط أو QR بس) وادخل بكود صاحبك. الغرفة تسع لحد ١٥ لاعب، وبتقدر تغيّر الفئة والإعدادات وانت جوه الغرفة.' },
        { page: 'home.html', pose: 'point', target: '#joinBtn', before: mode('online'),
          title: 'الانضمام بكود', text: 'صاحبك بيبعتلك كود الغرفة (٥–٦ حروف) أو رابط أو QR. اكتبه هنا وهتدخل على طول. لو حد دعاك من الأصدقاء، الدعوة هتظهر في صندوق الإشعارات وتنقلك للغرفة لما تقبل.' },
        { page: 'home.html', pose: 'point', target: '#publicRoomsLink', before: mode('online'),
          title: 'الغرف العامة', text: 'هنا تلاقي غرف مفتوحة تنضم ليها فوراً. لو فيه لعبة شغالة ممكن تتفرج، ولو فاضية هتلاقيها «غرفة فاضية 👻» تقدر تبدأ فيها. هنفتحها دلوقتي ونشوفها.' },

        // ───────────────────────────── الغرف العامة ─────────────────────────────
        { page: 'onlinerooms.html', pose: 'wave', title: 'الغرف العامة 🌐', text: 'دي قايمة مباشرة بالغرف العامة اللي لسه ماتبدأتش. بتتحدّث لوحدها لحظة بلحظة من غير ما تعمل ريفريش. الغرف الخاصة عمرها ما بتظهر هنا — بتدخلها بالكود بس.' },
        { page: 'onlinerooms.html', pose: 'point', target: function () { var e = document.getElementById('online-player-count'); return e && (e.closest('.glass') || e.parentElement); },
          title: 'عدّادات اللعبة', text: 'فوق هتشوف كام لاعب أونلاين دلوقتي وكام لعبة شغالة. لو الأرقام كبيرة يبقى الوقت مناسب تلاقي ناس تلعب معاهم بسرعة.' },
        { page: 'onlinerooms.html', pose: 'explain', target: '#filterToggle',
          title: 'الفلاتر 🎛️', text: 'دوس هنا تفتح الفلاتر: التصنيف (الفئات نفسها اللي في قاعدة البيانات بأيقوناتها)، عدد اللاعبين في الغرفة، وزر «مسح الفلاتر» يرجّعك للوضع الأول. الفلاتر بتشتغل فوراً من غير ما تدوس بحث.' },
        { page: 'onlinerooms.html', pose: 'point', target: '#searchInput',
          title: 'البحث 🔎', text: 'اكتب كود غرفة أو اسم المضيف وهتتصفّى القايمة وانت بتكتب. مفيد لو صاحبك قالك «ادخل غرفتي» وانت مش فاكر الكود كامل.' },
        { page: 'onlinerooms.html', pose: 'explain', target: '#roomsList',
          title: 'كارت الغرفة', text: 'كل كارت فيه: كود الغرفة، فئتها بأيقونتها، شريط الامتلاء (متاح / شبه ممتلئة / ممتلئة)، اسم المضيف، وزر «انضمام» ظاهر على طول من غير ما تفتح الكارت. الغرفة الممتلئة بيتعطل زرها.' },
        { page: 'onlinerooms.html', pose: 'thumbs', target: '#refreshBtn',
          title: 'تحديث يدوي', text: 'القايمة بتتحدّث لوحدها، لكن لو حسيت إن فيه تأخير دوس هنا. ولو مفيش غرف مناسبة، ارجع للرئيسية واعمل غرفتك الخاصة وادعو أصحابك.' },

        // ───────────────────────────── شرح الغرفة واللعبة (من الرئيسية) ─────────────────────────────
        { page: 'home.html', pose: 'explain', title: 'إزاي الجولة بتمشي؟', text: 'كل لاعب بيشوف الكلمة السرية ما عدا الجاسوس. بتسألوا بعض أسئلة، بتناقشوا، وبعدين بتصوّتوا. تكتشفوا الجاسوس تكسبوا — يخمّن الكلمة صح هو اللي يكسب. وممكن يبقى فيه ١–٣ جواسيس حسب عدد اللاعبين.' },
        { page: 'home.html', pose: 'point', title: 'مرحلة ١: غرفة الانتظار 🛋️', text: 'أول ما تدخل الغرفة بتشوف قايمة اللاعبين، كود الغرفة والرابط وQR للمشاركة، وبطاقة اسم كل لاعب (بثيمه وخلفيته وإطاره ورتبته). صاحب الغرفة (المضيف) بس هو اللي يختار الفئة ويضبط الإعدادات ويدوس «ابدأ» — ولازم يكون فيه عدد كفاية من اللاعبين.' },
        { page: 'home.html', pose: 'point', title: 'إعدادات الغرفة ⚙️', text: 'المضيف يضبط: الفئة (من قاعدة البيانات)، عدد الجواسيس، مؤقت النقاش ومؤقت التصويت (أو يقفل المؤقت خالص)، وعامة / خاصة. المؤقت لما يخلص بيقفل المرحلة تلقائي. لو المضيف خرج، المضيف بيتنقل لحد تاني من الغرفة.' },
        { page: 'home.html', pose: 'explain', title: 'مرحلة ٢: كشف الأدوار 🃏', text: 'كل لاعب بدوره بيدوس على بطاقته تتقلب: يا إما «أنت بريء» ومعاها الكلمة السرية، يا إما «أنت الجاسوس». بتتقلب لما يجي دورك بس، وبعد ما تقرا دوس «التالي» عشان الدور يعدّي للي بعدك. اتأكد إن محدش بيبص على شاشتك!' },
        { page: 'home.html', pose: 'wave', title: 'مرحلة ٣: النقاش 💬', text: 'هنا بتسألوا بعض أسئلة عن الكلمة من غير ما تقولوها صراحة. الجاسوس بيحاول يتماشى من غير ما يتكشف. تقدر تحط علامة اشتباه على لاعب، وتشوف مين جاهز للتصويت. لما الكل يدوس «جاهز للتصويت» (أو المؤقت يخلص) بتنتقلوا للتصويت.' },
        { page: 'home.html', pose: 'thumbs', title: 'بطاقة الفئة بالضغط المطوّل 🫳', text: 'في النقاش والتصويت هتلاقي بطاقة صغيرة متقفلة. اضغط عليها واستمر ماسكها: الجاسوس بيشوف «فئة الغرفة» بس، والبريء بيشوف «الفئة + الكلمة السرية» عشان ماينساش. أول ما تسيب إيدك البطاقة بتخفي المحتوى تاني فورًا — فمحدش يلمحه.' },
        { page: 'home.html', pose: 'point', title: 'تلميحات الجاسوس 🔍', text: 'الجاسوس معاه تلميحين في الجولة بيكشفوا معلومة عن الكلمة، ويقدر كمان يستخدم مفاتيح المواصفات (متشرحة بعدين). الهدف إنه يفهم الكلمة من كلام الباقيين من غير ما يبان إنه تايه.' },
        { page: 'home.html', pose: 'explain', title: 'مرحلة ٤: التصويت 🗳️', text: 'كل لاعب بيصوّت لشخص واحد بيشك إنه الجاسوس. اللي بياخد أصوات أكتر بيطلع. لو حصل تعادل بتدخلوا شاشة تعادل وعجلة اختيار. المؤقت (لو شغال) بيقفل التصويت لوحده، واللي ماصوّتش بيتحسب امتناع.' },
        { page: 'home.html', pose: 'thumbs', title: 'مرحلة ٥: النتيجة 🏁', text: 'بتتكشف هوية الجاسوس. لو اتكشف، بيدّوه فرصة أخيرة يخمّن الكلمة من ١٢ اختيار — لو صح هو اللي يكسب. بعدها بتظهر نقاط الرتبة والعملات، وتقدروا تدوسوا «العب تاني» ترجعوا لنفس الغرفة وكل حاجة بتتصفّر من الأول.' },
        { page: 'home.html', pose: 'wave', title: 'شات، صوت وردود فعل 🎙️', text: 'جوه الغرفة: شات نصي، دردشة صوتية بالميكروفون، وردود فعل سريعة (إيموجي + صوت) بتطلع فوق الشاشة باسمك. تقدر تبلّغ عن لاعب مسيء من قايمة اللاعبين، ويتراجع البلاغ عند الإدارة.' },
        { page: 'home.html', pose: 'thumbs', title: 'مفاتيح المواصفات 🔑', text: 'لو تهت، مفتاح المواصفات بيكشفلك تلميح عن الكلمة السرية. تشتري لحد ٥ من المتجر، ولكل لعبة مفتاحين بس — عشان اللعب يفضل عادل.' },
        { page: 'home.html', pose: 'explain', title: 'الرتب والمواسم 👑', text: 'من برونز لحد كراون وإيس — الرتب العالية ليها أنيميشن دخول وخلفيات وإطارات خاصة لبطاقة اسمك. كل شهرين موسم جديد وبتنزل نقاطك شوية عشان المنافسة تفضل شغالة.' },
        { page: 'home.html', pose: 'point', target: '#openNav', title: 'القائمة', text: 'من هنا توصل لكل الصفحات: المتصدرين، كيفية اللعب، سجل التحديثات، حسابي، ملفي الشخصي، الأصدقاء، الإحصائيات، الإبلاغ عن مشكلة، نظام JMS (الإشراف الآلي)، والمتجر. هنزور أغلبهم سوا دلوقتي.' },

        // ───────────────────────────── المتجر ─────────────────────────────
        { page: 'shop.html', pose: 'point', target: par('#coinBalance'), title: 'المتجر 🛒', text: 'هنا بتصرف عملاتك (بتكسبها من اللعب) على حاجات شكلها بس — مفيش حاجة بتديك أفضلية في اللعب. رصيدك ظاهر فوق، والتبويبات تحت بتقسّم المتجر.' },
        { page: 'shop.html', pose: 'explain', target: sel('.tab-btn[data-tab="themes"]'), before: click('.tab-btn[data-tab="themes"]'), title: '✨ ثيمات الأسماء', text: 'ثيم الاسم بيغيّر شكل اسمك في كل مكان: ألوان متحرّكة وتوهّج وتأثيرات. اشتري الثيم وبعدين فعّله. الثيمات الخاصة بالرتب العالية بتتفتح بالرتبة ومش للبيع.' },
        { page: 'shop.html', pose: 'point', target: sel('.tab-btn[data-tab="tags"]'), before: click('.tab-btn[data-tab="tags"]'), title: '🏷️ الألقاب', text: 'لقب صغير بيظهر جنب اسمك. تقدر تفعّل لقب واحد في الوقت. بعض الألقاب (زي GAME OWNER) بتتمنح من الإدارة بس ومينفعش تتشرى.' },
        { page: 'shop.html', pose: 'explain', target: sel('.tab-btn[data-tab="bgs"]'), before: click('.tab-btn[data-tab="bgs"]'), title: '🖼️ خلفيات البطاقة', text: 'خلفية بتظهر ورا بطاقة اسمك جوه الغرفة: ألوان سادة أو متحرّكة. خلفيات الرتب (Diamond / Crown / Ace) بتتفتح تلقائي بالرتبة. اضغط على الخلفية تشوف معاينة قبل ما تشتري.' },
        { page: 'shop.html', pose: 'point', target: sel('.tab-btn[data-tab="frames"]'), before: click('.tab-btn[data-tab="frames"]'), title: '🪞 إطارات البطاقة', text: 'إطار بيلف حوالين بطاقة اسمك: نبض، توهّج، جليتش… وإطارات الرتب بتتحسّن مع كل رتبة أعلى. تقدر تجمع بين خلفية وإطار وثيم براحتك.' },
        { page: 'shop.html', pose: 'thumbs', target: sel('.tab-btn[data-tab="keys"]'), before: click('.tab-btn[data-tab="keys"]'), title: '🔑 مفاتيح المواصفات', text: 'كل مفتاح (بـ ١٠٠ عملة) بيكشفلك مواصفة عن الكلمة السرية وانت جاسوس. الحد الأقصى ٥ مفاتيح في رصيدك، ومسموح لك بمفتاحين بس في كل لعبة عشان اللعب يفضل عادل.' },
        { page: 'shop.html', pose: 'explain', target: sel('.tab-btn[data-tab="ranks"]'), before: click('.tab-btn[data-tab="ranks"]'), title: '🎖️ الرتب', text: 'هنا بتشوف سلّم الرتب من برونز لحد إيس، وكام نقطة محتاجها لكل رتبة، وإيه اللي بتفتحه (خلفيات وإطارات وأنيميشن دخول). الرتبة بتتكسب باللعب بس — مش بتتشرى.' },
        { page: 'shop.html', pose: 'point', target: sel('.tab-btn[data-tab="cursor"]'), before: click('.tab-btn[data-tab="cursor"]'), title: '🖱️ المؤشر', text: 'غيّر شكل مؤشر الماوس: سهم، قطرة ماء، عدسة جاسوس، نجمة… وغيّر لونه. بيتطبّق فوراً على كل صفحات اللعبة وبيتحفظ في حسابك. (على الموبايل مفيش مؤشر فمش هتلاحظ حاجة.)' },

        // ───────────────────────────── المتصدرين ─────────────────────────────
        { page: 'leaderboard.html', pose: 'thumbs', title: 'المتصدرين 🏆', text: 'شوف ترتيبك مقابل باقي اللاعبين. كل فوز بيرفع نقاطك، وسلسلة الانتصارات بتجيبلك شارات. اللوحة بتتحدّث من قاعدة البيانات مباشرة.' },
        { page: 'leaderboard.html', pose: 'point', target: '#lbddBtn', title: 'اختار نوع اللوحة', text: 'القايمة دي فيها لوحات كتير: أعلى اللاعبين، أعلى كل رتبة (فضي، بلاتينيوم…)، أفضل جاسوس، وأصدقائك. غيّر اللوحة والعنوان والوصف تحتها بيتغيّروا معاها.' },
        { page: 'leaderboard.html', pose: 'explain', target: '#lbList', title: 'الترتيب', text: 'كل صف فيه المركز، اسمك بثيمك ولقبك، ورتبتك ونقاطك. أول ٣ مراكز ليهم تمييز خاص. اضغط على أي لاعب تفتح بروفايله.' },
        { page: 'leaderboard.html', pose: 'thumbs', target: '#lbMyPos', title: 'مركزك أنت', text: 'هنا مكانك في اللوحة الحالية حتى لو مش في أول القايمة، وكام نقطة ناقصة عشان تطلع. لو ماظهرتش يبقى لازم تلعب كام جولة الأول.' },

        // ───────────────────────────── الأصدقاء ─────────────────────────────
        { page: 'friends.html', pose: 'wave', title: 'الأصدقاء 👥', text: 'الصفحة دي هي مركز علاقاتك في اللعبة: بتضيف أصحابك، تشوف مين أونلاين، وتدعوهم لغرفة، وتفتح الشات معاهم. النظام كله بالطلبات: محدش بيتضاف فجأة — لازم الطرف التاني يقبل.' },
        { page: 'friends.html', pose: 'point', target: par('#tab-friends'), before: tab('friends'), title: 'تبويب «الأصدقاء»', text: 'هنا كل أصدقائك المقبولين، أونلاين أو أوفلاين، بعدد إجمالي. كل كارت فيه اسم صاحبك بثيمه ورتبته وحالته، وأزرار: فتح الشات، دعوته لغرفة، أو حذفه من الأصدقاء.' },
        { page: 'friends.html', pose: 'explain', target: sel('#tab-online'), before: tab('online'), title: 'تبويب «المتصلون»', text: 'بيعرض الأصدقاء اللي أونلاين دلوقتي بس، وبيقولك هو فين: «في اللوبي»، «في غرفة» (مستني اللعبة تبدأ)، أو «في لعبة» (في نص الجولة، في أي مرحلة). كده تعرف تنضم له أو تدعوه في الوقت المناسب.' },
        { page: 'friends.html', pose: 'point', target: sel('#tab-requests'), before: tab('requests'), title: 'تبويب «الطلبات»', text: 'فيه الطلبات اللي جاتلك — اقبل أو ارفض كل واحد منها — وتحتها «طلبات أرسلتها» وبتستنى الرد. لو شخص بعتلك طلب وانت كنت ناوي تبعتله، قبولك للطلب بيكمّل الصداقة على طول.' },
        { page: 'friends.html', pose: 'explain', target: '#myCodeCard', before: tab('friends'), title: 'كود الصداقة بتاعك 🔐', text: 'ده كود عشوائي من ٨ رموز بتديه لصاحبك عشان يبعتلك طلب (زي ألعاب Among Us) — مفيش بحث بالاسم عشان خصوصيتك. الكود بيتستخدم مرة واحدة بس، وبعد ما حد يستعمله بيتولّد كود جديد. تقدر تنسخه أو تنسخ رابط جاهز، أو تعمل كود جديد في أي وقت بزر التجديد.' },
        { page: 'friends.html', pose: 'point', target: '#addFriendBtn', title: 'إضافة صديق ➕', text: 'دوس هنا واكتب كود صاحبك (أو إيميله) وابعت الطلب. هتشوف رسالة تأكيد، والطلب بيظهر عنده في الإشعارات وفي تبويب الطلبات. لو الكود غلط أو منتهي هتتنبّه فوراً.' },
        { page: 'friends.html', pose: 'explain', title: 'دعوة صديق لغرفة 🎮', text: 'من كارت أي صديق اضغط «دعوة» واختار الفئة. صاحبك بيستلم دعوة، والغرفة مابتتعملش إلا لما يقبل — ساعتها بتتنقلوا الاتنين لنفس الغرفة مع بعض. لو رفض أو مارد، مفيش غرفة فاضية بتتعمل.' },
        { page: 'friends.html', pose: 'thumbs', title: 'الإشعارات والدردشة 💬', text: 'أي رسالة جديدة من صديق بتظهر في صندوق الإشعارات (الأيقونة اللي فوق) مع معاينة وزر رد سريع أو «روح للشات». ودعوات الغرف والأخبار من الإدارة بتوصل بنفس الطريقة. هنفتح صفحة الشات دلوقتي.' },

        // ───────────────────────────── الدردشة ─────────────────────────────
        { page: 'chat.html', pose: 'wave', title: 'صفحة الدردشة 💬', text: 'محادثات خاصة مع أصدقائك بس (مش مع الغرباء). على الكمبيوتر القايمة والمحادثة جنب بعض، وعلى الموبايل بتفتح المحادثة بشاشة كاملة وفيه زر رجوع للقايمة.' },
        { page: 'chat.html', pose: 'point', target: '#searchIn', title: 'بحث عن صديق', text: 'اكتب جزء من اسم صديق تلاقيه بسرعة وتفتح محادثته. المحادثات اللي فيها رسائل جديدة بتطلع فوق وعليها عدّاد.' },
        { page: 'chat.html', pose: 'explain', target: '#threads', title: 'قايمة المحادثات', text: 'كل محادثة فيها صورة الصديق، حالته (أونلاين / أوفلاين)، وآخر رسالة. دوس على واحدة تفتحها. النقطة الخضرا معناها إنه متصل دلوقتي.' },
        { page: 'chat.html', pose: 'point', target: '#msgIn', title: 'اكتب رسالتك ✍️', text: 'اكتب (لحد ٥٠٠ حرف) ودوس إرسال أو Enter. الرسائل بتوصل فوراً وبتتحفظ، ومفيش حد غيرك وغير صاحبك يقدر يقراها. الرسايل المسيئة ممكن يتبلّغ عنها.' },
        { page: 'chat.html', pose: 'thumbs', target: '#inviteBtn', title: 'دعوة لغرفة من الشات 🎮', text: 'من جوه المحادثة دوس «دعوة» واختار الفئة: صاحبك بيستلم الدعوة، وأول ما يقبل بتتعمل الغرفة وبتتنقلوا فيها الاتنين مع بعض.' },

        // ───────────────────────────── الملف الشخصي ─────────────────────────────
        { page: 'profile.html', pose: 'wave', title: 'ملفك الشخصي 🪪', text: 'هنا كل إنجازاتك وإحصائياتك في مكان واحد. دي الصفحة اللي أصحابك بيشوفوها لما يفتحوا بروفايلك من اللوحات أو الغرف.' },
        { page: 'profile.html', pose: 'explain', target: '#rankBadge', title: 'رتبتك وتقدمك', text: 'شارتك الحالية ونقاط الرتبة وشريط التقدم لحد الرتبة اللي بعدها. كل فوز بيزوّد النقاط، والخسارة بتنقّصها شوية، ولو الموسم خلص بتنزل النقاط حسب رتبتك.' },
        { page: 'profile.html', pose: 'thumbs', target: '#totalWins', title: 'انتصارات وهزائم', text: 'إجمالي الفوز والخسارة ونسبة الفوز، وأطول سلسلة انتصارات حققتها. السلسلة بتتقطع لو خسرت.' },
        { page: 'profile.html', pose: 'point', target: '#spyDetectionRate', title: 'أداءك كجاسوس ومحقق', text: 'كام مرة لعبت جاسوس، وكام مرة اتكشفت، ونسبة نجاحك في كشف الجواسيس لما تكون بريء، ومتوسط وقت النقاش. بتساعدك تعرف نقطة ضعفك.' },
        { page: 'profile.html', pose: 'explain', target: '#categoryStats', title: 'إحصائيات الفئات', text: 'بتوضّح لعبت كام مرة في كل فئة وفئتك المفضلة، عشان تعرف أنهي فئة ماسك فيها أكتر.' },

        // ───────────────────────────── الحساب ─────────────────────────────
        { page: 'account.html', pose: 'point', target: '#displayUsername', title: 'حسابي 👤', text: 'بيانات حسابك: اسم المستخدم والإيميل، وملخص سريع لألعابك وانتصاراتك كجاسوس وكبريء. مفيش أحد يشوف إيميلك غيرك.' },
        { page: 'account.html', pose: 'explain', target: '#logoutBtn', title: 'تسجيل الخروج', text: 'بيخرجك من الحساب على الجهاز ده بس. بياناتك وعملاتك ورتبتك محفوظة وترجعلك لما تدخل تاني من أي جهاز.' },
        { page: 'account.html', pose: 'point', target: '#deleteAccountBtn', title: 'حذف الحساب ⚠️', text: 'بيمسح حسابك وبياناتك نهائياً ومينفعش تتراجع. هيطلب منك تأكيد وإعادة تسجيل دخول بجوجل لو لزم. فكّر مرتين قبل ما تدوس.' },

        // ───────────────────────────── الإحصائيات ─────────────────────────────
        { page: 'analytics.html', pose: 'thumbs', target: '#kpi-total', title: 'الإحصائيات 📊', text: 'لوحة تحليلية لأدائك: إجمالي المباريات، نسبة الفوز، أفضل سلسلة، وأداءك كجاسوس. الأرقام دي من سجل ألعابك الفعلي.' },
        { page: 'analytics.html', pose: 'explain', target: '#catChart', title: 'الرسوم البيانية', text: 'الرسوم بتوضّح توزيع ألعابك على الفئات ونسب الفوز كجاسوس وكبريء. ولو لسه مالعبتش كتير، هتلاقيها فاضية لحد ما تلعب كام جولة.' },
        { page: 'analytics.html', pose: 'point', target: '#history-list', title: 'سجل الألعاب', text: 'آخر مبارياتك بالترتيب: الفئة، دورك، النتيجة والنقاط. تقدر تراجعها وتتعلم من أخطائك.' },

        // ───────────────────────────── سجل التحديثات ─────────────────────────────
        { page: 'updates.html', pose: 'wave', title: 'سجل التحديثات 📜', text: 'كل تحديث نزل للعبة متسجّل هنا بالتفصيل: إيه اتضاف، إيه اتحسّن، وإيه الأخطاء اللي اتصلحت. بتقدر تقارن تحديثين جنب بعض.' },
        { page: 'updates.html', pose: 'explain', target: '#cmp', title: 'المقارنة', text: 'كل عمود فيه قايمة منسدلة تختار منها إصدار. حط إصدارين جنب بعض وقارن بينهم بسهولة، وفي الموبايل بتتكدّس الأعمدة تحت بعض.' },
        { page: 'updates.html', pose: 'point', target: '#addTab', title: 'زر +', text: 'زر الزائد بيضيف عمود مقارنة جديد. عدد الأعمدة الأقصى بيتحدد حسب عرض شاشتك.' },
        { page: 'updates.html', pose: 'thumbs', target: '#upc', title: 'التحديثات القادمة', text: 'هنا شوف إيه اللي الإدارة بتجهّزه. أول ما يتنزّل تحديث جديد بتوصلك إشعار على الصندوق.' },

        // ───────────────────────────── معايير المجتمع ─────────────────────────────
        { page: 'community.html', pose: 'explain', title: 'معايير المجتمع 🤝', text: 'دي قواعد اللعب والتعامل: احترام اللاعبين، ممنوع الغش أو استخدام برامج، ممنوع الشتايم والتحرش، ومنع نشر معلومات شخصية. الهدف إن اللعبة تفضل ممتعة للكل.' },
        { page: 'community.html', pose: 'point', title: 'نظام التصعيد والإبلاغ', text: 'المخالفة بتعدّي على مراحل: تحذير، حظر مؤقت، وبعدين حظر دائم لو اتكررت. أي لاعب يقدر يبلّغ عن مخالفة من داخل الغرفة، والإدارة (ونظام JMS الآلي) بتراجع البلاغات. وليك حق الاستئناف لو شايف القرار ظلم.' },
        { page: 'community.html', pose: 'thumbs', title: 'مكافآت اللعب النظيف 🎁', text: 'اللعب النضيف ليه مكافآت: عملات، ألقاب خاصة، وتمييز لسجلك النضيف. القسم الأخير في الصفحة بيشرح التفاصيل.' },

        // ───────────────────────────── الإبلاغ عن مشكلة ─────────────────────────────
        { page: 'bugreport.html', pose: 'explain', target: '#bugReportForm', title: 'الإبلاغ عن مشكلة 🐞', text: 'لقيت bug أو حاجة مش شغالة؟ بلّغنا من هنا. كل ما كان وصفك أدق (إيه اللي عملته، وإيه اللي حصل، وإيه اللي كنت متوقعه)، اتصلّح أسرع.' },
        { page: 'bugreport.html', pose: 'point', target: '#cat-critical', title: 'درجة الخطورة', text: 'اختار حسب تأثير المشكلة: حرجة (اللعبة بتقف)، كبيرة، متوسطة، بسيطة، أو اقتراح تحسين. الحرجة بتتراجع أول.' },
        { page: 'bugreport.html', pose: 'explain', target: '#title', title: 'العنوان والوصف', text: 'اكتب عنوان قصير يلخّص المشكلة، وبعدين وصف تفصيلي: الصفحة، الخطوات، ونوع جهازك ومتصفحك لو تعرف. صورة أو رسالة الخطأ لو ظهرت تفيد جداً.' },
        { page: 'bugreport.html', pose: 'point', target: '#contact', title: 'طريقة التواصل', text: 'اختياري: سيب إيميلك أو أي وسيلة نرد عليك منها لو احتجنا تفاصيل. مش هيظهر لأي لاعب.' },
        { page: 'bugreport.html', pose: 'thumbs', target: '#submitBtn', title: 'إرسال', text: 'دوس إرسال وهتوصلنا على طول. شكراً إنك بتساعد في تحسين اللعبة!' },

        // ───────────────────────────── كيفية اللعب ─────────────────────────────
        { page: 'howtoplay.html', pose: 'wave', title: 'كيفية اللعب 📖', text: 'صفحة شرح مبسّطة للعبة مع عرض تجريبي تفاعلي، مناسبة تبعتها لصاحب جديد قبل ما تلعبوا.' },
        { page: 'howtoplay.html', pose: 'explain', target: par('#tabCitizen'), title: 'دور البريء والجاسوس', text: 'بدّل بين تبويب «بريء» و«جاسوس» عشان تشوف الخطوات والاستراتيجية لكل دور: البريء بيلمّح للكلمة من غير ما يكشفها، والجاسوس بيحاول يفهمها ويتماشى.' },
        { page: 'howtoplay.html', pose: 'point', target: '#demoCard', title: 'جرّب البطاقة', text: 'دوس على البطاقة التجريبية تشوف بيتقلب إزاي ويظهر الدور — زي بالظبط اللي هيحصل في اللعبة الحقيقية.' },

        // ───────────────────────────── الختام ─────────────────────────────
        { page: 'home.html', pose: 'wave', title: 'خلصنا! 🎉', text: 'جاهز يا عميل. غطّينا كل صفحات اللعبة. اضغط «إنهاء» وابدأ أول لعبة. تقدر تعيد الجولة دي أي وقت من القائمة (شرح اللعبة).' }
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
