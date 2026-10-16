# Hệ thống Flash Sale — Express.js

Backend flash sale tập trung giải quyết đúng 3 bài toán khó nhất của loại
hệ thống này: **chống bán quá kho (oversell)**, **chịu tải cực cao trong
vài giây**, và **không để 1 user mua nhiều lần**.

## Kiến trúc tổng quan

```
Client
  │  POST /api/flash-sales/:saleId/products/:productId/buy
  ▼
Express API (stateless, có thể cluster/scale ngang)
  │  1) Rate limit (Redis, chặn spam-click)
  │  2) Reserve stock NGUYÊN TỬ bằng Lua script trong Redis  ◄── điểm mấu chốt
  │  3) Đẩy job vào BullMQ, trả 202 ngay (không chờ ghi DB)
  ▼
Redis  (single-threaded → không có race condition khi trừ kho)
  │
  ▼
BullMQ Queue ── Order Worker (process riêng, scale ngang độc lập)
  │  Ghi bảng `orders` trong Postgres, có UNIQUE constraint làm lớp
  │  chống trùng thứ 2, rollback Redis nếu ghi DB thất bại
  ▼
PostgreSQL (nguồn sự thật lâu dài, dùng để đối soát/báo cáo)
```

### Vì sao không trừ kho trực tiếp trong Postgres?
`UPDATE ... SET stock = stock - 1 WHERE stock >= 1` vẫn đúng nhưng dưới tải
flash sale (hàng chục nghìn request/giây cùng 1 dòng dữ liệu) sẽ gây **lock
contention** cực nặng trên 1 row, làm cả DB nghẽn theo. Redis xử lý lệnh
tuần tự (single-threaded) trong bộ nhớ nên trừ kho nguyên tử ở đó nhanh gấp
hàng trăm lần và không có tranh chấp lock.

### 3 lớp chống oversell / mua trùng
1. **Redis Lua script** (`src/scripts/decrementStock.lua`) — chạy nguyên tử,
   vừa kiểm tra tồn kho vừa kiểm tra giới hạn mua/user trong 1 lệnh EVAL duy
   nhất, không thread nào chen ngang được.
2. **BullMQ `jobId` trùng** — chống job bị enqueue lặp nếu client retry.
3. **Postgres `UNIQUE (sale_id, product_id, user_id)`** — lớp cuối cùng,
   phòng trường hợp hiếm gặp (Redis mất dữ liệu, TTL hết hạn giữa sale...).

## Cấu trúc thư mục
```
src/
  config/       Redis, Postgres client
  scripts/      Lua script trừ kho nguyên tử
  services/     stockService (warmup, reserve, rollback)
  queues/       BullMQ queue + worker xử lý đơn hàng bất đồng bộ
  middleware/   rate limiter (Redis-backed), auth, error handler
  controllers/  logic request/response
  routes/       khai báo endpoint
  app.js        cấu hình Express
  server.js     entrypoint (API + worker cùng process, dùng cho dev)
  cluster.js    entrypoint multi-core cho production
```

## Khởi động đúng thứ tự (Debian 13 / Linux)

**Quan trọng:** PostgreSQL và Redis phải chạy trước khi seed hoặc mở Admin. Nếu terminal báo `ECONNREFUSED 127.0.0.1:5432`, PostgreSQL chưa chạy/không mở cổng; đây không phải lỗi giao diện Admin.

Từ thư mục gốc `flash-sale-system` chạy:

```bash
cp .env.example .env
npm install
npm run infra:up                 # khởi động PostgreSQL + Redis
docker compose ps                # cả postgres và redis phải ở trạng thái Up
npm run seed                     # tạo dữ liệu mẫu và nạp kho Redis
npm run dev                      # API + Worker cùng process cho demo
```

Nếu database đã khởi tạo trước đó mà schema thay đổi, volume cũ sẽ không tự chạy lại `schema.sql`. Chỉ khi bạn chấp nhận xóa toàn bộ dữ liệu demo mới chạy `docker compose down -v` rồi `npm run infra:up` và `npm run seed`.

Sau khi mua ở trang cửa hàng, Worker ghi đơn vào PostgreSQL bất đồng bộ. Admin tự làm mới trang đang mở mỗi 5 giây; cũng có thể bấm nút “Làm mới”. Đơn có thể mất một khoảng ngắn ở trạng thái đang xử lý trước khi xuất hiện.

Nếu Admin không tải được dữ liệu, mở DevTools (F12) → Network, xem request `/api/admin/...`. `401` là khóa Admin không khớp `ADMIN_API_KEY`; `500`/`503` thường là PostgreSQL/Redis chưa chạy hoặc chưa seed.

## Chạy thử

```bash
cp .env.example .env
docker compose up -d          # khởi động Redis + Postgres (đã tự chạy schema.sql)
npm install
npm run seed                  # tạo 1 flash sale mẫu + warmup kho vào Redis
npm run dev                   # hoặc: npm run cluster (multi-core)
```

Gọi thử API:
```bash
# Xem tồn kho real-time
curl http://localhost:3000/api/flash-sales/1/products/1

# Mua hàng
curl -X POST http://localhost:3000/api/flash-sales/1/products/1/buy \
  -H "Content-Type: application/json" \
  -H "x-user-id: user-001" \
  -d '{"quantity":1}'
# -> 202 { orderId, remainingStock, ... }

# Tra cứu trạng thái đơn (worker xử lý xong sẽ chuyển 'confirmed')
curl http://localhost:3000/api/orders/<orderId> -H "x-user-id: user-001"
```

