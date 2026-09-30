const fs = require('fs');
const path = require('path');
const { redis } = require('../config/redis');
const { pool } = require('../config/db');

const DECR_SCRIPT = fs.readFileSync(
  path.join(__dirname, '../scripts/decrementStock.lua'),
  'utf8'
);

// Đăng ký lệnh Lua thành 1 "command" riêng cho ioredis -> gọi như redis.decrementStock(...)
redis.defineCommand('decrementStock', {
  numberOfKeys: 2,
  lua: DECR_SCRIPT,
});

const stockKey = (saleId, productId) => `fs:${saleId}:stock:${productId}`;
const buyersKey = (saleId, productId) => `fs:${saleId}:buyers:${productId}`;
const metaKey = (saleId, productId) => `fs:${saleId}:meta:${productId}`;

const STOCK_TTL = Number(process.env.FLASH_SALE_STOCK_TTL_SECONDS || 7200);

/**
 * Nạp (warmup) dữ liệu flash sale từ Postgres (nguồn sự thật) vào Redis
 * trước khi sale mở bán. Đây là bước bắt buộc - Redis không tự sinh dữ liệu.
 * Gọi bằng cron/job admin vài phút trước giờ G, hoặc lúc tạo flash sale.
 */
async function warmupFlashSale(saleId) {
  const { rows } = await pool.query(
    `SELECT fsi.product_id, fsi.stock, fsi.sale_price, fsi.limit_per_user, p.name
     FROM flash_sale_items fsi
     JOIN products p ON p.id = fsi.product_id
     WHERE fsi.sale_id = $1`,
    [saleId]
  );

  const pipeline = redis.pipeline();
  for (const item of rows) {
    pipeline.set(stockKey(saleId, item.product_id), item.stock, 'EX', STOCK_TTL);
    pipeline.del(buyersKey(saleId, item.product_id));
    pipeline.hset(metaKey(saleId, item.product_id), {
      name: item.name,
      salePrice: item.sale_price,
      limitPerUser: item.limit_per_user,
      initialStock: item.stock,
    });
    pipeline.sadd(`fs:${saleId}:items`, item.product_id);
    pipeline.expire(metaKey(saleId, item.product_id), STOCK_TTL);
  }
  const sale = (await pool.query('SELECT name, start_time, end_time FROM flash_sales WHERE id = $1', [saleId])).rows[0];
  pipeline.hset(`fs:${saleId}:info`, { name: sale.name, startTime: +new Date(sale.start_time), endTime: +new Date(sale.end_time) });
  pipeline.expire(`fs:${saleId}:items`, STOCK_TTL);
  pipeline.expire(`fs:${saleId}:info`, STOCK_TTL);
  await pipeline.exec();
  return rows.length;
}

/**
 * Trừ kho NGUYÊN TỬ trong Redis. Đây là điểm nghẽn concurrency duy nhất
 * và nó được giải quyết ở tầng Redis (single-threaded) thay vì ở DB,
 * nên chịu tải được hàng chục nghìn request/giây mà không cần lock DB.
 */
async function tryReserveStock(saleId, productId, userId, quantity) {
  const meta = await redis.hgetall(metaKey(saleId, productId));
  const limitPerUser = Number(meta.limitPerUser || process.env.FLASH_SALE_MAX_QTY_PER_USER || 1);

  const result = await redis.decrementStock(
    stockKey(saleId, productId),
    buyersKey(saleId, productId),
    userId,
    quantity,
    limitPerUser
  );

  if (result === -1) return { ok: false, reason: 'SALE_NOT_WARMED_UP_OR_EXPIRED' };
  if (result === -2) return { ok: false, reason: 'USER_LIMIT_EXCEEDED' };
  if (result === -3) return { ok: false, reason: 'OUT_OF_STOCK' };

  return {
    ok: true,
    remainingStock: result,
    unitPrice: Number(meta.salePrice),
    productName: meta.name,
  };
}

/**
 * Hoàn kho khi order thất bại ở bước xử lý DB (worker) - compensating action
 * để giữ Redis luôn khớp với thực tế đã bán.
 */
async function rollbackStock(saleId, productId, userId, quantity) {
  const pipeline = redis.pipeline();
  pipeline.incrby(stockKey(saleId, productId), quantity);
  pipeline.hincrby(buyersKey(saleId, productId), userId, -quantity);
  await pipeline.exec();
}

async function getRemainingStock(saleId, productId) {
  const val = await redis.get(stockKey(saleId, productId));
  return val === null ? null : Number(val);
}

module.exports = {
  warmupFlashSale,
  tryReserveStock,
  rollbackStock,
  getRemainingStock,
};
