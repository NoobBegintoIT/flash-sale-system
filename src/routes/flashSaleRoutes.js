const express = require('express');

const {
  requireAuth,
  requireRole
} = require('../middleware/auth');

const { purchaseLimiter } = require('../middleware/rateLimiter');
const { validate } = require('../middleware/validate');

const controller = require('../controllers/flashSaleController');
const admin = require('../controllers/adminController');
const ui = require('../controllers/uiController');

const router = express.Router();


// ============================================================
// USER / FLASH SALE
// ============================================================

router.get(
  '/flash-sales/:saleId/products/:productId',
  controller.getProductStatus
);

router.post(
  '/flash-sales/:saleId/products/:productId/buy',
  requireAuth,
  purchaseLimiter,
  validate({
    params: {
      saleId: {
        required: true,
        type: 'integer',
        min: 1
      },
      productId: {
        required: true,
        type: 'integer',
        min: 1
      }
    },
    body: {
      quantity: {
        required: true,
        type: 'integer',
        min: 1,
        max: 10
      }
    }
  }),
  controller.buyProduct
);

router.get(
  '/orders/:orderId',
  requireAuth,
  validate({
    params: {
      orderId: {
        required: true,
        type: 'integer',
        min: 1
      }
    }
  }),
  controller.getOrderStatus
);


// ============================================================
// FLASH SALE ADMIN ACTIONS
// ============================================================

router.post(
  '/flash-sales/:saleId/warmup',
  requireAuth,
  requireRole('admin'),
  validate({
    params: {
      saleId: {
        required: true,
        type: 'integer',
        min: 1
      }
    }
  }),
  controller.warmup
);


// ============================================================
// PUBLIC FLASH SALE UI
// ============================================================

router.get(
  '/flash-sales',
  ui.listSales
);

router.get(
  '/flash-sales/:saleId',
  validate({
    params: {
      saleId: {
        required: true,
        type: 'integer',
        min: 1
      }
    }
  }),
  ui.overview
);


// ============================================================
// ADMIN SALES / SIMULATION
// ============================================================

router.get(
  '/admin/sales/:saleId/stats',
  requireAuth,
  requireRole('admin'),
  validate({
    params: {
      saleId: {
        required: true,
        type: 'integer',
        min: 1
      }
    }
  }),
  ui.stats
);

router.post(
  '/admin/simulate',
  requireAuth,
  requireRole('admin'),
  validate({
    body: {
      saleId: {
        required: true,
        type: 'integer',
        min: 1
      },
      productId: {
        required: true,
        type: 'integer',
        min: 1
      },
      users: {
        required: false,
        type: 'integer',
        min: 1,
        max: 20000
      }
    }
  }),
  ui.simulate
);

router.post(
  '/admin/sales/:saleId/reset',
  requireAuth,
  requireRole('admin'),
  validate({
    params: {
      saleId: {
        required: true,
        type: 'integer',
        min: 1
      }
    }
  }),
  ui.reset
);


// ============================================================
// ADMIN DASHBOARD
// ============================================================

router.get(
  '/admin/dashboard',
  requireAuth,
  requireRole('admin'),
  admin.dashboard
);


// ============================================================
// ADMIN STATISTICS
// ============================================================

router.get(
  '/admin/stats',
  requireAuth,
  requireRole('admin'),
  validate({
    query: {
      range: {
        required: false,
        type: 'string',
        enum: ['day', 'month', 'year']
      }
    }
  }),
  admin.stats
);


// ============================================================
// ADMIN PRODUCTS
// ============================================================

// GET /admin/products?q=coffee&page=1&limit=10
router.get(
  '/admin/products',
  requireAuth,
  requireRole('admin'),
  validate({
    query: {
      q: {
        required: false,
        type: 'string',
        maxLength: 100
      },
      page: {
        required: false,
        type: 'integer',
        min: 1
      },
      limit: {
        required: false,
        type: 'integer',
        min: 1,
        max: 100
      }
    }
  }),
  admin.listProducts
);


// POST /admin/products
router.post(
  '/admin/products',
  requireAuth,
  requireRole('admin'),
  validate({
    body: {
      name: {
        required: true,
        type: 'string',
        minLength: 1,
        maxLength: 255
      },
      price: {
        required: true,
        type: 'number',
        min: 0.01
      },
      image_url: {
        required: false,
        type: 'string',
        maxLength: 1000
      }
    }
  }),
  admin.createProduct
);


// PUT /admin/products/:id
router.put(
  '/admin/products/:id',
  requireAuth,
  requireRole('admin'),
  validate({
    params: {
      id: {
        required: true,
        type: 'integer',
        min: 1
      }
    },
    body: {
      name: {
        required: true,
        type: 'string',
        minLength: 1,
        maxLength: 255
      },
      price: {
        required: true,
        type: 'number',
        min: 0.01
      },
      image_url: {
        required: false,
        type: 'string',
        maxLength: 1000
      }
    }
  }),
  admin.updateProduct
);


// DELETE /admin/products/:id
router.delete(
  '/admin/products/:id',
  requireAuth,
  requireRole('admin'),
  validate({
    params: {
      id: {
        required: true,
        type: 'integer',
        min: 1
      }
    }
  }),
  admin.deleteProduct
);


// ============================================================
// ADMIN CAMPAIGNS
// ============================================================

// GET /admin/campaigns
router.get(
  '/admin/campaigns',
  requireAuth,
  requireRole('admin'),
  admin.listSales
);


// POST /admin/campaigns
router.post(
  '/admin/campaigns',
  requireAuth,
  requireRole('admin'),
  validate({
    body: {
      name: {
        required: true,
        type: 'string',
        minLength: 1,
        maxLength: 255
      },
      start_time: {
        required: true,
        type: 'string',
        minLength: 1
      },
      end_time: {
        required: true,
        type: 'string',
        minLength: 1
      },
      status: {
        required: false,
        type: 'string',
        enum: ['scheduled', 'active', 'ended']
      }
    }
  }),
  admin.createSale
);


// POST /admin/campaigns/:id/items
router.post(
  '/admin/campaigns/:id/items',
  requireAuth,
  requireRole('admin'),
  validate({
    params: {
      id: {
        required: true,
        type: 'integer',
        min: 1
      }
    },
    body: {
      product_id: {
        required: true,
        type: 'integer',
        min: 1
      },
      sale_price: {
        required: true,
        type: 'number',
        min: 0.01
      },
      stock: {
        required: true,
        type: 'integer',
        min: 0
      },
      limit_per_user: {
        required: false,
        type: 'integer',
        min: 1
      }
    }
  }),
  admin.addSaleItem
);


// ============================================================
// ADMIN ORDERS
// ============================================================

// GET /admin/orders?status=confirmed&page=1&limit=20
router.get(
  '/admin/orders',
  requireAuth,
  requireRole('admin'),
  validate({
    query: {
      status: {
        required: false,
        type: 'string',
        enum: [
          'pending',
          'confirmed',
          'failed',
          'cancelled'
        ]
      },
      page: {
        required: false,
        type: 'integer',
        min: 1
      },
      limit: {
        required: false,
        type: 'integer',
        min: 1,
        max: 100
      }
    }
  }),
  admin.listOrders
);


// ============================================================
// ADMIN QUEUE
// ============================================================

router.get(
  '/admin/queue',
  requireAuth,
  requireRole('admin'),
  admin.queue
);


// ============================================================
// ADMIN HEALTH
// ============================================================

router.get(
  '/admin/health',
  requireAuth,
  requireRole('admin'),
  admin.health
);


module.exports = router;