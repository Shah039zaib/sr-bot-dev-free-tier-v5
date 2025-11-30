// src/whatsapp.js
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = require('baileys');
const pino = require('pino');
const logger = pino({ level: 'silent' });

let _sock = null;
let _reconnectTimer = null;
let _backoff = 2000;

async function startWhatsApp(onMessage) {
  // agar socket already active ho to wapas return
  if (_sock && !_sock.destroyed) return _sock;

  const authDir = path.join(__dirname, '..', 'whatsapp_auth');
  try { if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true }); } catch(e){}

  try {
    const { state, saveCreds } = await useMultiFileAuthState(authDir);

    const sock = makeWASocket({
      printQRInTerminal: false,
      auth: state,
      logger,
      browser: Browsers.macOS('Safari'),
      // optional: fixed version tuple, change if Whatsapp changes
      version: [2, 2302, 8]
    });

    _sock = sock;

    // save creds when updated
    sock.ev.on('creds.update', async () => {
      try { await saveCreds(); console.log('Creds saved'); } catch (e) { console.error('saveCreds fail', e); }
    });

    // connection updates (QR, open, close...)
    sock.ev.on('connection.update', async (update) => {
      try {
        const { connection, lastDisconnect, qr } = update;

        // QR handling: write txt + png to public/
        if (qr) {
          try {
            const txtPath = path.join(__dirname, '..', 'public', 'latest_qr.txt');
            const pngPath = path.join(__dirname, '..', 'public', 'latest_qr.png');
            fs.mkdirSync(path.dirname(txtPath), { recursive: true });
            fs.writeFileSync(txtPath, qr, 'utf8');
            qrcode.toFile(pngPath, qr, { width: 400 })
              .then(()=> console.log('QR PNG saved'))
              .catch(err => console.error('QR PNG error', err));
            console.log('QR text saved.');
          } catch (e) { console.error('QR write error', e); }
        }

        if (connection === 'open') {
          console.log('WhatsApp connected!');
          // remove QR files after success so /qr endpoint empty
          try { fs.unlinkSync(path.join(__dirname, '..', 'public', 'latest_qr.txt')); } catch(e){}
          try { fs.unlinkSync(path.join(__dirname, '..', 'public', 'latest_qr.png')); } catch(e){}
          _backoff = 2000;
          if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
        }

        if (connection === 'close') {
          const code = lastDisconnect?.error?.output?.statusCode;
          console.log('Connection closed, reason code:', code);

          // agar logged out, clear auth so fresh QR generated
          if (code === DisconnectReason.loggedOut) {
            console.log('Detected loggedOut — clearing auth dir.');
            try { fs.rmSync(authDir, { recursive: true, force: true }); } catch(e){}
            try { fs.unlinkSync(path.join(__dirname, '..', 'public', 'latest_qr.txt')); } catch(e){}
            try { fs.unlinkSync(path.join(__dirname, '..', 'public', 'latest_qr.png')); } catch(e){}
            _backoff = 2000;
          }

          // schedule reconnect with exponential backoff (cap 60s)
          const delay = Math.min(_backoff, 60_000);
          console.log(`Reconnecting WhatsApp in ${delay} ms`);
          if (_reconnectTimer) clearTimeout(_reconnectTimer);
          _reconnectTimer = setTimeout(() => {
            _reconnectTimer = null;
            _sock = null;
            startWhatsApp(onMessage).catch(err => console.error('reconnect failed', err));
          }, delay);
          _backoff = Math.min(Math.floor(_backoff * 1.8), 60_000);
        }
      } catch (err) { console.error('connection.update handler error', err); }
    });

    // messages handler
    sock.ev.on('messages.upsert', async (m) => {
      try {
        const msg = m.messages?.[0];
        if (!msg) return;
        if (msg.key?.fromMe) return;
        const from = msg.key.remoteJid;
        const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
        try { await onMessage({ from, text, raw: msg, sock }); } catch(e){ console.error('onMessage error', e); }
      } catch (e) { console.error('messages.upsert error', e); }
    });

    return sock;
  } catch (err) {
    console.error('startWhatsApp error', err);
    const delay = Math.min(_backoff, 60_000);
    setTimeout(() => {
      _backoff = Math.min(Math.floor(_backoff * 1.8), 60_000);
      startWhatsApp(onMessage).catch(e => console.error('retry startWhatsApp error', e));
    }, delay);
    throw err;
  }
}

module.exports = { startWhatsApp };
