const express = require('express');

const controller = require('../controllers/authController');
const { validate } = require('../middleware/validate');
const {
  loginLimiter,
  registerLimiter
} = require('../middleware/rateLimiter');

const router = express.Router();

router.post(
  '/register',
  registerLimiter,
  validate({
    username: {
      required: true,
      type: 'string',
      minLength: 3,
      maxLength: 50
    },

    email: {
      required: true,
      type: 'string',
      maxLength: 255
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
  }),
  controller.register
);

router.post(
  '/login',
  loginLimiter,
  validate({
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
  }),
  controller.login
);

module.exports = router;