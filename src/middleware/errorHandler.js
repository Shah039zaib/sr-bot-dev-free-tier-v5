function errorHandler(err, req, res, next) {
  console.error('ERR', err);
  res.status(500).json({ error: 'Internal server error' });
}
module.exports = errorHandler;
