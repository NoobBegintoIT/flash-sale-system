const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');

function createToken(user) {
  return jwt.sign(
    {
      sub: String(user.id),
      username: user.username,
      role: user.role
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '2h'
    }
  );
}

async function register(req, res, next) {
  try {
    const {
      username,
      email,
      password,
      fullName
    } = req.body;

    // ==============================
    // 1. Validate input
    // ==============================

    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'username, email và password là bắt buộc.'
      });
    }

    const normalizedUsername = String(username).trim().toLowerCase();
    const normalizedEmail = String(email).trim().toLowerCase();

    if (normalizedUsername.length < 3) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_USERNAME',
        message: 'Username phải có ít nhất 3 ký tự.'
      });
    }

    if (normalizedUsername.length > 50) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_USERNAME',
        message: 'Username không được vượt quá 50 ký tự.'
      });
    }

    if (normalizedEmail.length > 255) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_EMAIL',
        message: 'Email không hợp lệ.'
      });
    }

    if (String(password).length < 6) {
      return res.status(400).json({
        success: false,
        error: 'WEAK_PASSWORD',
        message: 'Password phải có ít nhất 6 ký tự.'
      });
    }

    // ==============================
    // 2. Kiểm tra username/email
    // ==============================

    const existingUser = await pool.query(
      `
      SELECT id, username, email
      FROM users
      WHERE username = $1
         OR email = $2
      LIMIT 1
      `,
      [normalizedUsername, normalizedEmail]
    );

    if (existingUser.rows.length > 0) {
      const existing = existingUser.rows[0];

      if (existing.username === normalizedUsername) {
        return res.status(409).json({
          success: false,
          error: 'USERNAME_EXISTS',
          message: 'Username đã tồn tại.'
        });
      }

      return res.status(409).json({
        success: false,
        error: 'EMAIL_EXISTS',
        message: 'Email đã được sử dụng.'
      });
    }

    // ==============================
    // 3. Hash password
    // ==============================

    const passwordHash = await bcrypt.hash(password, 12);

    // ==============================
    // 4. Tạo user
    // ==============================

    const result = await pool.query(
      `
      INSERT INTO users (
        username,
        email,
        password_hash,
        full_name,
        role,
        is_active
      )
      VALUES ($1, $2, $3, $4, 'user', TRUE)
      RETURNING
        id,
        username,
        email,
        full_name,
        role,
        is_active,
        created_at
      `,
      [
        normalizedUsername,
        normalizedEmail,
        passwordHash,
        fullName ? String(fullName).trim() : null
      ]
    );

    const user = result.rows[0];

    // ==============================
    // 5. Tạo JWT
    // ==============================

    const token = createToken(user);

    // ==============================
    // 6. Response
    // ==============================

    return res.status(201).json({
      success: true,
      message: 'Đăng ký tài khoản thành công.',
      token,
      user
    });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const {
      username,
      password
    } = req.body;

    // ==============================
    // 1. Validate input
    // ==============================

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'username và password là bắt buộc.'
      });
    }

    const loginValue = String(username).trim().toLowerCase();

    // ==============================
    // 2. Tìm user
    // Có thể đăng nhập bằng username
    // hoặc email
    // ==============================

    const result = await pool.query(
      `
      SELECT
        id,
        username,
        email,
        password_hash,
        full_name,
        role,
        is_active,
        created_at
      FROM users
      WHERE username = $1
         OR email = $1
      LIMIT 1
      `,
      [loginValue]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'INVALID_CREDENTIALS',
        message: 'Username/email hoặc password không đúng.'
      });
    }

    const user = result.rows[0];

    // ==============================
    // 3. Kiểm tra tài khoản
    // ==============================

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        error: 'ACCOUNT_DISABLED',
        message: 'Tài khoản đã bị khóa.'
      });
    }

    // ==============================
    // 4. Kiểm tra password
    // ==============================

    const passwordMatched = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!passwordMatched) {
      return res.status(401).json({
        success: false,
        error: 'INVALID_CREDENTIALS',
        message: 'Username/email hoặc password không đúng.'
      });
    }

    // ==============================
    // 5. Tạo JWT
    // ==============================

    const token = createToken(user);

    // Không trả password_hash
    delete user.password_hash;

    // ==============================
    // 6. Response
    // ==============================

    return res.json({
      success: true,
      message: 'Đăng nhập thành công.',
      token,
      user
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  register,
  login
};