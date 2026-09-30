const { v4: uuidv4 } = require('uuid');
const { pool } = require('../config/db');
const stockService = require('../services/stockService');
const { enqueueOrder } = require('../queues/orderQueue');

// GET /api/flash-sales/:saleId/products/:productId
// Trả về tồn kho REAL-TIME đọc thẳng từ Redis (không đụng DB) -> chịu tải cao
async function getProductStatus(req, res, next) {
  try {
    const { saleId, productId } = req.params;
    const remaining = await stockService.getRemainingStock(saleId, productId);
    if (remaining === null) {
      return res.status(404).json({
        success: false,
        error: 'NOT_WARMED_UP',
        message: 'Flash sale chưa được nạp kho hoặc đã kết thúc.',
      });
    }
    res.json({ success: true, saleId: Number(saleId), productId: Number(productId), remaining });
  } catch (err) {
    next(err);
  }
}

// POST /api/flash-sales/:saleId/products/:productId/buy
// Đây là API "nóng" nhất hệ thống trong giờ flash sale.
// Luồng: Redis giữ chỗ nguyên tử (nhanh, an toàn) -> đẩy queue -> trả 202 ngay.
// Việc ghi DB thật sự diễn ra sau đó ở orderWorker, KHÔNG chặn request này.
async function buyProduct(req, res, next) {
  try {
    const { saleId, productId } = req.params;
    const userId = req.userId;
    const quantity = Math.max(1, Number(req.body.quantity || 1));

    const reserve = await stockService.tryReserveStock(saleId, productId, userId, quantity);

    if (!reserve.ok) {
      const statusMap = {
        SALE_NOT_WARMED_UP_OR_EXPIRED: 404,
        USER_LIMIT_EXCEEDED: 409,
        OUT_OF_STOCK: 410,
      };
      return res.status(statusMap[reserve.reason] || 400).json({
        success: false,
        error: reserve.reason,
      });
    }

    const orderId = uuidv4();
    await enqueueOrder({
      orderId,
      saleId: Number(saleId),
      productId: Number(productId),
      userId,
      quantity,
      unitPrice: reserve.unitPrice,
    });

    // 202 Accepted: đơn đã được "giữ hàng" thành công, đang xử lý ghi sổ.
    // Client dùng orderId để poll trạng thái qua GET /api/orders/:orderId
    res.status(202).json({
      success: true,
      orderId,
      productName: reserve.productName,
      remainingStock: reserve.remainingStock,
      message: 'Giữ hàng thành công, đơn hàng đang được xử lý.',
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/orders/:orderId
async function getOrderStatus(req, res, next) {
  try {
    const { orderId } = req.params;
    const { rows } = await pool.query(
      `SELECT id, sale_id, product_id, user_id, quantity, unit_price, status, failure_reason, created_at
       FROM orders WHERE id = $1`,
      [orderId]
    );
    if (rows.length === 0) {
      // Có thể job vẫn đang nằm trong queue, chưa kịp ghi DB
      return res.status(202).json({ success: true, status: 'pending' });
    }
    res.json({ success: true, order: rows[0] });
  } catch (err) {
    next(err);
  }
}

// POST /api/flash-sales/:saleId/warmup  (admin)
async function warmup(req, res, next) {
  try {
    const { saleId } = req.params;
    const count = await stockService.warmupFlashSale(saleId);
    res.json({ success: true, itemsWarmedUp: count });
  } catch (err) {
    next(err);
  }
}

module.exports = { getProductStatus, buyProduct, getOrderStatus, warmup };
