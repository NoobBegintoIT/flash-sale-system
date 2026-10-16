const { v4: uuidv4 } = require('uuid');
const { pool } = require('../config/db');
const stockService = require('../services/stockService');
const { enqueueOrder } = require('../queues/orderQueue');


// ============================================================
// Đồng bộ trạng thái Flash Sale theo thời gian
// scheduled -> active -> ended
// ============================================================
async function syncSaleStatus(saleId) {
  const { rows } = await pool.query(
    `
    UPDATE flash_sales
    SET status = CASE
      WHEN now() < start_time THEN 'scheduled'
      WHEN now() >= start_time AND now() < end_time THEN 'active'
      WHEN now() >= end_time THEN 'ended'
      ELSE status
    END
    WHERE id = $1
    RETURNING id, name, status, start_time, end_time
    `,
    [saleId]
  );

  if (rows.length === 0) {
    return null;
  }

  return rows[0];
}


// ============================================================
// GET /api/flash-sales/:saleId/products/:productId
// ============================================================
async function getProductStatus(req, res, next) {
  try {
    const { saleId, productId } = req.params;

    const sale = await syncSaleStatus(saleId);

    if (!sale) {
      return res.status(404).json({
        success: false,
        error: 'FLASH_SALE_NOT_FOUND',
        message: 'Không tìm thấy Flash Sale.',
      });
    }

    // Sale đã kết thúc -> không trả stock Redis cũ
    if (sale.status === 'ended') {
      return res.status(410).json({
        success: false,
        error: 'FLASH_SALE_ENDED',
        message: 'Flash Sale đã kết thúc.',
      });
    }

    const remaining = await stockService.getRemainingStock(
      saleId,
      productId
    );

    if (remaining === null) {
      return res.status(404).json({
        success: false,
        error: 'NOT_WARMED_UP',
        message: 'Flash sale chưa được nạp kho.',
      });
    }

    res.json({
      success: true,
      saleId: Number(saleId),
      productId: Number(productId),
      status: sale.status,
      startTime: new Date(sale.start_time).getTime(),
      endTime: new Date(sale.end_time).getTime(),
      remaining,
    });
  } catch (err) {
    next(err);
  }
}


// ============================================================
// POST /api/flash-sales/:saleId/products/:productId/buy
//
// Lifecycle bắt buộc:
//
// scheduled -> KHÔNG mua
// active    -> ĐƯỢC mua
// ended     -> KHÔNG mua
//
// Sau khi lifecycle hợp lệ:
// Redis Lua -> Queue -> PostgreSQL
// ============================================================
async function buyProduct(req, res, next) {
  try {
    const { saleId, productId } = req.params;
    const userId = req.userId;

    const quantity = Math.max(
      1,
      Number(req.body.quantity || 1)
    );

    if (!Number.isInteger(quantity)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_QUANTITY',
        message: 'Số lượng mua phải là số nguyên.',
      });
    }


    // --------------------------------------------------------
    // 1. Đồng bộ lifecycle
    // --------------------------------------------------------
    const sale = await syncSaleStatus(saleId);

    if (!sale) {
      return res.status(404).json({
        success: false,
        error: 'FLASH_SALE_NOT_FOUND',
        message: 'Không tìm thấy Flash Sale.',
      });
    }


    // --------------------------------------------------------
    // 2. Chưa đến giờ mở bán
    // --------------------------------------------------------
    if (sale.status === 'scheduled') {
      return res.status(409).json({
        success: false,
        error: 'FLASH_SALE_NOT_STARTED',
        message: 'Flash Sale chưa bắt đầu.',
        startTime: new Date(sale.start_time).toISOString(),
      });
    }


    // --------------------------------------------------------
    // 3. Đã kết thúc
    // --------------------------------------------------------
    if (sale.status === 'ended') {
      return res.status(410).json({
        success: false,
        error: 'FLASH_SALE_ENDED',
        message: 'Flash Sale đã kết thúc.',
        endTime: new Date(sale.end_time).toISOString(),
      });
    }


    // --------------------------------------------------------
    // 4. Chỉ active mới được mua
    // --------------------------------------------------------
    if (sale.status !== 'active') {
      return res.status(409).json({
        success: false,
        error: 'FLASH_SALE_NOT_ACTIVE',
        message: 'Flash Sale hiện không mở bán.',
      });
    }


    // --------------------------------------------------------
    // 5. Reserve stock nguyên tử trong Redis
    // --------------------------------------------------------
    const reserve = await stockService.tryReserveStock(
      saleId,
      productId,
      userId,
      quantity
    );

    if (!reserve.ok) {
      const statusMap = {
        SALE_NOT_WARMED_UP_OR_EXPIRED: 404,
        USER_LIMIT_EXCEEDED: 409,
        OUT_OF_STOCK: 410,
      };

      return res.status(
        statusMap[reserve.reason] || 400
      ).json({
        success: false,
        error: reserve.reason,
      });
    }


    // --------------------------------------------------------
    // 6. Tạo order ID
    // --------------------------------------------------------
    const orderId = uuidv4();


    // --------------------------------------------------------
    // 7. Đẩy job vào BullMQ
    // --------------------------------------------------------
    try {
      await enqueueOrder({
        orderId,
        saleId: Number(saleId),
        productId: Number(productId),
        userId,
        quantity,
        unitPrice: reserve.unitPrice,
      });
    } catch (queueError) {

      // Queue thất bại -> trả stock về Redis
      try {
        await stockService.rollbackStock(
          saleId,
          productId,
          userId,
          quantity
        );
      } catch (rollbackError) {
        console.error(
          '[BUY] Redis rollback failed:',
          {
            saleId,
            productId,
            userId,
            quantity,
            error: rollbackError.message,
          }
        );
      }

      throw queueError;
    }


    // --------------------------------------------------------
    // 8. Trả 202 ngay
    // --------------------------------------------------------
    return res.status(202).json({
      success: true,
      orderId,
      productName: reserve.productName,
      remainingStock: reserve.remainingStock,
      message:
        'Giữ hàng thành công, đơn hàng đang được xử lý.',
    });

  } catch (err) {
    next(err);
  }
}


// ============================================================
// GET /api/orders/:orderId
// ============================================================
async function getOrderStatus(req, res, next) {
  try {
    const { orderId } = req.params;
    const userId = req.userId;

    const { rows } = await pool.query(
      `
      SELECT
        id,
        sale_id,
        product_id,
        user_id,
        quantity,
        unit_price,
        status,
        failure_reason,
        created_at
      FROM orders
      WHERE id = $1
        AND user_id = $2
      `,
      [orderId, userId]
    );

    if (rows.length === 0) {
      return res.status(202).json({
        success: true,
        status: 'pending',
      });
    }

    res.json({
      success: true,
      order: rows[0],
    });

  } catch (err) {
    next(err);
  }
}


// ============================================================
// POST /api/flash-sales/:saleId/warmup
// Admin nạp stock DB -> Redis
// ============================================================
async function warmup(req, res, next) {
  try {
    const { saleId } = req.params;

    const count = await stockService.warmupFlashSale(
      saleId
    );

    res.json({
      success: true,
      itemsWarmedUp: count,
    });

  } catch (err) {
    next(err);
  }
}


module.exports = {
  getProductStatus,
  buyProduct,
  getOrderStatus,
  warmup,
  syncSaleStatus,
};