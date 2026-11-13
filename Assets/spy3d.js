// ==================
// EL JASUS — 3D SPY  
// ==================
(function () {
    'use strict';

    // ── tiny vector / matrix helpers ──────────────
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

    function rotMat(rx, ry, rz) {            // R = Ry · Rx · Rz
        const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
        const Rz = [[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]];
        const Rx = [[1, 0, 0], [0, cx, -sx], [0, sx, cx]];
        const Ry = [[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]];
        return mul(Ry, mul(Rx, Rz));
    }
    function mul(A, B) {
        const r = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i][j] = A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j];
        return r;
    }
    const apply = (R, p) => [R[0][0] * p[0] + R[0][1] * p[1] + R[0][2] * p[2], R[1][0] * p[0] + R[1][1] * p[1] + R[1][2] * p[2], R[2][0] * p[0] + R[2][1] * p[1] + R[2][2] * p[2]];

    // ── primitives (convex, faces re-wound to face outward) ──
    function finish(verts, faces) {
        const c = [0, 0, 0]; verts.forEach(v => { c[0] += v[0]; c[1] += v[1]; c[2] += v[2]; });
        c[0] /= verts.length; c[1] /= verts.length; c[2] /= verts.length;
        faces = faces.map(f => {
            const a = verts[f[0]], b = verts[f[1]], d = verts[f[2]];
            const n = cross(sub(b, a), sub(d, a));
            const fc = [0, 0, 0]; f.forEach(i => { fc[0] += verts[i][0]; fc[1] += verts[i][1]; fc[2] += verts[i][2]; });
            const o = sub([fc[0] / f.length, fc[1] / f.length, fc[2] / f.length], c);
            return dot(n, o) < 0 ? f.slice().reverse() : f;
        });
        return { verts, faces };
    }
    function box(w, h, d) {
        const x = w / 2, y = h / 2, z = d / 2;
        const v = [[-x, -y, -z], [x, -y, -z], [x, y, -z], [-x, y, -z], [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]];
        return finish(v, [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [0, 3, 7, 4]]);
    }
    // truncated elliptic cone / cylinder along Y, centred
    function cyl(rxTop, rxBot, h, rzTop, rzBot, seg) {
        seg = seg || 14; rzTop = rzTop == null ? rxTop : rzTop; rzBot = rzBot == null ? rxBot : rzBot;
        const v = [], f = [];
        for (let i = 0; i < seg; i++) { const a = i / seg * Math.PI * 2; v.push([Math.cos(a) * rxTop, h / 2, Math.sin(a) * rzTop]); }
        for (let i = 0; i < seg; i++) { const a = i / seg * Math.PI * 2; v.push([Math.cos(a) * rxBot, -h / 2, Math.sin(a) * rzBot]); }
        for (let i = 0; i < seg; i++) { const j = (i + 1) % seg; f.push([i, j, seg + j, seg + i]); }
        f.push(Array.from({ length: seg }, (_, i) => i)); f.push(Array.from({ length: seg }, (_, i) => seg + i));
        return finish(v, f);
    }
    function sphere(r, seg, rings, sy) {
        seg = seg || 12; rings = rings || 8; sy = sy || 1;
        const v = [], f = [];
        for (let i = 0; i <= rings; i++) {
            const p = i / rings * Math.PI;
            for (let j = 0; j < seg; j++) { const a = j / seg * Math.PI * 2; v.push([Math.sin(p) * Math.cos(a) * r, Math.cos(p) * r * sy, Math.sin(p) * Math.sin(a) * r]); }
        }
        for (let i = 0; i < rings; i++) for (let j = 0; j < seg; j++) { const k = (j + 1) % seg; f.push([i * seg + j, i * seg + k, (i + 1) * seg + k, (i + 1) * seg + j]); }
        return finish(v, f);
    }

    // ── scene nodes ───────────────────────────────
    function Node(geo, opt) {
        opt = opt || {};
        this.geo = geo || null; this.color = opt.color || [20, 26, 30]; this.edge = opt.edge === undefined ? 'rgba(0,242,255,.5)' : opt.edge;
        this.pos = opt.pos || [0, 0, 0]; this.rot = [0, 0, 0]; this.children = [];
        this.glow = opt.glow || 0;
    }
    Node.prototype.add = function (n) { this.children.push(n); return n; };

    function collect(node, R, t, out) {
        const Rl = rotMat(node.rot[0], node.rot[1], node.rot[2]);
        const Rw = mul(R, Rl);
        const tw = [t[0] + apply(R, node.pos)[0], t[1] + apply(R, node.pos)[1], t[2] + apply(R, node.pos)[2]];
        if (node.geo) out.push({ node, Rw, tw });
        node.children.forEach(c => collect(c, Rw, tw, out));
    }

    // ── the spy ───────────────────────────────────
    function buildSpy() {
        const COAT = [24, 33, 40], COAT2 = [32, 44, 52], SKIN = [11, 15, 18], HAT = [12, 16, 19], LIME = [163, 230, 53], SHIRT = [200, 214, 220];
        const root = new Node(null);
        const body = root.add(new Node(null, { pos: [0, 0, 0] }));

        // legs + shoes
        [[-0.2, 1], [0.2, 1]].forEach(([x]) => {
            const leg = body.add(new Node(cyl(0.15, 0.13, 1.0, 0.15, 0.13, 10), { color: [10, 14, 17], pos: [x, 0.5, 0] }));
            leg.add(new Node(box(0.3, 0.14, 0.52), { color: [8, 10, 12], pos: [0, -0.56, 0.08] }));
        });

        // coat: skirt + torso (oval cross-section, flares at the bottom like the logo)
        body.add(new Node(cyl(0.58, 0.82, 1.0, 0.36, 0.5, 16), { color: COAT, pos: [0, 1.0, 0] }));
        const torso = body.add(new Node(cyl(0.6, 0.6, 0.9, 0.36, 0.38, 16), { color: COAT2, pos: [0, 1.88, 0] }));
        // shirt wedge + tie
        torso.add(new Node(box(0.26, 0.62, 0.05), { color: SHIRT, edge: 'rgba(0,242,255,.5)', pos: [0, 0.14, 0.37] }));
        torso.add(new Node(box(0.09, 0.56, 0.05), { color: LIME, edge: 'rgba(255,255,255,.35)', pos: [0, 0.08, 0.4] }));
        torso.add(new Node(box(0.12, 0.1, 0.06), { color: LIME, edge: 'rgba(255,255,255,.35)', pos: [0, 0.36, 0.4] }));
        // belt
        body.add(new Node(cyl(0.6, 0.6, 0.07, 0.38, 0.4, 16), { color: [6, 8, 10], edge: 'rgba(163,230,53,.7)', pos: [0, 1.5, 0] }));
        // popped collar
        const collarL = torso.add(new Node(box(0.34, 0.34, 0.05), { color: COAT, pos: [-0.2, 0.52, 0.2] })); collarL.rot = [-0.25, 0.5, 0.35];
        const collarR = torso.add(new Node(box(0.34, 0.34, 0.05), { color: COAT, pos: [0.2, 0.52, 0.2] })); collarR.rot = [-0.25, -0.5, -0.35];

        // head + fedora
        const head = body.add(new Node(null, { pos: [0, 2.62, 0.02] }));
        head.add(new Node(cyl(0.08, 0.1, 0.12, 0.08, 0.1, 8), { color: SKIN, pos: [0, -0.3, 0] }));      // neck
        head.add(new Node(sphere(0.34, 14, 10, 1.1), { color: SKIN, pos: [0, 0, 0] }));
        const eyeL = head.add(new Node(box(0.11, 0.035, 0.03), { color: [0, 242, 255], edge: null, pos: [-0.1, 0.02, 0.29], glow: 1 }));
        const eyeR = head.add(new Node(box(0.11, 0.035, 0.03), { color: [0, 242, 255], edge: null, pos: [0.1, 0.02, 0.29], glow: 1 }));
        head.add(new Node(cyl(0.64, 0.64, 0.045, 0.6, 0.6, 22), { color: HAT, pos: [0, 0.2, 0] }));          // brim
        head.add(new Node(cyl(0.3, 0.36, 0.34, 0.3, 0.36, 16), { color: HAT, pos: [0, 0.4, 0] }));           // crown
        head.add(new Node(cyl(0.365, 0.372, 0.07, 0.365, 0.372, 16), { color: LIME, edge: 'rgba(255,255,255,.3)', pos: [0, 0.27, 0] })); // band
        const pinch = head.add(new Node(box(0.2, 0.05, 0.05), { color: HAT, pos: [0, 0.58, 0.2] })); pinch.rot = [0.4, 0, 0];

        // arms (shoulder → upper arm → elbow → forearm → hand)
        function arm(side) {
            const sh = body.add(new Node(null, { pos: [side * 0.68, 2.2, 0] }));
            sh.add(new Node(sphere(0.17, 8, 6), { color: COAT2, pos: [0, 0, 0] }));
            sh.add(new Node(cyl(0.15, 0.13, 0.7, 0.15, 0.13, 10), { color: COAT, pos: [0, -0.35, 0] }));
            const el = sh.add(new Node(null, { pos: [0, -0.7, 0] }));
            el.add(new Node(sphere(0.13, 8, 6), { color: COAT2 }));
            el.add(new Node(cyl(0.13, 0.11, 0.6, 0.13, 0.11, 10), { color: COAT, pos: [0, -0.3, 0] }));
            const hand = el.add(new Node(sphere(0.12, 8, 6, 1.2), { color: SKIN, pos: [0, -0.68, 0] }));
            hand.add(new Node(box(0.05, 0.12, 0.2), { color: SKIN, pos: [side * -0.1, -0.02, 0.04], edge: 'rgba(0,242,255,.55)' })); // thumb
            return { sh, el, hand };
        }
        const A = arm(1), B = arm(-1);
        return { root, body, head, torso, A, B, eyeL, eyeR };
    }

    // ── poses (target angles; smoothed every frame) ──
    const POSES = {
        idle:      t => ({ A: { sh: [0.05, 0, 0.12], el: [-0.12, 0, 0] }, B: { sh: [0.05, 0, -0.12], el: [-0.12, 0, 0] }, yaw: Math.sin(t * 0.7) * 0.35 }),
        wave:      t => ({ A: { sh: [0, 0, 2.55], el: [0, 0, 0.15 + Math.sin(t * 7) * 0.55] }, B: { sh: [0.05, 0, -0.12], el: [-0.12, 0, 0] }, yaw: -0.25 + Math.sin(t * 0.8) * 0.1 }),
        explain:   t => ({ A: { sh: [-0.55 + Math.sin(t * 2.2) * 0.12, 0, 0.5], el: [-1.15 + Math.sin(t * 3.1) * 0.25, 0, 0] }, B: { sh: [-0.45 + Math.cos(t * 2.0) * 0.1, 0, -0.4], el: [-1.0 + Math.cos(t * 2.7) * 0.25, 0, 0] }, yaw: Math.sin(t * 0.9) * 0.3 }),
        point:     t => ({ A: { sh: [0, 0, 1.3 + Math.sin(t * 4) * 0.04], el: [0, 0, 0.02] }, B: { sh: [0.05, 0, -0.12], el: [-0.2, 0, 0] }, yaw: -0.3 }),
        pointLeft: t => ({ B: { sh: [0, 0, -1.3 - Math.sin(t * 4) * 0.04], el: [0, 0, -0.02] }, A: { sh: [0.05, 0, 0.12], el: [-0.2, 0, 0] }, yaw: 0.3 }),
        thumbs:    t => ({ A: { sh: [-0.9, 0, 0.35], el: [-1.55 + Math.sin(t * 5) * 0.08, 0, 0] }, B: { sh: [0.05, 0, -0.12], el: [-0.12, 0, 0] }, yaw: Math.sin(t * 0.8) * 0.2 })
    };

    function lerp(a, b, k) { return a + (b - a) * k; }

    // ── mount ─────────────────────────────────────
    function mount(container, opts) {
        opts = opts || {};
        const size = opts.size || 180;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const cv = document.createElement('canvas');
        cv.width = Math.round(size * dpr); cv.height = Math.round(size * 1.15 * dpr);
        cv.style.cssText = `width:${size}px;height:${Math.round(size * 1.15)}px;display:block;touch-action:none;pointer-events:none`;
        cv.setAttribute('aria-hidden', 'true');
        container.appendChild(cv);
        const ctx = cv.getContext('2d');
        const spy = buildSpy();
        const W = cv.width, H = cv.height;
        const camD = 9.5, focal = W * 2.2, cx = W / 2, SC = focal / camD, cy = H * 0.93 - 1.66 * SC;
        const light = norm([-0.45, 0.65, 0.75]);
        const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
        let pose = opts.pose || 'idle', alive = true, raf = 0;
        let cur = { A: { sh: [0, 0, 0], el: [0, 0, 0] }, B: { sh: [0, 0, 0], el: [0, 0, 0] }, yaw: 0 };
        let userYaw = 0, t0 = performance.now();

        function setAngles(node, tgt, k) { for (let i = 0; i < 3; i++) node.rot[i] = lerp(node.rot[i], tgt[i], k); }

        function frame(now) {
            if (!alive) return;
            if (!container.isConnected) { destroy(); return; }
            raf = requestAnimationFrame(frame);
            if (document.hidden) return;
            const t = reduce ? 0.6 : (now - t0) / 1000;
            const p = POSES[pose](t);
            const k = 0.14;
            setAngles(spy.A.sh, p.A.sh, k); setAngles(spy.A.el, p.A.el, k);
            setAngles(spy.B.sh, p.B.sh, k); setAngles(spy.B.el, p.B.el, k);
            // body idle motion
            const bob = reduce ? 0 : Math.sin(t * 2.2) * 0.025;
            spy.body.pos[1] = bob;
            spy.torso.rot[1] = Math.sin(t * 1.1) * 0.05;
            spy.head.rot[1] = Math.sin(t * 0.9 + 1) * 0.25; spy.head.rot[0] = Math.sin(t * 1.3) * 0.04;
            cur.yaw = lerp(cur.yaw, p.yaw + userYaw, 0.08);
            render(t);
        }

        function render(t) {
            ctx.clearRect(0, 0, W, H);
            const out = [];
            const worldR = mul(rotMat(0.06, cur.yaw, 0), [[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
            collect(spy.root, worldR, [0, -1.55, 0], out);

            // soft ground shadow
            ctx.save(); ctx.fillStyle = 'rgba(0,0,0,.35)';
            ctx.beginPath(); ctx.ellipse(cx, cy + 1.66 * SC, 0.95 * SC, 0.2 * SC, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();

            const polys = [];
            for (const o of out) {
                const g = o.node.geo;
                const vw = g.verts.map(v => { const q = apply(o.Rw, v); return [q[0] + o.tw[0], q[1] + o.tw[1], q[2] + o.tw[2]]; });
                for (const f of g.faces) {
                    const a = vw[f[0]], b = vw[f[1]], c = vw[f[2]];
                    const n = norm(cross(sub(b, a), sub(c, a)));
                    const fc = [0, 0, 0]; f.forEach(i => { fc[0] += vw[i][0]; fc[1] += vw[i][1]; fc[2] += vw[i][2]; });
                    fc[0] /= f.length; fc[1] /= f.length; fc[2] /= f.length;
                    if (dot(n, sub([0, 0, camD], fc)) <= 0) continue;                 // back-face cull
                    polys.push({ f, vw, n, fc, node: o.node });
                }
            }
            polys.sort((p1, p2) => (camD - p2.fc[2]) - (camD - p1.fc[2]));

            for (const p of polys) {
                const base = p.node.color;
                const lit = p.node.glow ? 1 : (0.32 + 0.68 * Math.max(0, dot(p.n, light)));
                const rim = p.node.glow ? 0 : Math.pow(1 - Math.abs(p.n[2]), 2.2) * 0.22;
                const r = Math.min(255, base[0] * lit + 0 * rim), gC = Math.min(255, base[1] * lit + 242 * rim), bC = Math.min(255, base[2] * lit + 255 * rim);
                ctx.beginPath();
                p.f.forEach((i, idx) => {
                    const v = p.vw[i], d = camD - v[2], s = focal / d;
                    const sx = cx + v[0] * s * 1.0, sy = cy - v[1] * s * 1.0;
                    idx ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy);
                });
                ctx.closePath();
                ctx.fillStyle = `rgb(${r | 0},${gC | 0},${bC | 0})`; ctx.fill();
                if (p.node.edge) { ctx.strokeStyle = p.node.edge; ctx.lineWidth = Math.max(1, dpr * 0.8); ctx.stroke(); }
                else { ctx.strokeStyle = `rgb(${r | 0},${gC | 0},${bC | 0})`; ctx.lineWidth = 1; ctx.stroke(); }
            }
        }

        function destroy() { alive = false; cancelAnimationFrame(raf); if (cv.parentNode) cv.parentNode.removeChild(cv); }
        function setPose(n) { if (POSES[n]) pose = n; }

        raf = requestAnimationFrame(frame);
        return { setPose, destroy, canvas: cv, get pose() { return pose; } };
    }

    window.EJSpy3D = { mount };
})();
