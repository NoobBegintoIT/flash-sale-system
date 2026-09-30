let sale = +new URLSearchParams(location.search).get('sale'), off = 0, start = 0, end = 0;
const msgs = {};
const hms = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return [(s / 3600) | 0, ((s / 60) % 60) | 0, s % 60].map((v) => String(v).padStart(2, '0')).join(':'); };
const ERR = { OUT_OF_STOCK: 'Hết hàng rồi 😢', USER_LIMIT_EXCEEDED: 'Bạn đã mua đủ số lượng cho phép', TOO_MANY_REQUESTS: 'Thao tác quá nhanh, chờ chút nhé' };

async function tick() {
  if (!sale) { const r = await api('/flash-sales'); sale = r.sales && r.sales[0] && r.sales[0].id; }
  if (!sale) return ($('#items').textContent = 'Chưa có flash sale. Hãy chạy: npm run seed');
  const r = await api('/flash-sales/' + sale);
  if (!r.success) return ($('#items').textContent = 'Flash sale chưa được nạp kho. Vào trang Admin bấm "Warmup".');
  off = r.serverTime - Date.now(); start = +r.sale.startTime; end = +r.sale.endTime;
  $('#title').textContent = r.sale.name;
  $('#items').innerHTML = r.items.map((i) => {
    const pct = i.initialStock ? Math.round((i.remaining / i.initialStock) * 100) : 0;
    return `<div class="card"><div class="emoji">🎧</div><h3>${i.name}</h3><div class="price">${vnd(i.salePrice)}</div>
    <div class="bar"><i style="width:${pct}%"></i></div><small>Còn ${i.remaining}/${i.initialStock} · tối đa ${i.limitPerUser}/người</small>
    <button data-p="${i.productId}" ${i.remaining <= 0 ? 'disabled' : ''}>${i.remaining <= 0 ? 'Hết hàng' : 'Mua ngay'}</button>
    <div class="msg">${msgs[i.productId] || ''}</div></div>`;
  }).join('');
}
async function buy(p) {
  msgs[p] = '⏳ Đang giữ hàng…';
  const r = await api(`/flash-sales/${sale}/products/${p}/buy`, { method: 'POST', body: { quantity: 1 } });
  if (r.success) { msgs[p] = '⏳ Đã giữ hàng, đang xử lý đơn…'; poll(p, r.orderId); }
  else msgs[p] = '❌ ' + (ERR[r.error] || r.error || 'Lỗi');
  tick();
}
async function poll(p, id, n = 0) {
  const r = await api('/orders/' + id);
  if (r.order) { msgs[p] = r.order.status === 'confirmed' ? '✅ Đặt hàng thành công!' : '❌ Đơn thất bại'; return tick(); }
  if (n < 30) setTimeout(() => poll(p, id, n + 1), 500);
}
$('#items').onclick = (e) => e.target.dataset.p && buy(e.target.dataset.p);
$('#uid').value = userId();
$('#uid').onchange = (e) => localStorage.setItem('uid', e.target.value.trim() || userId());
setInterval(() => { const now = Date.now() + off; $('#count').textContent = !end ? '--:--:--' : now < start ? 'Bắt đầu sau ' + hms(start - now) : now < end ? 'Kết thúc sau ' + hms(end - now) : 'Đã kết thúc'; }, 1000);
tick(); setInterval(tick, 2000);
