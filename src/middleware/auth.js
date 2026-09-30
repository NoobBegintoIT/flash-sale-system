/**
 * Demo auth: lấy userId từ header "x-user-id".
 * Production: thay bằng verify JWT thật (jsonwebtoken) và gán req.userId
 * từ payload đã xác thực - tuyệt đối không tin userId do client tự khai báo.
 */
function requireAuth(req, res, next) {
  const userId = req.header('x-user-id');
  if (!userId) {
    return res.status(401).json({ success: false, error: 'UNAUTHENTICATED' });
  }
  req.userId = userId;
  next();
}

module.exports = { requireAuth };
