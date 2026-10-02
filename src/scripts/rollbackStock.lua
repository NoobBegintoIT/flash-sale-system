-- rollbackStock.lua
--
-- Hoàn lại stock và số lượng đã mua của user
-- trong cùng một Lua execution.
--
-- KEYS[1] = stock key
-- KEYS[2] = buyers hash
--
-- ARGV[1] = userId
-- ARGV[2] = quantity
--
-- return:
--   -1 = stock key không tồn tại
--    0 = rollback thành công

local stockKey = KEYS[1]
local buyersKey = KEYS[2]

local userId = ARGV[1]
local qty = tonumber(ARGV[2])

local stock = redis.call('GET', stockKey)

if stock == false then
  return -1
end

local bought = tonumber(
  redis.call('HGET', buyersKey, userId) or '0'
)

if bought < qty then
  return -2
end

redis.call('INCRBY', stockKey, qty)

local remainingBought = bought - qty

if remainingBought == 0 then
  redis.call('HDEL', buyersKey, userId)
else
  redis.call(
    'HSET',
    buyersKey,
    userId,
    remainingBought
  )
end

return 0