function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  console.error('[error]', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.code || 'INTERNAL_ERROR',
    message: process.env.NODE_ENV === 'production' ? 'Đã có lỗi xảy ra' : err.message,
  });
}

module.exports = { errorHandler };
