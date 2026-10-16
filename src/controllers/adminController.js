const { pool } = require('../config/db');
const { redis } = require('../config/redis');
const stock = require('../services/stockService');
const { orderQueue } = require('../queues/orderQueue');
const wrap = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);const asInt = (v, min = 1) => Number.isInteger(Number(v)) && Number(v) >= min;

exports.dashboard = wrap(async (req, res) => {
  const [orders, products, sales, confirmed, failed, queue, redisPing] = await Promise.all([
    pool.query('SELECT COUNT(*)::int AS total FROM orders'),
    pool.query('SELECT COUNT(*)::int AS total FROM products'),
    pool.query("SELECT COUNT(*)::int AS total FROM flash_sales WHERE status <> 'ended'"),
    pool.query("SELECT COUNT(*)::int AS total, COALESCE(SUM(quantity * unit_price),0)::numeric AS revenue FROM orders WHERE status='confirmed' AND created_at::date=CURRENT_DATE"),
    pool.query("SELECT COUNT(*)::int AS total FROM orders WHERE status='failed' AND created_at::date=CURRENT_DATE"),
    orderQueue.getJobCounts('waiting','active','completed','failed','delayed'),
    redis.ping()
  ]);
  res.json({ success:true, summary:{ orders:orders.rows[0].total, products:products.rows[0].total, activeSales:sales.rows[0].total, todayOrders:confirmed.rows[0].total, todayRevenue:Number(confirmed.rows[0].revenue), todayFailed:failed.rows[0].total }, queue, services:{ postgres:'connected', redis:redisPing==='PONG'?'connected':'unknown' }, serverTime:new Date().toISOString() });
});


