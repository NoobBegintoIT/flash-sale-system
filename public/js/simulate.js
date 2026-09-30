let sale;
function adminKey() { return localStorage.getItem('flash_admin_key') || 'demo-admin-key'; }
async function adminApi(url, opt = {}, retried = false) {
  const r = await fetch('/api' + url, {
    method: opt.method || 'GET',
    headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey() },
    body: opt.body ? JSON.stringify(opt.body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 && !retried) {
    const entered = prompt('ADMIN_API_KEY chưa đúng. Nhập key trong file .env (mặc định: demo-admin-key):');
    if (entered) { localStorage.setItem('flash_admin_key', entered); return adminApi(url, opt, true); }
  }
  if (!r.ok || data.success === false) throw new Error(data.message || data.error || `HTTP ${r.status}`);
  return data;
}
async function init() {
  try {
    const l = await adminApi('/flash-sales'); sale = l.sales && l.sales[0] && l.sales[0].id;
  const o = sale && (await api('/flash-sales/' + sale));
    if (!o || !o.items) return ($('#out').textContent = 'Chưa có sale hoặc chưa warmup (trang Admin).');
    $('#prod').innerHTML = o.items.map((i) => `<option value="${i.productId}">${i.name} (kho ${i.remaining})</option>`).join('');
  } catch (e) {
    $('#out').textContent = 'Không tải được dữ liệu: ' + e.message + '. Hãy mở Admin trước để nhập ADMIN_API_KEY.';
  }
}
async function verify(pid, n = 0) {
  const [s, o] = await Promise.all([adminApi(`/admin/sales/${sale}/stats`), adminApi('/flash-sales/' + sale)]);
  const st = s.items.find((i) => i.product_id == pid), it = o.items.find((i) => i.productId == pid);
  const busy = s.queue.waiting + s.queue.active;
  $('#verify').innerHTML = `Đơn <b>confirmed</b> trong DB: <b>${st.confirmed}</b> / kho ban đầu ${it.initialStock} → ${st.confirmed > it.initialStock ? '🚨 OVERSELL!' : '✅ Không oversell'} · queue còn ${busy} job`;
  if (n < 20 && (busy > 0 || n < 2)) setTimeout(() => verify(pid, n + 1), 1000);
}
$('#run').onclick = async () => {
  const pid = $('#prod').value; $('#out').textContent = 'Đang chạy…';
  try {
    const r = await adminApi('/admin/simulate', { method: 'POST', body: { saleId: sale, productId: pid, users: +$('#users').value } });
    const x = r.result; if (!x) return ($('#out').textContent = 'Lỗi giả lập');
  $('#out').innerHTML = `${r.users} người trong <b>${r.ms}ms</b> (~${r.rps} req/s)<br>✅ Giữ hàng thành công: <b>${x.success}</b><br>Hết hàng: ${x.OUT_OF_STOCK} · Khác: ${x.USER_LIMIT_EXCEEDED + x.OTHER}`;
    verify(pid);
  } catch (e) {
    $('#out').textContent = 'Lỗi giả lập: ' + e.message;
  }
};
init();
