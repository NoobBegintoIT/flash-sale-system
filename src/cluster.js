const cluster = require('cluster');
const os = require('os');

// Tầng API chỉ nên xử lý reserve-stock (nhẹ, không I/O nặng) rồi đẩy queue,
// nên cluster theo số CPU giúp tận dụng tối đa trước khi cần scale ra
// nhiều máy/container phía sau load balancer (Nginx/ALB).
if (cluster.isPrimary) {
  const numCPUs = os.cpus().length;
  console.log(`[cluster] Primary ${process.pid} đang fork ${numCPUs} worker(s)`);

  for (let i = 0; i < numCPUs; i++) cluster.fork();

  cluster.on('exit', (worker, code, signal) => {
    console.warn(`[cluster] worker ${worker.process.pid} thoát (${signal || code}), fork lại`);
    cluster.fork();
  });
} else {
  require('./server');
}
