require('dotenv').config();
const app = require('./app');
const { startOrderWorker } = require('./queues/orderWorker');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`[server] Flash sale API đang chạy tại http://localhost:${PORT}`);
});

// Chạy worker CÙNG process cho demo đơn giản. Ở production nên tách
// `node src/queues/runWorker.js` thành 1 process/deployment riêng để
// scale API và scale worker độc lập nhau.
startOrderWorker({ concurrency: 10 });
console.log('[server] Order worker đã khởi động (concurrency=10)');
