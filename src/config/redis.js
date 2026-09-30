const Redis = require('ioredis');

const connectionOptions = {
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT || 6379),
  password: process.env.REDIS_PASSWORD || undefined,
  // BullMQ yêu cầu maxRetriesPerRequest = null trên connection dùng cho queue/worker
  maxRetriesPerRequest: null,
};

// Client dùng chung cho: lệnh thường + eval Lua script (atomic stock)
const redis = new Redis(connectionOptions);

// Client riêng cho BullMQ (nên tách connection để không tranh chấp blocking commands)
const bullConnection = { ...connectionOptions };

redis.on('connect', () => console.log('[redis] connected'));
redis.on('error', (err) => console.error('[redis] error', err.message));

module.exports = { redis, bullConnection };
