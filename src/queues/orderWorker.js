const { Worker } = require('bullmq');

const { bullConnection } = require('../config/redis');
const { pool } = require('../config/db');
const { rollbackStock } = require('../services/stockService');


/**
 * Worker xử lý order sau khi Redis đã reserve stock.
 *
 * Luồng:
 *
 * Redis reserve
 *      ↓
 * BullMQ
 *      ↓
 * Worker
 *      ↓
 * PostgreSQL transaction
 *
 * Quan trọng:
 * - Retry KHÔNG rollback Redis.
 * - Chỉ rollback khi job thất bại hoàn toàn.
 * - PostgreSQL UNIQUE (sale_id, product_id, user_id)
 *   chống duplicate order.
 */
function startOrderWorker({ concurrency = 10 } = {}) {
  const worker = new Worker(
    'flash-sale-orders',

    async (job) => {
      const {
        orderId,
        saleId,
        productId,
        userId,
        quantity,
        unitPrice,
      } = job.data;

      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        /*
         * PostgreSQL là lớp bảo vệ thứ hai.
         *
         * Nếu cùng một user đã có order cho sản phẩm
         * trong flash sale này thì INSERT sẽ không tạo
         * thêm order.
         */
        const insertRes = await client.query(
          `
          INSERT INTO orders (
            id,
            sale_id,
            product_id,
            user_id,
            quantity,
            unit_price,
            status
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            'confirmed'
          )
          ON CONFLICT (sale_id, product_id, user_id)
          DO NOTHING
          RETURNING id
          `,
          [
            orderId,
            saleId,
            productId,
            userId,
            quantity,
            unitPrice,
          ]
        );

        /*
         * Duplicate order.
         *
         * Không rollback Redis ở đây nếu reservation
         * hiện tại không được xác định chắc chắn là
         * reservation dư.
         *
         * Với thiết kế limit_per_user hiện tại,
         * duplicate request nên được xử lý ở Redis
         * trước khi vào queue.
         */
        if (insertRes.rowCount === 0) {
          await client.query('ROLLBACK');

          return {
            status: 'duplicate',
          };
        }

        /*
         * Đồng bộ stock nguồn trong PostgreSQL.
         *
         * Redis mới là nơi xử lý concurrency nóng.
         * PostgreSQL stock dùng để đối soát / báo cáo.
         */
        await client.query(
          `
          UPDATE flash_sale_items
          SET
            stock = GREATEST(stock - $1, 0),
            version = version + 1
          WHERE sale_id = $2
            AND product_id = $3
          `,
          [
            quantity,
            saleId,
            productId,
          ]
        );

        await client.query('COMMIT');

        return {
          status: 'confirmed',
        };
      } catch (err) {
        /*
         * Rollback transaction PostgreSQL.
         *
         * KHÔNG rollback Redis ở đây.
         *
         * BullMQ có thể retry job.
         */
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          console.error(
            '[order-worker] PostgreSQL rollback failed:',
            rollbackError.message
          );
        }

        throw err;
      } finally {
        client.release();
      }
    },

    {
      connection: bullConnection,
      concurrency,
    }
  );


  /*
   * Event failed được gọi sau mỗi attempt.
   *
   * Chỉ rollback Redis khi BullMQ đã hết retry.
   */
  worker.on('failed', async (job, err) => {
    if (!job) {
      return;
    }

    console.error(
      `[order-worker] job ${job.id} thất bại:`,
      err.message
    );

    const maxAttempts = job.opts.attempts || 1;

    /*
     * Vẫn còn retry:
     *
     * KHÔNG rollback Redis.
     */
    if (job.attemptsMade < maxAttempts) {
      console.log(
        `[order-worker] job ${job.id} sẽ retry ` +
        `(${job.attemptsMade}/${maxAttempts})`
      );

      return;
    }

    /*
     * Đã hết retry.
     *
     * Lúc này reservation thực sự thất bại.
     */
    const {
      orderId,
      saleId,
      productId,
      userId,
      quantity,
      unitPrice,
    } = job.data || {};

    if (!orderId) {
      return;
    }

    /*
     * Ghi failed order trước.
     *
     * Nếu order chưa tồn tại thì INSERT.
     * Nếu đã tồn tại thì UPDATE.
     */
    try {
      await pool.query(
        `
        INSERT INTO orders (
          id,
          sale_id,
          product_id,
          user_id,
          quantity,
          unit_price,
          status,
          failure_reason
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          'failed',
          $7
        )
        ON CONFLICT (id)
        DO UPDATE SET
          status = 'failed',
          failure_reason = EXCLUDED.failure_reason,
          updated_at = now()
        `,
        [
          orderId,
          saleId,
          productId,
          userId,
          quantity,
          unitPrice,
          String(err.message).slice(0, 250),
        ]
      );
    } catch (dbError) {
      /*
       * Không được nuốt lỗi silently.
       *
       * Reservation Redis vẫn cần được xử lý,
       * nhưng việc ghi failed order thất bại
       * cần được log rõ ràng để đối soát.
       */
      console.error(
        '[order-worker] cannot record failed order:',
        dbError.message
      );
    }

    /*
     * Chỉ rollback Redis SAU KHI đã hết retry.
     */
    try {
      await rollbackStock(
        saleId,
        productId,
        userId,
        quantity
      );

      console.log(
        `[order-worker] Redis stock rollback thành công ` +
        `cho order ${orderId}`
      );
    } catch (rollbackError) {
      /*
       * Đây là tình huống rất quan trọng:
       *
       * DB đã failed nhưng Redis rollback thất bại.
       *
       * Cần log để hệ thống monitoring / admin
       * có thể đối soát và xử lý.
       */
      console.error(
        `[order-worker] Redis rollback thất bại ` +
        `cho order ${orderId}:`,
        rollbackError.message
      );
    }
  });


  worker.on('error', (err) => {
    console.error(
      '[order-worker] Worker error:',
      err.message
    );
  });


  return worker;
}


module.exports = {
  startOrderWorker,
};