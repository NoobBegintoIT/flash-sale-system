const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const { redis } = require('../config/redis');

function buildLimiter({
  windowMs,
  max,
  keyPrefix,
  message
}) {
  return rateLimit({
    windowMs,
    max,

    standardHeaders: true,
    legacyHeaders: false,

    store: new RedisStore({
      sendCommand: (...args) => redis.call(...args),
      prefix: keyPrefix,
    }),

    keyGenerator: (req) => {
      return req.userId || req.ip;
    },

    handler: (req, res) => {
      return res.status(429).json({
        success: false,
        error: 'TOO_MANY_REQUESTS',
        message:
          message ||
          'Bạn đang thao tác quá nhanh, vui lòng thử lại sau.',
      });
    },
  });
}


/*
 * 1. GLOBAL LIMITER
 *
 * Áp dụng cho toàn bộ API.
 * Dùng Redis nên nhiều instance vẫn dùng chung counter.
 */
const globalLimiter = buildLimiter({
  windowMs: 60 * 1000,
  max: 300,
  keyPrefix: 'rl:global:',
  message:
    'Bạn gửi quá nhiều request. Vui lòng thử lại sau.',
});


/*
 * 2. LOGIN LIMITER
 *
 * Chống brute-force password.
 */
const loginLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyPrefix: 'rl:login:',
  message:
    'Bạn đăng nhập quá nhiều lần. Vui lòng thử lại sau 15 phút.',
});


/*
 * 3. REGISTER LIMITER
 *
 * Hạn chế spam tạo tài khoản.
 */
const registerLimiter = buildLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyPrefix: 'rl:register:',
  message:
    'Bạn tạo tài khoản quá nhiều lần. Vui lòng thử lại sau.',
});


/*
 * 4. PURCHASE LIMITER
 *
 * Chống spam click mua hàng.
 *
 * 10 request / 10 giây / user.
 *
 * Không nên đặt quá thấp vì còn dùng cho
 * kiểm thử flash-sale/concurrency.
 */
const purchaseLimiter = buildLimiter({
  windowMs: 10 * 1000,
  max: 10,
  keyPrefix: 'rl:purchase:',
  message:
    'Bạn thao tác mua quá nhanh. Vui lòng thử lại sau vài giây.',
});


module.exports = {
  globalLimiter,
  loginLimiter,
  registerLimiter,
  purchaseLimiter,
};