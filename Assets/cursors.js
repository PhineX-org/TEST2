/* ============================================================================
   EL JASUS — CUSTOM CURSOR (EJCursor)
   Changes the mouse cursor on every page to a shape + colour the player picks (shop → 🖱️ المؤشر).
   • Saved in localStorage (key ej_cursor) so it applies instantly on every page; shop also mirrors it to
     players/{uid}/cursor so it follows the account.
   • Normal arrow variant for the page, a glowing outlined variant over buttons/links, text cursor kept in inputs.
   • Touch screens have no cursor, so nothing changes there (the picker says so).
   API: EJCursor.get() / .set({shape,color}) / .reset() / .mount(el) / .shapes / .colors / .onChange(fn)
   ============================================================================ */
(function () {
  'use strict';
  var KEY = 'ej_cursor', STYLE_ID = 'ej-cursor-style';
  var COLORS = [
    { id: 'lime', name: 'ليموني', v: '#a3e635' }, { id: 'cyan', name: 'سماوي', v: '#00f2ff' },
    { id: 'white', name: 'أبيض', v: '#ffffff' }, { id: 'pink', name: 'وردي', v: '#ff4fd8' },
    { id: 'gold', name: 'ذهبي', v: '#fbbf24' }, { id: 'red', name: 'أحمر', v: '#f43f5e' },
    { id: 'violet', name: 'بنفسجي', v: '#a78bfa' }
  ];
  // body(c) returns SVG shapes on a 32×32 canvas; hot = [x,y] click point
  var SHAPES = [
    { id: 'arrow',     name: 'سهم',        hot: [4, 3],  body: function (c) { return '<path d="M4 3 L4 25 L10 19 L14.5 29 L18.5 27 L14 17.5 L22.5 17.5 Z" fill="' + c + '" stroke="#000" stroke-width="1.6" stroke-linejoin="round"/>'; } },
    { id: 'ring',      name: 'حلقة',       hot: [16, 16], body: function (c) { return '<circle cx="16" cy="16" r="9" fill="none" stroke="#000" stroke-width="5"/><circle cx="16" cy="16" r="9" fill="none" stroke="' + c + '" stroke-width="3"/><circle cx="16" cy="16" r="2.2" fill="' + c + '"/>'; } },
    { id: 'cross',     name: 'تصويب',      hot: [16, 16], body: function (c) { return '<g stroke="#000" stroke-width="5" stroke-linecap="round"><path d="M16 3v9M16 20v9M3 16h9M20 16h9"/></g><g stroke="' + c + '" stroke-width="2.6" stroke-linecap="round"><path d="M16 3v9M16 20v9M3 16h9M20 16h9"/></g><circle cx="16" cy="16" r="2" fill="' + c + '"/>'; } },
    { id: 'drop',      name: 'قطرة ماء',   hot: [16, 5],  body: function (c) { return '<path d="M16 3 C16 3 6.5 14.5 6.5 20.5 a9.5 9.5 0 0 0 19 0 C25.5 14.5 16 3 16 3Z" fill="' + c + '" fill-opacity=".85" stroke="#000" stroke-width="1.6"/><path d="M11.5 19.5 a4.6 4.6 0 0 0 3 4.4" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".9"/>'; } },
    { id: 'magnifier', name: 'عدسة جاسوس', hot: [12, 12], body: function (c) { return '<path d="M18.5 18.5 L28 28" stroke="#000" stroke-width="6" stroke-linecap="round"/><path d="M18.5 18.5 L28 28" stroke="' + c + '" stroke-width="3.2" stroke-linecap="round"/><circle cx="12" cy="12" r="8" fill="rgba(255,255,255,.12)" stroke="#000" stroke-width="5"/><circle cx="12" cy="12" r="8" fill="none" stroke="' + c + '" stroke-width="2.6"/>'; } },
    { id: 'star',      name: 'نجمة',       hot: [16, 16], body: function (c) { return '<path d="M16 3 L19.6 12 L29 12.6 L21.7 18.6 L24.2 28 L16 22.8 L7.8 28 L10.3 18.6 L3 12.6 L12.4 12 Z" fill="' + c + '" stroke="#000" stroke-width="1.6" stroke-linejoin="round"/>'; } },
    { id: 'heart',     name: 'قلب',        hot: [16, 14], body: function (c) { return '<path d="M16 28 C5 20 3 13 7 8.5 C10.5 5 14.5 6.5 16 10 C17.5 6.5 21.5 5 25 8.5 C29 13 27 20 16 28Z" fill="' + c + '" stroke="#000" stroke-width="1.6" stroke-linejoin="round"/>'; } },
    { id: 'hat',       name: 'قبعة جاسوس', hot: [16, 16], body: function (c) { return '<ellipse cx="16" cy="19" rx="13" ry="4.5" fill="' + c + '" stroke="#000" stroke-width="1.6"/><path d="M8.5 18 C8.5 9 11 5 16 5 C21 5 23.5 9 23.5 18 C20 20.5 12 20.5 8.5 18Z" fill="' + c + '" stroke="#000" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 15.5 C13 17.5 19 17.5 23 15.5" fill="none" stroke="#000" stroke-width="2.4"/>'; } },
    { id: 'dagger',    name: 'خنجر',       hot: [4, 4],  body: function (c) { return '<path d="M4 4 L9 5.5 L21 17.5 L17.5 21 L5.5 9 Z" fill="' + c + '" stroke="#000" stroke-width="1.6" stroke-linejoin="round"/><path d="M16 22.5 L23 15.5" stroke="#000" stroke-width="5" stroke-linecap="round"/><path d="M16 22.5 L23 15.5" stroke="' + c + '" stroke-width="2.4" stroke-linecap="round"/><path d="M20.5 20.5 L28 28" stroke="#000" stroke-width="5.5" stroke-linecap="round"/><path d="M20.5 20.5 L28 28" stroke="' + c + '" stroke-width="2.8" stroke-linecap="round"/>'; } },
    { id: 'ghost',     name: 'شبح',        hot: [16, 14], body: function (c) { return '<path d="M6 28 V14 a10 10 0 0 1 20 0 V28 L21.5 24.5 L16 28 L10.5 24.5 Z" fill="' + c + '" stroke="#000" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12.3" cy="14" r="2.1" fill="#000"/><circle cx="19.7" cy="14" r="2.1" fill="#000"/>'; } }
  ];

  function find(list, id, dflt) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return dflt || list[0]; }
  function svgUri(shape, color, pointer) {
    // pointer variant: same shape with a white halo behind it, so it reads as "clickable"
    var halo = pointer ? '<g opacity=".95" style="filter:none">' + shape.body('#ffffff').replace(/stroke="#000"/g, 'stroke="#fff"').replace(/stroke-width="([\d.]+)"/g, function (m, w) { return 'stroke-width="' + (parseFloat(w) + 3) + '"'; }) + '</g>' : '';
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">' + halo + shape.body(color) + '</svg>';
    return 'url("data:image/svg+xml,' + encodeURIComponent(svg).replace(/'/g, '%27').replace(/"/g, '%22') + '")';
  }

  var listeners = [];
  function read() {
    try { var v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (v && v.shape) return v; } catch (e) {}
    return null;
  }
  function css(cur) {
    var shape = find(SHAPES, cur.shape), color = find(COLORS, cur.color, COLORS[0]).v;
    var n = svgUri(shape, color, false), p = svgUri(shape, color, true), h = shape.hot[0] + ' ' + shape.hot[1];
    var click = ['a', 'a *', 'button', 'button *', 'select', 'label', 'summary', '[onclick]', '[role=button]', '.cursor-pointer', '.cursor-pointer *',
      'input[type=button]', 'input[type=submit]', 'input[type=checkbox]', 'input[type=radio]', 'input[type=range]'].join(',');
    return 'html,body,body *{cursor:' + n + ' ' + h + ',auto !important}' +
      click + '{cursor:' + p + ' ' + h + ',pointer !important}' +
      'input:not([type=button]):not([type=submit]):not([type=checkbox]):not([type=radio]):not([type=range]),textarea,[contenteditable=true]{cursor:text !important}' +
      ':disabled,[disabled]{cursor:not-allowed !important}';
  }
  function apply() {
    var cur = read(), st = document.getElementById(STYLE_ID);
    if (!cur) { if (st) st.remove(); return; }
    if (!st) { st = document.createElement('style'); st.id = STYLE_ID; (document.head || document.documentElement).appendChild(st); }
    st.textContent = css(cur);
  }

  var API = {
    shapes: SHAPES, colors: COLORS,
    get: function () { return read() || { shape: 'default', color: 'lime' }; },
    isCustom: function () { return !!read(); },
    set: function (c) {
      var cur = Object.assign({}, API.get(), c || {});
      if (cur.shape === 'default') return API.reset();
      try { localStorage.setItem(KEY, JSON.stringify({ shape: cur.shape, color: cur.color })); } catch (e) {}
      apply(); listeners.forEach(function (f) { try { f(API.get()); } catch (e) {} });
    },
    reset: function () {
      try { localStorage.removeItem(KEY); } catch (e) {}
      apply(); listeners.forEach(function (f) { try { f(null); } catch (e) {} });
    },
    onChange: function (fn) { listeners.push(fn); },
    // preview data-uri helper (used by the picker)
    uri: function (shapeId, colorId) { return svgUri(find(SHAPES, shapeId), find(COLORS, colorId, COLORS[0]).v, false); },
    // Draws the picker into `el`
    mount: function (el) {
      if (!el) return;
      function paint() {
        var cur = API.get(), custom = API.isCustom();
        var swatch = COLORS.map(function (c) {
          return '<button type="button" data-color="' + c.id + '" title="' + c.name + '" style="width:34px;height:34px;border-radius:50%;background:' + c.v + ';border:3px solid ' + (cur.color === c.id ? '#fff' : 'rgba(255,255,255,.18)') + ';cursor:pointer;"></button>';
        }).join('');
        var shapes = SHAPES.map(function (s) {
          var on = custom && cur.shape === s.id;
          return '<button type="button" data-shape="' + s.id + '" style="display:flex;flex-direction:column;align-items:center;gap:6px;padding:12px 6px;border-radius:14px;cursor:pointer;color:inherit;background:' + (on ? 'rgba(163,230,53,.12)' : 'rgba(255,255,255,.04)') + ';border:2px solid ' + (on ? '#a3e635' : 'rgba(255,255,255,.1)') + ';">' +
            '<img alt="" width="32" height="32" src="' + API.uri(s.id, cur.color).slice(5, -2).replace(/"/g, '') + '" style="width:32px;height:32px;"><span style="font-size:11px;font-weight:800;">' + s.name + '</span></button>';
        }).join('');
        el.innerHTML =
          '<p style="font-size:13px;opacity:.7;margin-bottom:14px;">اختر شكل مؤشر الماوس ولونه. يُطبَّق فوراً على كل صفحات اللعبة ويُحفظ لحسابك. (الهواتف واللوحات اللمسية ليس لها مؤشر، لذا لا يظهر عليها.)</p>' +
          '<div style="margin-bottom:14px;"><div style="font-size:12px;font-weight:900;opacity:.6;margin-bottom:8px;">اللون</div><div style="display:flex;gap:8px;flex-wrap:wrap;">' + swatch + '</div></div>' +
          '<div style="font-size:12px;font-weight:900;opacity:.6;margin-bottom:8px;">الشكل</div>' +
          '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:10px;margin-bottom:14px;">' + shapes + '</div>' +
          '<button type="button" data-reset="1" style="padding:10px 18px;border-radius:12px;font-weight:900;font-size:12px;cursor:pointer;color:inherit;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.2);">↺ المؤشر الافتراضي' + (custom ? '' : ' (الحالي)') + '</button>';
        Array.prototype.forEach.call(el.querySelectorAll('[data-shape]'), function (b) { b.onclick = function () { API.set({ shape: b.dataset.shape }); paint(); }; });
        Array.prototype.forEach.call(el.querySelectorAll('[data-color]'), function (b) { b.onclick = function () { API.set({ shape: custom ? cur.shape : 'arrow', color: b.dataset.color }); paint(); }; });
        var r = el.querySelector('[data-reset]'); if (r) r.onclick = function () { API.reset(); paint(); };
      }
      paint();
    }
  };
  window.EJCursor = API;
  apply();
  // another tab changed it
  window.addEventListener('storage', function (e) { if (e.key === KEY) apply(); });
})();
