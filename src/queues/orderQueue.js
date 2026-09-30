const { Queue } = require('bullmq');
const { bullConnection } = require('../config/redis');

// Sau khi Redis đã "giữ chỗ" (reserve) kho thành công, ta KHÔNG ghi DB ngay
// trong request đó (ghi DB tốn ~5-20ms, x100k request cùng lúc sẽ sập DB).
// Thay vào đó đẩy job vào queue, trả response ngay cho user là "đang xử lý",
// rồi 1 nhóm worker riêng (có thể chạy ở process/máy khác) từ từ ghi vào DB.
const orderQueue = new Queue('flash-sale-orders', {
  connection: bullConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 500 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  },
});

async function enqueueOrder({ orderId, saleId, productId, userId, quantity, unitPrice }) {
  await orderQueue.add(
    'create-order',
    { orderId, saleId, productId, userId, quantity, unitPrice },
    { jobId: orderId } // jobId trùng -> BullMQ tự chống enqueue trùng lặp
  );
}

module.exports = { orderQueue, enqueueOrder };
