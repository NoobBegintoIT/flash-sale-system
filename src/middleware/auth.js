const jwt = require('jsonwebtoken');

/**
 * JWT Authentication Middleware
 *
 * Client phải gửi:
 *
 * Authorization: Bearer <JWT>
 *
 * Sau khi verify thành công:
 *
 * req.userId = user.id
 * req.user = {
 *   id,
 *   username,
 *   role
 * }
 */
function requireAuth(req, res, next) {
  try {
    const authorization = req.header('Authorization');

    if (!authorization) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHENTICATED',
        message: 'Thiếu Authorization header.'
      });
    }

    // Authorization phải có dạng:
    // Bearer eyJhbGciOiJIUzI1Ni...
    const [scheme, token] = authorization.split(' ');

    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({
        success: false,
        error: 'INVALID_AUTHORIZATION',
        message: 'Authorization phải có dạng: Bearer <token>.'
      });
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    /*
     * JWT của chúng ta được tạo ở authController:
     *
     * {
     *   sub: String(user.id),
     *   username: user.username,
     *   role: user.role
     * }
     */

    req.userId = decoded.sub;

    req.user = {
      id: Number(decoded.sub),
      username: decoded.username,
      role: decoded.role
    };

    req.role = decoded.role;

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'TOKEN_EXPIRED',
        message: 'Token đã hết hạn. Vui lòng đăng nhập lại.'
      });
    }

    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: 'INVALID_TOKEN',
        message: 'Token không hợp lệ.'
      });
    }

    next(err);
  }
}


/**
 * Authorization Middleware
 *
 * Ví dụ:
 *
 * router.get(
 *   '/admin/dashboard',
 *   requireAuth,
 *   requireRole('admin'),
 *   controller.dashboard
 * );
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHENTICATED',
        message: 'Bạn chưa đăng nhập.'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'Bạn không có quyền thực hiện thao tác này.'
      });
    }

    next();
  };
}


module.exports = {
  requireAuth,
  requireRole
};