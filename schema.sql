CREATE TABLE IF NOT EXISTS products (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(255) NOT NULL,
  price         NUMERIC(12,2) NOT NULL,
  image_url     TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS flash_sales (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(255) NOT NULL,
  start_time    TIMESTAMPTZ NOT NULL,
  end_time      TIMESTAMPTZ NOT NULL,
  status        VARCHAR(20) NOT NULL DEFAULT 'scheduled', -- scheduled | active | ended
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Mỗi sản phẩm trong 1 flash sale có 1 kho riêng + giá sale + giới hạn mua/người
CREATE TABLE IF NOT EXISTS flash_sale_items (
  id              SERIAL PRIMARY KEY,
  sale_id         INTEGER NOT NULL REFERENCES flash_sales(id),
  product_id      INTEGER NOT NULL REFERENCES products(id),
  sale_price      NUMERIC(12,2) NOT NULL,
  stock           INTEGER NOT NULL,           -- kho gốc (đồng bộ ngược từ Redis sau sale)
  limit_per_user  INTEGER NOT NULL DEFAULT 1,
  version         INTEGER NOT NULL DEFAULT 0,  -- optimistic locking, phòng khi phải trừ kho trực tiếp ở DB
  UNIQUE (sale_id, product_id)
);

-- Đơn hàng: unique (sale_id, product_id, user_id) là lớp chống mua-trùng thứ 2
-- (lớp thứ 1 là Redis SET trong Lua script, xử lý ở tầng tốc độ cao trước khi vào DB)
CREATE TABLE IF NOT EXISTS orders (
  id            UUID PRIMARY KEY,
  sale_id       INTEGER NOT NULL REFERENCES flash_sales(id),
  product_id    INTEGER NOT NULL REFERENCES products(id),
  user_id       VARCHAR(64) NOT NULL,
  quantity      INTEGER NOT NULL,
  unit_price    NUMERIC(12,2) NOT NULL,
  status        VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | confirmed | failed | cancelled
  failure_reason VARCHAR(255),
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (sale_id, product_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_flash_sale_items_sale ON flash_sale_items(sale_id);