## Test chịu tải (khuyến nghị)
Dùng `autocannon` hoặc `k6` bắn đồng thời hàng nghìn request `buy` với
`quantity=1` vào 1 sản phẩm có kho = 50, rồi đếm số đơn `confirmed` trong
DB — con số phải đúng bằng 50, không hơn không kém. Đây là bài test quan
trọng nhất trước khi đưa hệ thống lên production.

```bash
npx autocannon -c 500 -d 10 -m POST \
  -H "content-type: application/json" -H "x-user-id: load-test" \
  -b '{"quantity":1}' \
  http://localhost:3000/api/flash-sales/1/products/1/buy
```
(Lưu ý: script trên dùng chung 1 `x-user-id` nên sau request đầu tiên các
request sau sẽ trả `USER_LIMIT_EXCEEDED` — muốn test đúng kịch bản "nhiều
user khác nhau tranh mua" cần script random `x-user-id` mỗi request, ví dụ
bằng k6 với `${__VU}-${__ITER}`.)

## Mở rộng khi lên production
- **Scale API**: chạy `npm run cluster` hoặc nhiều container phía sau load
  balancer (Nginx/ALB) — API tầng này hoàn toàn stateless.
- **Scale Worker**: chạy `node src/queues/runWorker.js` thành nhiều process
  độc lập (PM2/K8s Deployment riêng) — tách khỏi API để không ảnh hưởng độ
  trễ phản hồi request mua hàng.
- **Redis Cluster** nếu 1 node Redis không đủ tải (hiếm khi cần với flash
  sale quy mô vừa/nhỏ, vì Redis đơn node đã xử lý được hàng chục nghìn
  op/giây).
- **CDN + cache trang sản phẩm** để giảm tải các request GET không cần
  real-time tuyệt đối.
- **Hàng đợi phòng chờ (waiting room)** ở tầng trước nếu traffic đỉnh vượt
  xa cả khả năng của Redis — cho user xếp hàng ảo trước khi vào trang mua.
- Thay auth demo (`x-user-id` header) bằng JWT xác thực thật.

## Admin Console nâng cấp

Mở `http://localhost:3000/admin.html` để sử dụng Admin Console gồm Dashboard, sản phẩm, chiến dịch, đơn hàng, đối chiếu kho Redis, Queue/Worker và sức khỏe dịch vụ.

- Khóa demo mặc định: `demo-admin-key` (được nhập khi mở Admin lần đầu và lưu trong localStorage của trình duyệt).
- Hãy đặt `ADMIN_API_KEY` trong `.env` thành chuỗi riêng trước khi dùng ngoài máy cá nhân. Đây là cơ chế bảo vệ demo, chưa thay thế hệ thống đăng nhập/role quản trị production.
- Admin API mới nằm dưới `/api/admin/*`; API mua hàng và mô phỏng cửa hàng hiện tại vẫn được giữ.
- Dashboard và monitor lấy số liệu trực tiếp từ PostgreSQL, Redis và BullMQ. Nếu chưa chạy PostgreSQL/Redis hoặc chưa seed dữ liệu, các màn hình sẽ báo lỗi kết nối hoặc chưa có dữ liệu.

### API Admin chính

| Method | Endpoint | Mục đích |
|---|---|---|
| GET | `/api/admin/dashboard` | Thẻ tổng quan và trạng thái queue |
| GET/POST | `/api/admin/products` | Danh sách / tạo sản phẩm |
| PUT/DELETE | `/api/admin/products/:id` | Sửa / xóa sản phẩm |
| GET/POST | `/api/admin/campaigns` | Danh sách / tạo chiến dịch |
| POST | `/api/admin/campaigns/:id/items` | Thêm sản phẩm vào chiến dịch |
| GET | `/api/admin/orders` | Danh sách đơn, lọc trạng thái |
| GET | `/api/admin/queue` | Số liệu queue và job lỗi gần đây |
| GET | `/api/admin/health` | Redis, PostgreSQL, runtime |

Tất cả API Admin yêu cầu header `x-admin-key` khớp với `ADMIN_API_KEY`.

## Chạy và kiểm tra đồ án

1. Tạo `.env` từ `.env.example`. Nếu chưa đổi cấu hình, Admin key local là `demo-admin-key`.
2. Khởi động PostgreSQL và Redis bằng Docker Compose: `npm run infra:up`.
3. Lần đầu khởi tạo database, `schema.sql` được PostgreSQL chạy tự động. Sau đó chạy `npm run seed`.
4. Chạy Express + Worker bằng `npm run dev`.
5. Mở `/admin.html`. Nếu `.env` dùng key mặc định, hệ thống tự dùng `demo-admin-key`; nếu dùng key khác, trình duyệt sẽ hỏi key.
6. Vào **Chiến dịch** → chọn sale → **Warmup Redis**.
7. Mở `/`, nhập user bất kỳ và bấm **Mua ngay**.
8. Quay lại Admin → **Đơn hàng**. Dashboard/Orders sẽ tự làm mới khoảng 5 giây một lần.
9. Vào **Queue & Worker** để xem waiting/active/completed/failed. Job failed có thể Retry.
10. `/simulate.html` cũng dùng quyền Admin và lấy cùng `flash_admin_key` trong trình duyệt.

### Nếu đã có database cũ

Nếu PostgreSQL đã được khởi tạo từ trước, thay đổi `schema.sql` không tự chạy lại. Với dữ liệu demo có thể xóa volume và tạo lại:

```bash
docker compose down -v
npm run infra:up
npm run seed
npm run dev
```

`docker compose down -v` sẽ xóa dữ liệu PostgreSQL/Redis của project.
