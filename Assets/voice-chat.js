// ============================================
// EL JASUS — VOICE CHAT (WebRTC) v4  — rebuilt
//
// Why the old version never delivered audio to other players:
//   1. every signal (offer / answer / ICE) was broadcast to EVERYONE and handled by everyone, so with 3+ people the
//      connections collided; answers/ICE were applied to the wrong peer
//   2. ICE candidates that arrived before the remote description were thrown away → the link never completed
//   3. "joined" announcements older than 30 s were ignored, so anyone joining voice later never learnt who was already
//      talking and nobody called them
//   4. no TURN server → fails on mobile data / strict NATs
//   5. room.html calls toggleRemoteMute / isRemoteMuted which did not exist
//
// How it works now:
//   • rooms/{code}/voice/members/{uid}   who is in voice (name, muted, speaking). Removed automatically on disconnect.
//   • rooms/{code}/voice/signals/{uid}/* a private inbox per player; every signal is addressed to ONE peer and deleted
//     once handled
//   • full mesh: when two people are in voice, the one with the smaller uid sends the offer (no "glare")
//   • ICE candidates are queued until the remote description exists; failed links are rebuilt automatically
//   • ICE servers = STUN + optional TURN from Assets/voice-config.js (window.EJ_VOICE_CONFIG)
// ============================================

class VoiceChat {
    constructor(db, roomCode, currentUid, currentUsername) {
        this.db       = db;
        this.roomCode = roomCode;
        this.uid      = currentUid;
        this.username = currentUsername;

        this.peers       = {};   // uid → RTCPeerConnection
        this.pending     = {};   // uid → [ICE candidates waiting for the remote description]
        this.members     = {};   // uid → {name, muted, speaking}
        this.remoteMuted = {};   // uid → true  (local-only: I stopped listening to that player)
        this.localStream = null;
        this.muted       = false;
        this.active      = false;
        this.speaking    = {};
        this._audioCtx   = null;
        this._rafId      = null;
        this._unsubs     = [];
        this._retry      = {};
        this._iceCache   = null;

        this.buildUI();
    }

    get _F() { return window._firebaseFns || {}; }
    _path(p) { return this._F.ref(this.db, `rooms/${this.roomCode}/voice/${p}`); }

    // ── ICE servers (STUN + TURN) ─────────────
    async _iceServers() {
        if (this._iceCache) return this._iceCache;
        const cfg = window.EJ_VOICE_CONFIG || {};
        let servers = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
        if (typeof window.EJ_FETCH_TURN === 'function') {          // optional: short-lived Cloudflare TURN credentials via the worker
            try { const extra = await Promise.race([window.EJ_FETCH_TURN(), new Promise(r => setTimeout(() => r(null), 3500))]); if (Array.isArray(extra)) servers = servers.concat(extra); } catch (e) {}
        }
        if (Array.isArray(cfg.iceServers)) servers = servers.concat(cfg.iceServers);
        this._iceCache = servers;
        return servers;
    }

