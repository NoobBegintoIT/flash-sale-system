
const express = require('express');

const controller = require('../controllers/authController');
const { validate } = require('../middleware/validate');

const {
  loginLimiter,
  registerLimiter
} = require('../middleware/rateLimiter');

const router = express.Router();

// POST /api/auth/register
router.post(
  '/register',
  registerLimiter,
  validate({
    body: {
      username: {
        required: true,
        type: 'string',
        minLength: 3,
        maxLength: 50
      },
      email: {
        type: 'string',
        required: true,
        maxLength: 255,
        format: 'email'
      },
      password: {
        required: true,
        type: 'string',
        minLength: 6
      },
      fullName: {
        required: false,
        type: 'string',
        maxLength: 100
      }
    }
  }),
  controller.register
);

// POST /api/auth/login
router.post(
  '/login',
  loginLimiter,
  validate({
    body: {
      username: {
        required: true,
        type: 'string',
        minLength: 1,
        maxLength: 255
      },
      password: {
        required: true,
        type: 'string',
        minLength: 1
      }
    }
  }),
  controller.login
);

module.exports = router;