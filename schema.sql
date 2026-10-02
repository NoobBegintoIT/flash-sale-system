-- =========================================================
-- FLASH SALE SYSTEM - DATABASE SCHEMA
-- =========================================================

-- =========================================================
-- 1. USERS
-- =========================================================

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,

    username VARCHAR(50) NOT NULL UNIQUE,

    email VARCHAR(255) NOT NULL UNIQUE,

    password_hash TEXT NOT NULL,

    full_name VARCHAR(100),

    role VARCHAR(20) NOT NULL DEFAULT 'user'
        CHECK (role IN ('user', 'admin')),

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_role
    ON users(role);

CREATE INDEX IF NOT EXISTS idx_users_is_active
    ON users(is_active);


-- =========================================================
-- 2. PRODUCTS
-- =========================================================

CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,

    name VARCHAR(255) NOT NULL,

    price NUMERIC(12,2) NOT NULL,

    image_url TEXT,

    created_at TIMESTAMPTZ DEFAULT now()
);


-- =========================================================
-- 3. FLASH SALES
-- =========================================================

CREATE TABLE IF NOT EXISTS flash_sales (
    id SERIAL PRIMARY KEY,

    name VARCHAR(255) NOT NULL,

    start_time TIMESTAMPTZ NOT NULL,

    end_time TIMESTAMPTZ NOT NULL,

    status VARCHAR(20) NOT NULL DEFAULT 'scheduled',

    created_at TIMESTAMPTZ DEFAULT now()
);


-- =========================================================
-- 4. FLASH SALE ITEMS
-- =========================================================

CREATE TABLE IF NOT EXISTS flash_sale_items (
    id SERIAL PRIMARY KEY,

    sale_id INTEGER NOT NULL
        REFERENCES flash_sales(id),

    product_id INTEGER NOT NULL
        REFERENCES products(id),

    sale_price NUMERIC(12,2) NOT NULL,

    stock INTEGER NOT NULL,

    limit_per_user INTEGER NOT NULL DEFAULT 1,

    version INTEGER NOT NULL DEFAULT 0,

    UNIQUE (sale_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_flash_sale_items_sale
    ON flash_sale_items(sale_id);


-- =========================================================
-- 5. ORDERS
-- =========================================================

CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY,

    sale_id INTEGER NOT NULL
        REFERENCES flash_sales(id),

    product_id INTEGER NOT NULL
        REFERENCES products(id),

    user_id VARCHAR(64) NOT NULL,

    quantity INTEGER NOT NULL,

    unit_price NUMERIC(12,2) NOT NULL,

    status VARCHAR(20) NOT NULL DEFAULT 'pending',

    failure_reason VARCHAR(255),

    created_at TIMESTAMPTZ DEFAULT now(),

    updated_at TIMESTAMPTZ DEFAULT now(),

    UNIQUE (sale_id, product_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_orders_status
    ON orders(status);

CREATE INDEX IF NOT EXISTS idx_orders_user_id
    ON orders(user_id);

CREATE INDEX IF NOT EXISTS idx_orders_created_at
    ON orders(created_at);


-- =========================================================
-- 6. COMMENTS
-- =========================================================

COMMENT ON TABLE users IS
    'Tài khoản người dùng và quản trị viên';

COMMENT ON COLUMN users.password_hash IS
    'Mật khẩu được hash bằng bcrypt, không lưu plaintext';

COMMENT ON COLUMN users.role IS
    'Vai trò tài khoản: user hoặc admin';

COMMENT ON COLUMN users.is_active IS
    'Cho phép khóa/mở khóa tài khoản';


-- =========================================================
-- END OF SCHEMA
-- =========================================================