    // ── JOIN VOICE ────────────────────────────
    async join() {
        if (this.active) return;
        const F = this._F;
        if (!F.ref || !F.set || !F.onValue || !F.onChildAdded) {
            if (window.showToast) showToast('⛔ خطأ في الاتصال بالسيرفر');
            return;
        }
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            if (window.showToast) showToast('⛔ المتصفح لا يدعم الميكروفون (يلزم HTTPS)');
            return;
        }
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
                video: false
            });
        } catch (err) {
            console.error('[VC] mic error:', err);
            this.localStream = null;
            const msg = err && err.name === 'NotAllowedError' ? '⛔ يجب السماح بالوصول للميكروفون' : '⛔ خطأ في الصوت: ' + (err && err.message);
            if (window.showToast) showToast(msg); else alert(msg);
            return;
        }

        this.active = true;
        this.muted  = false;
        await this._iceServers();           // resolve once so every peer uses the same list
        this.updateUI();
        this.setupVoiceDetection();

        // 1) my private inbox
        const inbox = this._path(`signals/${this.uid}`);
        try { F.onDisconnect(inbox).remove(); } catch (e) {}
        this._unsubs.push(F.onChildAdded(inbox, snap => {
            const msg = snap.val();
            try { F.remove(snap.ref); } catch (e) {}
            if (msg && msg.from && msg.from !== this.uid && Date.now() - (msg.ts || 0) < 60000) this.handleSignal(msg);
        }));

        // 2) announce myself, then watch everyone else
        const me = this._path(`members/${this.uid}`);
        try { F.onDisconnect(me).remove(); } catch (e) {}
        await F.set(me, { name: this.username, muted: false, speaking: false, ts: Date.now() });
        this._unsubs.push(F.onValue(this._path('members'), snap => this._onMembers(snap.val() || {})));

        if (window.showToast) showToast('🎙️ انضممت للدردشة الصوتية');
    }

    // ── LEAVE VOICE ───────────────────────────
    leave() {
        const F = this._F;
        this._unsubs.forEach(u => { try { typeof u === 'function' && u(); } catch (e) {} });
        this._unsubs = [];
        Object.values(this._retry).forEach(clearTimeout); this._retry = {};

        if (this.localStream) { this.localStream.getTracks().forEach(t => t.stop()); this.localStream = null; }
        if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
        if (this._audioCtx) { try { this._audioCtx.close(); } catch (e) {} this._audioCtx = null; }

        Object.keys(this.peers).forEach(uid => this.removePeer(uid));
        Object.keys(this.members).forEach(uid => { if (uid !== this.uid) this.removeVoiceUser(uid); });
        this.members = {}; this.pending = {};

        const wasActive = this.active;
        this.active = false;
        this.muted  = false;
        this.updateUI();
        if (wasActive && F.remove) {
            try { F.remove(this._path(`members/${this.uid}`)); F.remove(this._path(`signals/${this.uid}`)); } catch (e) {}
            if (window.showToast) showToast('🎙️ غادرت الدردشة الصوتية');
        }
    }

    // ── MUTE / UNMUTE (me) ────────────────────
    toggleMute() {
        if (!this.active) { if (window.showToast) showToast('⛔ انضم للدردشة الصوتية أولاً'); return; }
        this.muted = !this.muted;
        if (this.localStream) this.localStream.getAudioTracks().forEach(t => (t.enabled = !this.muted));
        try { this._F.update(this._path(`members/${this.uid}`), { muted: this.muted, speaking: false }); } catch (e) {}
        this.updateUI();
        if (window.showToast) showToast(this.muted ? '🔇 تم كتم الصوت' : '🎙️ تم تشغيل الصوت');
    }

    // ── MUTE A PLAYER (only for me) ───────────
    toggleRemoteMute(uid) {
        this.remoteMuted[uid] = !this.remoteMuted[uid];
        const a = document.getElementById(`audio-${uid}`);
        if (a) a.muted = !!this.remoteMuted[uid];
        return this.remoteMuted[uid];
    }
    isRemoteMuted(uid) { return !!this.remoteMuted[uid]; }

    // ── MEMBERS ───────────────────────────────
    _onMembers(map) {
        if (!this.active) return;
        const prev = this.members; this.members = map;
        Object.keys(map).forEach(uid => {
            if (uid === this.uid) return;
            this.addVoiceUser(uid, (map[uid] && map[uid].name) || 'لاعب');
            this.setSpeaking(uid, !!(map[uid] && map[uid].speaking && !map[uid].muted));
            if (!this.peers[uid]) this.createPeer(uid, this.uid < uid).catch(e => console.warn('[VC] peer', e));
        });
        Object.keys(prev).forEach(uid => {
            if (uid !== this.uid && !map[uid]) { this.removePeer(uid); this.removeVoiceUser(uid); }
        });
        this.addVoiceUser(this.uid, this.username);
    }

    // ── SIGNALING (always to ONE peer) ────────
    _send(to, type, data) {
        const F = this._F;
        try { F.push(this._path(`signals/${to}`), { from: this.uid, type, data: JSON.parse(JSON.stringify(data || {})), ts: Date.now() }); }
        catch (e) { console.error('[VC] signal error:', e); }
    }

    async handleSignal(msg) {
        const from = msg.from;
        try {
            if (msg.type === 'offer') {
                if (!this.active) return;
                const pc = await this.createPeer(from, false);
                await pc.setRemoteDescription(new RTCSessionDescription(msg.data));
                await this._flush(from);
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                this._send(from, 'answer', pc.localDescription.toJSON());
            } else if (msg.type === 'answer') {
                const pc = this.peers[from];
                if (pc && pc.signalingState === 'have-local-offer') { await pc.setRemoteDescription(new RTCSessionDescription(msg.data)); await this._flush(from); }
            } else if (msg.type === 'ice') {
                const pc = this.peers[from];
                if (pc && pc.remoteDescription) { try { await pc.addIceCandidate(new RTCIceCandidate(msg.data)); } catch (e) {} }
                else (this.pending[from] = this.pending[from] || []).push(msg.data);   // queue until the remote description exists
            }
        } catch (e) { console.warn('[VC] signal handling failed', msg.type, e); }
    }
    async _flush(uid) {
        const pc = this.peers[uid]; const q = this.pending[uid] || []; this.pending[uid] = [];
        for (const c of q) { try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch (e) {} }
    }

    // ── PEER CONNECTION ───────────────────────
    async createPeer(remoteUid, initiator) {
        if (this.peers[remoteUid]) { this.peers[remoteUid].close(); delete this.peers[remoteUid]; }
        this.pending[remoteUid] = this.pending[remoteUid] || [];
        const pc = new RTCPeerConnection({ iceServers: await this._iceServers() });
        this.peers[remoteUid] = pc;
        pc.__initiator = initiator;

        if (this.localStream) this.localStream.getTracks().forEach(t => pc.addTrack(t, this.localStream));

        pc.ontrack = (e) => {
            const old = document.getElementById(`audio-${remoteUid}`);
            if (old) old.remove();
            const audio = document.createElement('audio');
            audio.autoplay = true; audio.playsInline = true;
            audio.id = `audio-${remoteUid}`;
            audio.srcObject = e.streams[0] || new MediaStream([e.track]);
            audio.muted = !!this.remoteMuted[remoteUid];
            document.getElementById('voice-audio-container')?.appendChild(audio);
            const p = audio.play(); if (p && p.catch) p.catch(() => this._unlockAudioOnTap());
        };
        pc.onicecandidate = (e) => { if (e.candidate) this._send(remoteUid, 'ice', e.candidate.toJSON()); };
        pc.onconnectionstatechange = () => {
            this.updatePeerStatus(remoteUid, pc.connectionState);
            if (pc.connectionState === 'failed' || pc.connectionState === 'closed') this._rebuild(remoteUid, pc);
        };

        if (initiator) {
            const offer = await pc.createOffer({ offerToReceiveAudio: true });
            await pc.setLocalDescription(offer);
            this._send(remoteUid, 'offer', pc.localDescription.toJSON());
        }
        return pc;
    }
    // a failed link is rebuilt by the same side that started it
    _rebuild(uid, pcOld) {
        if (this.peers[uid] !== pcOld || !this.active) return;
        delete this.peers[uid];
        try { pcOld.close(); } catch (e) {}
        if (!this.members[uid] || !pcOld.__initiator) return;
        clearTimeout(this._retry[uid]);
        this._retry[uid] = setTimeout(() => { if (this.active && this.members[uid] && !this.peers[uid]) this.createPeer(uid, true).catch(() => {}); }, 1500);
    }
    _unlockAudioOnTap() {
        if (this._unlockBound) return; this._unlockBound = true;
        if (window.showToast) showToast('🔊 اضغط في أي مكان لتشغيل صوت اللاعبين');
        const go = () => { document.querySelectorAll('#voice-audio-container audio').forEach(a => a.play().catch(() => {})); this._unlockBound = false; };
        document.addEventListener('click', go, { once: true });
        document.addEventListener('touchstart', go, { once: true });
    }

    removePeer(uid) {
        if (this.peers[uid]) { try { this.peers[uid].close(); } catch (e) {} delete this.peers[uid]; }
        delete this.pending[uid];
        clearTimeout(this._retry[uid]);
        const audio = document.getElementById(`audio-${uid}`);
        if (audio) audio.remove();
    }

    // ── VOICE ACTIVITY DETECTION (publishes "speaking" through the member record) ──
    setupVoiceDetection() {
        if (!this.localStream || !(window.AudioContext || window.webkitAudioContext)) return;
        if (this._audioCtx) { try { this._audioCtx.close(); } catch (e) {} }
        this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const source = this._audioCtx.createMediaStreamSource(this.localStream);
        const analyser = this._audioCtx.createAnalyser();
        analyser.fftSize = 256; source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        let last = false, lastTs = 0;
        const check = () => {
            if (!this.active || !this.localStream) { this._rafId = null; return; }
            analyser.getByteFrequencyData(data);
            const avg = data.reduce((a, b) => a + b, 0) / data.length;
            const speaking = avg > 20 && !this.muted;
            const now = Date.now();
            if (speaking !== last && now - lastTs > 250) {
                last = speaking; lastTs = now;
                this.setSpeaking(this.uid, speaking);
                try { this._F.update(this._path(`members/${this.uid}`), { speaking }); } catch (e) {}
            }
            this._rafId = requestAnimationFrame(check);
        };
        check();
    }

    setSpeaking(uid, speaking) {
        this.speaking[uid] = speaking;
        const el = document.getElementById(`voice-user-${uid}`);
        if (el) {
            el.style.borderColor = speaking ? '#00ff00' : 'rgba(0,242,255,.3)';
            el.style.boxShadow   = speaking ? '0 0 15px rgba(0,255,0,.6)' : 'none';
        }
    }

    updatePeerStatus(uid, state) {
        const dot = document.getElementById(`peer-dot-${uid}`);
        if (!dot) return;
        const colors = {
            connected:    '#00ff00',
            connecting:   '#ffd700',
            failed:       '#ff4444',
            disconnected: '#666',
            closed:       '#666',
        };
        dot.style.background = colors[state] || '#666';
    }

    // ── VOICE USERS UI ────────────────────────
    addVoiceUser(uid, name) {
        const container = document.getElementById('voice-users');
        if (!container) return;
        if (document.getElementById(`voice-user-${uid}`)) return; // already shown

        // Remove "nobody here" placeholder
        const placeholder = container.querySelector('.vc-empty');
        if (placeholder) placeholder.remove();

        const el = document.createElement('div');
        el.id = `voice-user-${uid}`;
        el.style.cssText = `
            display:flex;flex-direction:column;align-items:center;gap:4px;
            padding:8px;border-radius:12px;border:2px solid rgba(0,242,255,.3);
            background:rgba(0,242,255,.05);transition:all .3s;min-width:60px;`;
        el.innerHTML = `
            <div style="width:36px;height:36px;border-radius:50%;
                background:linear-gradient(135deg,#00f2ff,#7c30ff);
                display:flex;align-items:center;justify-content:center;position:relative;">
                <i class="fas fa-user" style="color:white;font-size:14px;"></i>
                <div id="peer-dot-${uid}" style="
                    position:absolute;bottom:0;right:0;
                    width:10px;height:10px;border-radius:50%;
                    background:#ffd700;border:2px solid #0a0e1a;"></div>
            </div>
            <span style="font-size:9px;color:#ccc;font-weight:700;
                max-width:56px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${name}</span>`;
        container.appendChild(el);
    }

    removeVoiceUser(uid) {
        document.getElementById(`voice-user-${uid}`)?.remove();
        // If container is now empty, restore placeholder
        const container = document.getElementById('voice-users');
        if (container && !container.querySelector('[id^="voice-user-"]')) {
            const p = document.createElement('p');
            p.className = 'vc-empty';
            p.style.cssText = 'color:#555;font-size:11px;text-align:center;width:100%;';
            p.textContent = 'لا أحد في الدردشة الصوتية';
            container.appendChild(p);
        }
    }

    // ── UI PANEL ──────────────────────────────
    buildUI() {
        if (document.getElementById('voice-panel')) return;

        document.body.insertAdjacentHTML('beforeend', `
        <!-- Hidden audio container -->
        <div id="voice-audio-container" style="display:none;position:absolute;"></div>

        <!-- Voice chat panel — centered overlay, same pattern as chat/friends/reports panels -->
        <div id="voice-panel" style="
            display:none;position:fixed;inset:0;z-index:8500;
            background:rgba(0,0,0,.85);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);
            align-items:center;justify-content:center;padding:20px;
            animation:vcPanelIn .2s ease;">
          <div style="
              width:100%;max-width:340px;max-height:85vh;overflow-y:auto;
              background:linear-gradient(135deg,rgba(10,14,26,.98),rgba(20,25,45,.98));
              border:2px solid rgba(0,242,255,.3);border-radius:20px;padding:18px;
              box-shadow:0 8px 40px rgba(0,0,0,.6);font-family:'Cairo',sans-serif;">

            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
                <h4 style="color:#00f2ff;font-size:12px;font-weight:900;
                    text-transform:uppercase;letter-spacing:2px;margin:0;">
                    🎙️ الدردشة الصوتية
                </h4>
                <button id="vc-close-btn"
                    style="background:none;border:none;color:#555;cursor:pointer;font-size:16px;
                        padding:4px 6px;border-radius:6px;transition:color .2s;"
                    onmouseover="this.style.color='#ccc'" onmouseout="this.style.color='#555'">✕</button>
            </div>

            <!-- Active users list -->
            <div id="voice-users" style="
                display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;
                min-height:50px;align-items:center;justify-content:center;">
                <p class="vc-empty" style="color:#555;font-size:11px;text-align:center;width:100%;">
                    لا أحد في الدردشة الصوتية
                </p>
            </div>

            <!-- Controls -->
            <div style="display:flex;gap:8px;align-items:center;">
                <!-- Join button (visible when not in voice) -->
                <button id="vc-join-btn"
                    style="flex:1;padding:10px;border-radius:12px;font-weight:900;font-size:12px;
                        background:linear-gradient(135deg,#00f2ff,#7c30ff);border:none;
                        color:white;cursor:pointer;transition:opacity .2s;"
                    onmouseover="this.style.opacity='.85'" onmouseout="this.style.opacity='1'">
                    انضم للصوت
                </button>

                <!-- Mute button (visible when in voice) -->
                <button id="vc-mute-btn"
                    style="display:none;flex:1;padding:10px;border-radius:12px;font-weight:900;font-size:12px;
                        border:2px solid rgba(0,242,255,.3);background:rgba(0,242,255,.1);
                        color:#00f2ff;cursor:pointer;transition:all .2s;">
                    <i class="fas fa-microphone"></i> مفتوح
                </button>

                <!-- Leave button (visible when in voice) -->
                <button id="vc-leave-btn"
                    style="display:none;width:42px;height:42px;border-radius:12px;
                        border:2px solid rgba(239,68,68,.3);background:rgba(239,68,68,.1);
                        color:#ef4444;cursor:pointer;font-size:16px;
                        align-items:center;justify-content:center;
                        transition:all .2s;"
                    title="مغادرة الصوت">
                    <i class="fas fa-phone-slash"></i>
                </button>
            </div>
          </div>
        </div>

        <style>
            @keyframes vcPanelIn {
                from { opacity:0; }
                to   { opacity:1; }
            }
        </style>`);

        // Wire up panel close button
        document.getElementById('vc-close-btn').addEventListener('click', () => this._togglePanel(false));

        // Click outside the card (on the backdrop) closes the panel — same UX as the other room panels
        document.getElementById('voice-panel').addEventListener('click', (e) => {
            if (e.target.id === 'voice-panel') this._togglePanel(false);
        });

        // Wire up join/mute/leave
        document.getElementById('vc-join-btn').addEventListener('click',  () => this.join());
        document.getElementById('vc-mute-btn').addEventListener('click',  () => this.toggleMute());
        document.getElementById('vc-leave-btn').addEventListener('click', () => {
            this.leave();
            this._togglePanel(false);
        });
    }

    _togglePanel(force) {
        const panel = document.getElementById('voice-panel');
        if (!panel) return;
        const isOpen = panel.style.display === 'flex';
        const next   = force !== undefined ? force : !isOpen;
        panel.style.display = next ? 'flex' : 'none';
    }

    updateUI() {
        const joinBtn  = document.getElementById('vc-join-btn');
        const muteBtn  = document.getElementById('vc-mute-btn');
        const leaveBtn = document.getElementById('vc-leave-btn');
        const trigger  = document.getElementById('voiceBtn'); // static dock button, lives in room.html
        if (!joinBtn || !muteBtn || !leaveBtn) return;

        if (this.active) {
            // ── In voice ──
            joinBtn.style.display  = 'none';
            muteBtn.style.display  = 'block';
            leaveBtn.style.display = 'flex';

            // Mute button appearance
            if (this.muted) {
                muteBtn.style.background    = 'rgba(239,68,68,.15)';
                muteBtn.style.borderColor   = 'rgba(239,68,68,.4)';
                muteBtn.style.color         = '#ef4444';
                muteBtn.innerHTML           = '<i class="fas fa-microphone-slash"></i> مكتوم';
            } else {
                muteBtn.style.background    = 'rgba(0,242,255,.1)';
                muteBtn.style.borderColor   = 'rgba(0,242,255,.3)';
                muteBtn.style.color         = '#00f2ff';
                muteBtn.innerHTML           = '<i class="fas fa-microphone"></i> مفتوح';
            }

            // Dock button: green when active, red-ish when muted (mirrors the old FAB states)
            if (trigger) {
                trigger.style.borderColor = this.muted ? 'rgba(239,68,68,.7)' : 'rgba(34,197,94,.7)';
                trigger.style.background  = this.muted ? 'rgba(239,68,68,.18)' : 'rgba(34,197,94,.22)';
                trigger.style.color       = this.muted ? '#ef4444' : '#00ff00';
                trigger.style.boxShadow   = this.muted
                    ? '0 0 12px rgba(239,68,68,.4)'
                    : '0 0 12px rgba(34,197,94,.4)';
            }

            // Add self to user list
            this.addVoiceUser(this.uid, this.username);

        } else {
            // ── Not in voice ──
            joinBtn.style.display  = 'block';
            muteBtn.style.display  = 'none';
            leaveBtn.style.display = 'none';

            // Dock button: back to its default idle colors
            if (trigger) {
                trigger.style.borderColor = 'rgba(34,197,94,0.3)';
                trigger.style.background  = 'rgba(34,197,94,0.15)';
                trigger.style.color       = '#22c55e';
                trigger.style.boxShadow   = 'none';
            }

            this.removeVoiceUser(this.uid);
        }
    }
}

// ── EXPORT ────────────────────────────────
window.VoiceChat = VoiceChat;
