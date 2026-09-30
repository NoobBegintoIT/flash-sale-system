-- decrementStock.lua
-- Chạy NGUYÊN TỬ trong 1 lần EVAL, không có thread nào khác chen vào giữa
-- được -> nhờ đó dù 100.000 request bắn cùng lúc, kho không bao giờ âm.
--
-- KEYS[1] = key số lượng tồn kho, vd "fs:1:stock:101"
-- KEYS[2] = key set những user đã mua thành công, vd "fs:1:buyers:101"
-- ARGV[1] = userId
-- ARGV[2] = số lượng muốn mua
-- ARGV[3] = giới hạn số lượng / user (limit_per_user)
--
-- Trả về:
--   -1 = sự kiện/sản phẩm chưa được nạp kho (chưa warmup hoặc đã hết hạn TTL)
--   -2 = user này đã mua rồi (vượt limit_per_user)
--   -3 = không đủ hàng
--   >=0 = số lượng còn lại sau khi trừ (thành công)

local stockKey   = KEYS[1]
local buyersKey  = KEYS[2]
local userId     = ARGV[1]
local qty        = tonumber(ARGV[2])
local limit      = tonumber(ARGV[3])

local stock = redis.call('GET', stockKey)
if stock == false then
  return -1
end
stock = tonumber(stock)

local bought = tonumber(redis.call('HGET', buyersKey, userId) or '0')
if bought + qty > limit then
  return -2
end

if stock < qty then
  return -3
end

redis.call('DECRBY', stockKey, qty)
redis.call('HINCRBY', buyersKey, userId, qty)

return stock - qty
