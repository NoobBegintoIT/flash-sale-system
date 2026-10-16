const { pool } = require('../config/db');

const INTERVAL_MS = Number(
  process.env.FLASH_SALE_LIFECYCLE_INTERVAL_MS || 5000
);

let timer = null;
let syncInProgress = false;

async function syncFlashSaleStatuses() {
  // Tránh để các truy vấn lifecycle chạy chồng lên nhau.
  if (syncInProgress) {
    return;
  }

  syncInProgress = true;

  try {
    const { rowCount } = await pool.query(`
      UPDATE flash_sales
      SET status = CASE
        WHEN now() < start_time THEN 'scheduled'
        WHEN now() < end_time THEN 'active'
        ELSE 'ended'
      END
      WHERE status IN ('scheduled', 'active', 'ended')
        AND status IS DISTINCT FROM CASE
          WHEN now() < start_time THEN 'scheduled'
          WHEN now() < end_time THEN 'active'
          ELSE 'ended'
        END
    `);

    if (rowCount > 0) {
      console.log(
        `[Lifecycle] Đã đồng bộ trạng thái ${rowCount} Flash Sale.`
      );
    }
  } catch (err) {
    console.error(
      '[Lifecycle] Sync failed:',
      err.message
    );
  } finally {
    syncInProgress = false;
  }
}

function startFlashSaleLifecycle() {
  if (timer) {
    return;
  }

  console.log(
    `[Lifecycle] Worker started; interval=${INTERVAL_MS}ms`
  );

  // Đồng bộ ngay khi khởi động.
  void syncFlashSaleStatuses();

  timer = setInterval(() => {
    void syncFlashSaleStatuses();
  }, INTERVAL_MS);
}

function stopFlashSaleLifecycle() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = {
  syncFlashSaleStatuses,
  startFlashSaleLifecycle,
  stopFlashSaleLifecycle,
};
