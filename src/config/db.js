const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: Number(process.env.PG_PORT || 5432),
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'postgres',
  database: process.env.PG_DATABASE || 'flashsale',
  max: 20,               // pool size - flash sale ghi nhiều, worker xử lý tuần tự nên không cần quá lớn
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => console.error('[pg] unexpected error on idle client', err));

module.exports = { pool };
