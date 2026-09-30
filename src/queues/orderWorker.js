const { Worker } = require('bullmq');
const { bullConnection } = require('../config/redis');
const { pool } = require('../config/db');
const { rollbackStock } = require('../services/stockService');

/**
 * Worker này là nơi DUY NHẤT ghi bảng `orders`. Vì đã qua Redis lọc bớt
 * (chỉ những request thắng cuộc mới tới đây), lượng job vào DB giảm đúng
 * bằng số lượng hàng thực tế còn trong kho -> DB không bị dội tải.
 *
 * concurrency: số job xử lý song song trong 1 worker process. Có thể chạy
 * nhiều worker process/máy khác nhau để scale ngang.
 */
function startOrderWorker({ concurrency = 10 } = {}) {
  const worker = new Worker(
    'flash-sale-orders',
    async (job) => {
      const { orderId, saleId, productId, userId, quantity, unitPrice } = job.data;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // UNIQUE (sale_id, product_id, user_id) ở schema là lớp chống trùng thứ 2
        // (phòng trường hợp hiếm: Redis mất dữ liệu / TTL hết giữa chừng)
        const insertRes = await client.query(
          `INSERT INTO orders (id, sale_id, product_id, user_id, quantity, unit_price, status)
           VALUES ($1, $2, $3, $4, $5, $6, 'confirmed')
           ON CONFLICT (sale_id, product_id, user_id) DO NOTHING
           RETURNING id`,
          [orderId, saleId, productId, userId, quantity, unitPrice]
        );

        if (insertRes.rowCount === 0) {
          // Đã có đơn cho user này rồi (trùng) -> hoàn lại kho đã trừ ở Redis
          await client.query('ROLLBACK');
          await rollbackStock(saleId, productId, userId, quantity);
          return { status: 'duplicate' };
        }

        // Đồng bộ kho gốc trong Postgres (để báo cáo / đối soát cuối sale)
        await client.query(
          `UPDATE flash_sale_items
           SET stock = GREATEST(stock - $1, 0), version = version + 1
           WHERE sale_id = $2 AND product_id = $3`,
          [quantity, saleId, productId]
        );

        await client.query('COMMIT');
        return { status: 'confirmed' };
      } catch (err) {
        await client.query('ROLLBACK');
        // Ghi DB lỗi thật sự (không phải do trùng) -> phải hoàn kho Redis,
        // nếu không hàng sẽ bị "kẹt" mất oan dù chưa bán được cho ai.
        await rollbackStock(saleId, productId, userId, quantity);
        await pool.query(
          `UPDATE orders SET status = 'failed', failure_reason = $2 WHERE id = $1`,
          [orderId, String(err.message).slice(0, 250)]
        ).catch(() => {});
        throw err; // để BullMQ retry theo backoff đã cấu hình
      } finally {
        client.release();
      }
    },
    { connection: bullConnection, concurrency }
  );

  worker.on('failed', async (job, err) => {
    console.error(`[order-worker] job ${job?.id} thất bại:`, err.message);
    // Chỉ ghi failed sau khi BullMQ đã dùng hết số lần retry.
    // Trong các lần retry trước đó không tạo row để lần chạy sau vẫn có thể INSERT confirmed.
    if (!job || job.attemptsMade < (job.opts.attempts || 1)) return;
    const { orderId, saleId, productId, userId, quantity, unitPrice } = job.data || {};
    if (!orderId) return;
    await pool.query(
      `INSERT INTO orders (id, sale_id, product_id, user_id, quantity, unit_price, status, failure_reason)
       VALUES ($1,$2,$3,$4,$5,$6,'failed',$7)
       ON CONFLICT (id) DO UPDATE SET status='failed', failure_reason=EXCLUDED.failure_reason, updated_at=now()`,
      [orderId, saleId, productId, userId, quantity, unitPrice, String(err.message).slice(0,250)]
    ).catch((e) => console.error('[order-worker] cannot record failed order:', e.message));
  });

  return worker;
}

module.exports = { startOrderWorker };
