const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { purchaseLimiter } = require('../middleware/rateLimiter');
const controller = require('../controllers/flashSaleController');
const admin = require('../controllers/adminController');
const { requireAdmin } = require('../middleware/adminAuth');

const router = express.Router();

router.get('/flash-sales/:saleId/products/:productId', controller.getProductStatus);

router.post(
  '/flash-sales/:saleId/products/:productId/buy',
  requireAuth,
  purchaseLimiter, // chặn spam-click ngay tại middleware, trước khi chạm Redis stock
  controller.buyProduct
);

router.get('/orders/:orderId', requireAuth, controller.getOrderStatus);

// Admin nạp kho vào Redis trước giờ mở bán
router.post('/flash-sales/:saleId/warmup', requireAdmin, controller.warmup);

const ui = require('../controllers/uiController');
router.get('/flash-sales', ui.listSales);
router.get('/flash-sales/:saleId', ui.overview);
router.get('/admin/sales/:saleId/stats', requireAdmin, ui.stats);
router.post('/admin/simulate', requireAdmin, ui.simulate);
router.post('/admin/sales/:saleId/reset', requireAdmin, ui.reset);

// Admin REST API
router.get('/admin/dashboard', requireAdmin, admin.dashboard);
router.get('/admin/stats', requireAdmin, admin.stats);
router.get('/admin/products', requireAdmin, admin.listProducts);
router.post('/admin/products', requireAdmin, admin.createProduct);
router.put('/admin/products/:id', requireAdmin, admin.updateProduct);
router.delete('/admin/products/:id', requireAdmin, admin.deleteProduct);
router.get('/admin/campaigns', requireAdmin, admin.listSales);
router.post('/admin/campaigns', requireAdmin, admin.createSale);
router.post('/admin/campaigns/:id/items', requireAdmin, admin.addSaleItem);
router.get('/admin/orders', requireAdmin, admin.listOrders);
router.get('/admin/queue', requireAdmin, admin.queue);
router.get('/admin/health', requireAdmin, admin.health);

module.exports = router;
