function errorHandler(err, req, res, next) {
  console.error('[ERROR]', {
    method: req.method,
    url: req.originalUrl,
    message: err.message,
    code: err.code,
    stack:
      process.env.NODE_ENV === 'development'
        ? err.stack
        : undefined
  });

  // ----------------------------------------------------------
  // Đã gửi response rồi
  // ----------------------------------------------------------

  if (res.headersSent) {
    return next(err);
  }

  // ----------------------------------------------------------
  // PostgreSQL errors
  // ----------------------------------------------------------

  if (err.code === '23505') {
    return res.status(409).json({
      success: false,
      error: 'DUPLICATE_RESOURCE',
      message: 'Dữ liệu đã tồn tại.'
    });
  }

  if (err.code === '23503') {
    return res.status(409).json({
      success: false,
      error: 'RESOURCE_IN_USE',
      message: 'Dữ liệu đang được sử dụng bởi tài nguyên khác.'
    });
  }

  if (err.code === '23502') {
    return res.status(400).json({
      success: false,
      error: 'MISSING_REQUIRED_FIELD',
      message: 'Thiếu trường dữ liệu bắt buộc.'
    });
  }

  if (err.code === '22P02') {
    return res.status(400).json({
      success: false,
      error: 'INVALID_DATABASE_VALUE',
      message: 'Giá trị gửi lên không hợp lệ.'
    });
  }

  // ----------------------------------------------------------
  // JWT
  // ----------------------------------------------------------

  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      error: 'INVALID_TOKEN',
      message: 'Token không hợp lệ.'
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      error: 'TOKEN_EXPIRED',
      message: 'Token đã hết hạn.'
    });
  }

  // ----------------------------------------------------------
  // Redis / infrastructure
  // ----------------------------------------------------------

  if (
    err.code === 'ECONNREFUSED' ||
    err.code === 'ECONNRESET' ||
    err.code === 'ETIMEDOUT'
  ) {
    return res.status(503).json({
      success: false,
      error: 'SERVICE_UNAVAILABLE',
      message: 'Một dịch vụ backend hiện không khả dụng.'
    });
  }

  // ----------------------------------------------------------
  // Custom status error
  // ----------------------------------------------------------

  if (err.statusCode) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.code || 'REQUEST_ERROR',
      message: err.message || 'Request không hợp lệ.'
    });
  }

  // ----------------------------------------------------------
  // Unknown error
  // ----------------------------------------------------------

  return res.status(500).json({
    success: false,
    error: 'INTERNAL_SERVER_ERROR',
    message:
      process.env.NODE_ENV === 'development'
        ? err.message
        : 'Đã xảy ra lỗi phía máy chủ.'
  });
}

module.exports = {
  errorHandler
};