exports.stats = wrap(async (req,res) => {
  const range = String(req.query.range || 'month');
  const allowed = new Set(['day','month','year']);
  if (!allowed.has(range)) return res.status(400).json({success:false,error:'INVALID_RANGE'});

  const where = range === 'day'
    ? "created_at >= CURRENT_DATE AND created_at < CURRENT_DATE + INTERVAL '1 day'"
    : range === 'month'
      ? "created_at >= date_trunc('month', CURRENT_DATE) AND created_at < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'"
      : "created_at >= date_trunc('year', CURRENT_DATE) AND created_at < date_trunc('year', CURRENT_DATE) + INTERVAL '1 year'";

  const [summary, series] = await Promise.all([
    pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status='confirmed')::int AS confirmed,
        COUNT(*) FILTER (WHERE status='failed')::int AS failed,
        COUNT(*) FILTER (WHERE status='pending')::int AS pending,
        COALESCE(SUM(quantity * unit_price) FILTER (WHERE status='confirmed'),0)::numeric AS revenue
      FROM orders
      WHERE ${where}
    `),
    pool.query(`
      SELECT
        date_trunc($1, created_at) AS bucket,
        COUNT(*) FILTER (WHERE status='confirmed')::int AS confirmed,
        COUNT(*) FILTER (WHERE status='failed')::int AS failed,
        COALESCE(SUM(quantity * unit_price) FILTER (WHERE status='confirmed'),0)::numeric AS revenue
      FROM orders
      WHERE ${where}
      GROUP BY 1
      ORDER BY 1
    `, [range === 'day' ? 'hour' : range === 'month' ? 'day' : 'month'])
  ]);

  res.json({
    success:true,
    range,
    summary:{
      confirmed:summary.rows[0].confirmed,
      failed:summary.rows[0].failed,
      pending:summary.rows[0].pending,
      revenue:Number(summary.rows[0].revenue)
    },
    series:series.rows.map(r=>({
      bucket:r.bucket,
      confirmed:r.confirmed,
      failed:r.failed,
      revenue:Number(r.revenue)
    }))
  });
});

exports.listProducts = wrap(async (req,res) => {
  const q = String(req.query.q || '').trim(); const page=Math.max(1,Number(req.query.page)||1); const limit=Math.min(100,Math.max(1,Number(req.query.limit)||10));
  const params=[]; let where=''; if(q){params.push(`%${q}%`);where='WHERE name ILIKE $1';}
  const count=await pool.query(`SELECT COUNT(*)::int AS total FROM products ${where}`,params);
  params.push(limit,(page-1)*limit);
  const rows=await pool.query(`SELECT id,name,price,image_url,created_at FROM products ${where} ORDER BY id DESC LIMIT $${params.length-1} OFFSET $${params.length}`,params);
  res.json({success:true,products:rows.rows,total:count.rows[0].total,page,limit});
});
exports.createProduct = wrap(async(req,res)=>{
  const {name,price,image_url=''}=req.body||{}; if(!name?.trim()||!asInt(price,0)||Number(price)<=0) return res.status(400).json({success:false,error:'INVALID_PRODUCT'});
  const {rows}=await pool.query('INSERT INTO products(name,price,image_url) VALUES($1,$2,$3) RETURNING *',[name.trim(),Number(price),String(image_url||'').trim()]); res.status(201).json({success:true,product:rows[0]});
});
exports.updateProduct = wrap(async(req,res)=>{
  const id=Number(req.params.id); const {name,price,image_url=''}=req.body||{}; if(!asInt(id)||!name?.trim()||!asInt(price,0)||Number(price)<=0) return res.status(400).json({success:false,error:'INVALID_PRODUCT'});
  const {rows}=await pool.query('UPDATE products SET name=$1,price=$2,image_url=$3 WHERE id=$4 RETURNING *',[name.trim(),Number(price),String(image_url||'').trim(),id]); if(!rows.length)return res.status(404).json({success:false,error:'PRODUCT_NOT_FOUND'}); res.json({success:true,product:rows[0]});
});
exports.deleteProduct = wrap(async(req,res)=>{const id=Number(req.params.id);try{const r=await pool.query('DELETE FROM products WHERE id=$1 RETURNING id',[id]);if(!r.rowCount)return res.status(404).json({success:false,error:'PRODUCT_NOT_FOUND'});res.json({success:true});}catch(e){if(e.code==='23503')return res.status(409).json({success:false,error:'PRODUCT_IN_USE'});throw e;}});

exports.listSales = wrap(async(req,res)=>{const {rows}=await pool.query(`SELECT fs.id,fs.name,fs.start_time,fs.end_time,fs.status,COUNT(fsi.id)::int AS product_count FROM flash_sales fs LEFT JOIN flash_sale_items fsi ON fsi.sale_id=fs.id GROUP BY fs.id ORDER BY fs.id DESC`);res.json({success:true,sales:rows});});
exports.createSale = wrap(async(req,res)=>{
 const {name,start_time,end_time,status='scheduled'}=req.body||{}; const start=new Date(start_time),end=new Date(end_time); if(!name?.trim()||!Number.isFinite(+start)||!Number.isFinite(+end)||end<=start||!['scheduled','active','ended'].includes(status))return res.status(400).json({success:false,error:'INVALID_SALE'});
 const {rows}=await pool.query('INSERT INTO flash_sales(name,start_time,end_time,status) VALUES($1,$2,$3,$4) RETURNING *',[name.trim(),start,end,status]);res.status(201).json({success:true,sale:rows[0]});
});
exports.addSaleItem = wrap(async(req,res)=>{const saleId=Number(req.params.id),{product_id,sale_price,stock,limit_per_user=1}=req.body||{};if(!asInt(saleId)||!asInt(product_id)||!asInt(sale_price,0)||Number(sale_price)<=0||!asInt(stock,0)||!asInt(limit_per_user))return res.status(400).json({success:false,error:'INVALID_SALE_ITEM'});const {rows}=await pool.query('INSERT INTO flash_sale_items(sale_id,product_id,sale_price,stock,limit_per_user) VALUES($1,$2,$3,$4,$5) RETURNING *',[saleId,product_id,sale_price,stock,limit_per_user]);res.status(201).json({success:true,item:rows[0]});});
exports.listOrders = wrap(async(req,res)=>{const status=String(req.query.status||'').trim();const page=Math.max(1,Number(req.query.page)||1),limit=Math.min(100,Math.max(1,Number(req.query.limit)||20));const allowed=['pending','confirmed','failed','cancelled'];const params=[];let where='';if(status&&allowed.includes(status)){params.push(status);where='WHERE o.status=$1';}params.push(limit,(page-1)*limit);const {rows}=await pool.query(`SELECT o.id,o.sale_id,o.product_id,o.user_id,o.quantity,o.unit_price,o.status,o.failure_reason,o.created_at,p.name AS product_name FROM orders o JOIN products p ON p.id=o.product_id ${where} ORDER BY o.created_at DESC LIMIT $${params.length-1} OFFSET $${params.length}`,params);const count=await pool.query(`SELECT COUNT(*)::int AS total FROM orders o ${where}`,status&&allowed.includes(status)?[status]:[]);res.json({success:true,orders:rows,total:count.rows[0].total,page,limit});});
exports.queue = wrap(async(req,res)=>{const counts=await orderQueue.getJobCounts('waiting','active','completed','failed','delayed','paused');const failed=await orderQueue.getFailed(0,19);res.json({success:true,counts,failed:failed.map(j=>({id:j.id,name:j.name,failedReason:j.failedReason,attemptsMade:j.attemptsMade, timestamp:j.timestamp}))});});
exports.health = wrap(async(req,res)=>{const [pg,rd,mem]=await Promise.all([pool.query('SELECT 1'),redis.ping(),redis.info('memory')]);const used=mem.match(/used_memory_human:([^\r\n]+)/)?.[1]||'n/a';res.json({success:true,services:{postgres:pg.rowCount?'connected':'unknown',redis:rd==='PONG'?'connected':'unknown'},redis:{memory:used},uptime:process.uptime(),node:process.version});});
exports.warmup = wrap(async(req,res)=>{const count=await stock.warmupFlashSale(req.params.id);res.json({success:true,itemsWarmedUp:count});});
