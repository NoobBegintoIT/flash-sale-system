require('dotenv').config();
const { pool } = require('./src/config/db');
const { warmupFlashSale } = require('./src/services/stockService');

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: products } = await client.query(
      `INSERT INTO products (name, price, image_url) VALUES
       ('Tai nghe Bluetooth X1', 990000, ''),
       ('Loa mini Y2', 590000, '')
       RETURNING id`
    );

    const { rows: sales } = await client.query(
      `INSERT INTO flash_sales (name, start_time, end_time, status)
       VALUES ('Flash Sale 12.12', now(), now() + interval '2 hours', 'active')
       RETURNING id`
    );
    const saleId = sales[0].id;

    await client.query(
      `INSERT INTO flash_sale_items (sale_id, product_id, sale_price, stock, limit_per_user) VALUES
       ($1, $2, 499000, 50, 1),
       ($1, $3, 299000, 100, 2)`,
      [saleId, products[0].id, products[1].id]
    );

    await client.query('COMMIT');
    console.log(`Đã tạo flash sale #${saleId} với sản phẩm #${products[0].id}, #${products[1].id}`);

    const n = await warmupFlashSale(saleId);
    console.log(`Đã warmup ${n} sản phẩm vào Redis.`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    process.exit(0);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
