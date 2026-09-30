const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const { redis } = require('../config/redis');

// Rate limit phân tán (dùng chung Redis) -> đúng khi chạy nhiều instance
// Express phía sau load balancer, chứ không phải limit riêng từng instance.
function buildLimiter({ windowMs, max, keyPrefix }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    store: new RedisStore({
      sendCommand: (...args) => redis.call(...args),
      prefix: keyPrefix,
    }),
    keyGenerator: (req) => req.userId || req.ip,
    handler: (req, res) => {
      res.status(429).json({
        success: false,
        error: 'TOO_MANY_REQUESTS',
        message: 'Bạn đang thao tác quá nhanh, vui lòng thử lại sau vài giây.',
      });
    },
  });
}

// Giới hạn chung cho toàn bộ API (chống DDoS/bot cào)
const globalLimiter = buildLimiter({
  windowMs: 60 * 1000,
  max: 300,
  keyPrefix: 'rl:global:',
});

// Giới hạn RIÊNG cho hành động "mua" - chặn 1 user spam click nút mua
// hàng chục lần/giây (rất hay gặp trong flash sale thật).
const purchaseLimiter = buildLimiter({
  windowMs: 10 * 1000,
  max: 5,
  keyPrefix: 'rl:purchase:',
});

module.exports = { globalLimiter, purchaseLimiter };
