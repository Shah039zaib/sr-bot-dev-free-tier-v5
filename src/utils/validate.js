function isPhone(jid) {
  if (!jid) return false;
  const p = jid.toString().split('@')[0];
  return /^[0-9]{10,15}$/.test(p);
}
module.exports = { isPhone };
