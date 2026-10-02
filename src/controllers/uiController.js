const { v4: uuidv4 } = require('uuid');
const { redis } = require('../config/redis');
const { pool } = require('../config/db');
const stock = require('../services/stockService');
const { orderQueue, enqueueOrder } = require('../queues/orderQueue');

const wrap = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// Danh sách flash sale (từ DB, gọi ít)
exports.listSales = wrap(async (req, res) => {
  const { rows } = await pool.query('SELECT id, name, status, start_time, end_time FROM flash_sales ORDER BY id DESC');
  res.json({ success: true, sales: rows });
});

// Tổng quan 1 sale: đọc 100% từ Redis nên client có thể poll mỗi 2s
exports.overview = wrap(async (req, res) => {
  const saleId = Number(req.params.saleId);

  if (!Number.isInteger(saleId) || saleId <= 0) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_SALE_ID',
    });
  }

  // Đồng bộ lifecycle trước khi trả dữ liệu
  await pool.query(
    `
    UPDATE flash_sales
    SET status = CASE
      WHEN now() < start_time THEN 'scheduled'
      WHEN now() >= start_time AND now() < end_time THEN 'active'
      WHEN now() >= end_time THEN 'ended'
      ELSE status
    END
    WHERE id = $1
    `,
    [saleId]
  );

  const { rows: sales } = await pool.query(
    `
    SELECT
      id,
      name,
      status,
      start_time,
      end_time
    FROM flash_sales
    WHERE id = $1
    `,
    [saleId]
  );

  if (sales.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'FLASH_SALE_NOT_FOUND',
    });
  }

  const sale = sales[0];

  const { rows: items } = await pool.query(
    `
    SELECT
      fsi.product_id,
      p.name,
      fsi.sale_price,
      fsi.limit_per_user,
      fsi.stock AS initial_stock
    FROM flash_sale_items fsi
    JOIN products p
      ON p.id = fsi.product_id
    WHERE fsi.sale_id = $1
    ORDER BY fsi.product_id
    `,
    [saleId]
  );

  const enrichedItems = await Promise.all(
    items.map(async (item) => {
      const remaining =
        await stock.getRemainingStock(
          saleId,
          item.product_id
        );

      return {
        productId: item.product_id,
        name: item.name,
        salePrice: Number(item.sale_price),
        limitPerUser: item.limit_per_user,
        initialStock: item.initial_stock,
        remaining:
          remaining === null
            ? 0
            : Number(remaining),
      };
    })
  );

  res.json({
    success: true,
    sale: {
      id: sale.id,
      name: sale.name,
      status: sale.status,
      startTime: new Date(
        sale.start_time
      ).getTime(),
      endTime: new Date(
        sale.end_time
      ).getTime(),
    },
    serverTime: Date.now(),
    items: enrichedItems,
  });
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
  res.json({ success: true, itemsWarmedUp: await stock.warmupFlashSale( saleId,{ force: true }) });
});
