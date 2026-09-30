/** Demo admin guard. Set ADMIN_API_KEY in .env before exposing this app beyond localhost. */
function requireAdmin(req, res, next) {
  const expected = process.env.ADMIN_API_KEY || 'demo-admin-key';
  const supplied = req.header('x-admin-key');
  if (!supplied || supplied !== expected) {
    return res.status(401).json({ success: false, error: 'ADMIN_UNAUTHORIZED', message: 'Thiếu hoặc sai khóa quản trị.' });
  }
  req.isAdmin = true;
  next();
}
module.exports = { requireAdmin };
