let sockRef = null;
function setSocket(s) { sockRef = s; }
async function notifyUser(to, text) {
  if (!sockRef) return;
  try {
    await sockRef.sendMessage(to + '@s.whatsapp.net', { text });
  } catch (e) {
    console.error('notifyUser failed', e);
  }
}
module.exports = { setSocket, notifyUser };
