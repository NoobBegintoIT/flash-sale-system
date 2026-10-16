require('dotenv').config();
const { startOrderWorker } = require('./orderWorker');

// Chạy độc lập: `node src/queues/runWorker.js`
// Có thể mở nhiều process này (PM2 / Kubernetes deployment riêng) để
// tăng throughput xử lý đơn hàng mà không ảnh hưởng tới API layer.
startOrderWorker({ concurrency: 20 });
console.log('[worker] Order worker process đã khởi động (concurrency=20)');
