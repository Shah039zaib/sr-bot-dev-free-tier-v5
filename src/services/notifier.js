// src/services/notifier.js
let _sock = null;
function setSocket(sock) { _sock = sock; }
async function sendAdminNotification(text) {
  if (!_sock) throw new Error('No socket');
  // example: send to a hardcoded admin phone (change as needed)
  try { await _sock.sendMessage('923xxxxxxxx@c.us', { text }); } catch(e){ console.error('notify send failed', e); }
}
module.exports = { setSocket, sendAdminNotification };
