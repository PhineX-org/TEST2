// ============================================
// EL JASUS — VOICE CONFIG
// Voice works with STUN only on most home Wi-Fi networks. On mobile data / strict routers a TURN relay is needed.
// To add one, paste your server(s) below (free option: Cloudflare Calls TURN, or any coturn / Metered / Twilio server):
//   iceServers: [{ urls: 'turn:YOUR_HOST:3478', username: 'USER', credential: 'PASS' }]
// ============================================
window.EJ_VOICE_CONFIG = {
    iceServers: [
        // { urls: ['turn:YOUR_HOST:3478?transport=udp','turn:YOUR_HOST:3478?transport=tcp'], username: 'USER', credential: 'PASS' }
    ]
};
