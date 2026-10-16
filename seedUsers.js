require('dotenv').config();

const bcrypt = require('bcryptjs');
const { pool } = require('./src/config/db');

const users = [
  {
    username: 'admin',
    email: 'admin@flashsale.local',
    password: 'Admin@123',
    fullName: 'Flash Sale Administrator',
    role: 'admin'
  },
  {
    username: 'user',
    email: 'user@flashsale.local',
    password: 'User@123',
    fullName: 'Demo User',
    role: 'user'
  }
];

async function main() {
  try {
    for (const user of users) {
      const passwordHash = await bcrypt.hash(user.password, 12);

      await pool.query(
        `
        INSERT INTO users
          (username, email, password_hash, full_name, role)
        VALUES
          ($1, $2, $3, $4, $5)
        ON CONFLICT (username)
        DO UPDATE SET
          email = EXCLUDED.email,
          password_hash = EXCLUDED.password_hash,
          full_name = EXCLUDED.full_name,
          role = EXCLUDED.role,
          is_active = TRUE,
          updated_at = now()
        `,
        [
          user.username,
          user.email,
          passwordHash,
          user.fullName,
          user.role
        ]
      );

      console.log(
        `[seedUsers] Đã tạo/cập nhật tài khoản: ${user.username} (${user.role})`
      );
    }

    console.log('\n[seedUsers] Hoàn tất.');
  } catch (err) {
    console.error('[seedUsers] Lỗi:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();