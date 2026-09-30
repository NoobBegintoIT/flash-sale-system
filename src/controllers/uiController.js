const { v4: uuidv4 } = require('uuid');
const { redis } = require('../config/redis');
const { pool } = require('../config/db');
const stock = require('../services/stockService');
const { orderQueue, enqueueOrder } = require('../queues/orderQueue');

const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

// Danh sách flash sale (từ DB, gọi ít)
exports.listSales = wrap(async (req, res) => {
  const { rows } = await pool.query('SELECT id, name, status, start_time, end_time FROM flash_sales ORDER BY id DESC');
  res.json({ success: true, sales: rows });
});

// Tổng quan 1 sale: đọc 100% từ Redis nên client có thể poll mỗi 2s
exports.overview = wrap(async (req, res) => {
  const { saleId } = req.params;
  const sale = await redis.hgetall(`fs:${saleId}:info`);
  if (!sale.name) return res.status(404).json({ success: false, error: 'NOT_WARMED_UP' });
  const ids = await redis.smembers(`fs:${saleId}:items`);
  const items = await Promise.all(ids.map(async (pid) => {
    const [remaining, m] = await Promise.all([stock.getRemainingStock(saleId, pid), redis.hgetall(`fs:${saleId}:meta:${pid}`)]);
    return { productId: +pid, name: m.name, salePrice: +m.salePrice, limitPerUser: +m.limitPerUser, initialStock: +m.initialStock, remaining: remaining ?? 0 };
  }));
  items.sort((a, b) => a.productId - b.productId);
  res.json({ success: true, sale, serverTime: Date.now(), items });
});

// Thống kê admin: so kho Redis với DB + số đơn
exports.stats = wrap(async (req, res) => {
  const { saleId } = req.params;
  const { rows } = await pool.query(
    `SELECT fsi.product_id, p.name, fsi.stock AS db_stock,
            COUNT(o.id) FILTER (WHERE o.status='confirmed') AS confirmed,
            COUNT(o.id) FILTER (WHERE o.status='failed') AS failed
     FROM flash_sale_items fsi JOIN products p ON p.id = fsi.product_id
     LEFT JOIN orders o ON o.sale_id = fsi.sale_id AND o.product_id = fsi.product_id
     WHERE fsi.sale_id = $1 GROUP BY fsi.product_id, p.name, fsi.stock ORDER BY fsi.product_id`, [saleId]);
  const items = await Promise.all(rows.map(async (r) => ({
    ...r, confirmed: +r.confirmed, failed: +r.failed, redis_stock: await stock.getRemainingStock(saleId, r.product_id),
  })));
  const queue = await orderQueue.getJobCounts('waiting', 'active', 'failed');
  res.json({ success: true, items, queue });
});

// Giả lập N user mua đồng thời (gọi thẳng service, không bị rate limit HTTP)
exports.simulate = wrap(async (req, res) => {
  const { saleId, productId } = req.body;
  const users = Math.min(Number(req.body.users) || 100, 20000);
  const run = Date.now().toString(36), t0 = Date.now();
  const result = { success: 0, OUT_OF_STOCK: 0, USER_LIMIT_EXCEEDED: 0, OTHER: 0 };
  for (let i = 0; i < users; i += 500) {
    await Promise.all(Array.from({ length: Math.min(500, users - i) }, async (_, k) => {
      const userId = `sim-${run}-${i + k}`;
      const s = await stock.tryReserveStock(saleId, productId, userId, 1);
      if (!s.ok) { result[s.reason in result ? s.reason : 'OTHER']++; return; }
      await enqueueOrder({ orderId: uuidv4(), saleId: +saleId, productId: +productId, userId, quantity: 1, unitPrice: s.unitPrice });
      result.success++;
    }));
  }
  const ms = Date.now() - t0;
  res.json({ success: true, users, ms, rps: Math.round(users / ((ms || 1) / 1000)), result });
});

// Reset demo: hoàn kho DB, xóa đơn, dọn queue, nạp lại Redis
exports.reset = wrap(async (req, res) => {
  const { saleId } = req.params;
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query(`UPDATE flash_sale_items f SET stock = f.stock + COALESCE((SELECT SUM(quantity) FROM orders o
      WHERE o.sale_id = f.sale_id AND o.product_id = f.product_id AND o.status = 'confirmed'), 0) WHERE f.sale_id = $1`, [saleId]);
    await c.query('DELETE FROM orders WHERE sale_id = $1', [saleId]);
    await c.query('COMMIT');
  } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
  await orderQueue.drain();
  res.json({ success: true, itemsWarmedUp: await stock.warmupFlashSale(saleId) });
});
