let sale;

async function adminApi(url, opt = {}) {
  const token = getToken();
  const user = getCurrentUser();

  if (!token || !user) {
    window.location.href = '/login.html';
    throw new Error('Chưa đăng nhập.');
  }

  if (user.role !== 'admin') {
    window.location.href = '/index.html';
    throw new Error('Bạn không có quyền Admin.');
  }

  const r = await fetch('/api' + url, {
    method: opt.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: opt.body
      ? JSON.stringify(opt.body)
      : undefined
  });

  const data = await r.json().catch(() => ({}));

  if (r.status === 401) {
    clearToken();
    clearCurrentUser();
    window.location.href = '/login.html';
    throw new Error('Phiên đăng nhập đã hết hạn.');
  }

  if (r.status === 403) {
    throw new Error('Bạn không có quyền Admin.');
  }

  if (!r.ok || data.success === false) {
    throw new Error(
      data.message ||
      data.error ||
      `HTTP ${r.status}`
    );
  }

  return data;
}

async function init() {
  try {
    const l = await adminApi('/flash-sales');

    sale = l.sales && l.sales[0] && l.sales[0].id;

    const o = sale
      ? await adminApi('/flash-sales/' + sale)
      : null;

    if (!o || !o.items) {
      $('#out').textContent =
        'Chưa có sale hoặc chưa warmup (trang Admin).';
      return;
    }

    $('#prod').innerHTML = o.items
      .map(
        (i) =>
          `<option value="${i.productId}">
            ${i.name} (kho ${i.remaining})
          </option>`
      )
      .join('');
  } catch (e) {
    console.error('[simulate:init]', e);

    $('#out').textContent =
      'Không tải được dữ liệu: ' +
      e.message +
      '. Kiểm tra đăng nhập Admin và server.';
  }
}

async function verify(pid, n = 0) {
  try {
    const [s, o] = await Promise.all([
      adminApi(`/admin/sales/${sale}/stats`),
      adminApi('/flash-sales/' + sale)
    ]);

    const st = s.items.find(
      (i) => i.product_id == pid
    );

    const it = o.items.find(
      (i) => i.productId == pid
    );

    if (!st || !it) {
      $('#verify').textContent =
        'Không tìm thấy dữ liệu sản phẩm.';
      return;
    }

    const busy =
      s.queue.waiting +
      s.queue.active;

    $('#verify').innerHTML =
      `Đơn <b>confirmed</b> trong DB: ` +
      `<b>${st.confirmed}</b> / ` +
      `kho ban đầu ${it.initialStock} → ` +
      `${
        st.confirmed > it.initialStock
          ? '🚨 OVERSELL!'
          : '✅ Không oversell'
      } ` +
      `· queue còn ${busy} job`;

    if (
      n < 20 &&
      (busy > 0 || n < 2)
    ) {
      setTimeout(
        () => verify(pid, n + 1),
        1000
      );
    }
  } catch (e) {
    console.error('[simulate:verify]', e);
    $('#verify').textContent =
      'Không thể kiểm tra kết quả: ' +
      e.message;
  }
}

$('#run').onclick = async () => {
  const pid = $('#prod').value;

  $('#out').textContent =
    'Đang chạy…';

  try {
    const r = await adminApi(
      '/admin/simulate',
      {
        method: 'POST',
        body: {
          saleId: sale,
          productId: pid,
          users: +$('#users').value
        }
      }
    );

    const x = r.result;

    if (!x) {
      $('#out').textContent =
        'Lỗi giả lập';
      return;
    }

    $('#out').innerHTML =
      `${r.users} người trong ` +
      `<b>${r.ms}ms</b> ` +
      `(~${r.rps} req/s)<br>` +
      `✅ Giữ hàng thành công: ` +
      `<b>${x.success}</b><br>` +
      `Hết hàng: ${x.OUT_OF_STOCK} · ` +
      `Khác: ${
        x.USER_LIMIT_EXCEEDED +
        x.OTHER
      }`;

    verify(pid);
  } catch (e) {
    console.error('[simulate:run]', e);

    $('#out').textContent =
      'Lỗi giả lập: ' +
      e.message;
  }
};

init();