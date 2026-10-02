const { pool } = require('../config/db');

let timer = null;

async function syncFlashSaleStatuses() {
  try {
    const { rowCount } = await pool.query(
      `
      UPDATE flash_sales
      SET status = CASE
        WHEN now() < start_time THEN 'scheduled'
        WHEN now() >= start_time
             AND now() < end_time THEN 'active'
        WHEN now() >= end_time THEN 'ended'
        ELSE status
      END
      WHERE
        (status = 'scheduled'
          AND now() >= start_time)
        OR
        (status = 'active'
          AND now() >= end_time)
      `
    );

    if (rowCount > 0) {
      console.log(
        `[Lifecycle] Đã cập nhật ${rowCount} Flash Sale.`
      );
    }
  } catch (err) {
    console.error(
      '[Lifecycle] Sync failed:',
      err.message
    );
  }
}

function startFlashSaleLifecycle() {
  if (timer) {
    return;
  }

  // chạy ngay một lần
  syncFlashSaleStatuses();

  // sau đó mỗi 1 giây
  timer = setInterval(
    syncFlashSaleStatuses,
    1000
  );

  console.log(
    '[Lifecycle] Flash Sale lifecycle worker started.'
  );
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