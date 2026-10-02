let sale =
  +new URLSearchParams(location.search).get('sale');

let off = 0;
let start = 0;
let end = 0;

const msgs = {};

const hms = (ms) => {
  const s = Math.max(
    0,
    Math.floor(ms / 1000)
  );

  return [
    (s / 3600) | 0,
    ((s / 60) % 60) | 0,
    s % 60
  ]
    .map((v) =>
      String(v).padStart(2, '0')
    )
    .join(':');
};


const ERR = {
  OUT_OF_STOCK:
    'Hết hàng rồi 😢',

  USER_LIMIT_EXCEEDED:
    'Bạn đã mua đủ số lượng cho phép',

  TOO_MANY_REQUESTS:
    'Thao tác quá nhanh, chờ chút nhé',

  UNAUTHENTICATED:
    'Bạn cần đăng nhập trước.',

  ORDER_NOT_FOUND:
    'Không tìm thấy đơn hàng.'
};


/*
 * =========================
 * USER UI
 * =========================
 */

function renderAuthArea() {

  const area =
    $('#auth-area');

  if (!area) return;

  const user =
    getCurrentUser();

  const token =
    getToken();


  if (!token || !user) {

    area.innerHTML = `
      <a href="/login.html">
        🔐 Đăng nhập
      </a>
    `;

    return;
  }


  area.innerHTML = `
    <span style="margin-right:10px">
      👤 Xin chào,
      <strong>${user.username}</strong>
    </span>

    ${
      user.role === 'admin'
        ? `
          <a
            href="/admin.html"
            style="margin-right:10px"
          >
            ⚙️ Quản trị
          </a>
        `
        : ''
    }

    <button
      id="logout-btn"
      type="button"
    >
      Đăng xuất
    </button>
  `;


  const logoutButton =
    $('#logout-btn');


  if (logoutButton) {

    logoutButton.onclick = () => {

      clearToken();

      clearCurrentUser();

      window.location.href =
        '/login.html';
    };

  }
}


/*
 * =========================
 * LOAD FLASH SALE
 * =========================
 */

async function tick() {

  if (!sale) {

    const r =
      await api('/flash-sales');

    sale =
      r.sales &&
      r.sales[0] &&
      r.sales[0].id;
  }


  if (!sale) {

    $('#items').textContent =
      'Chưa có flash sale. Hãy chạy: npm run seed';

    return;
  }


  const r =
    await api(
      '/flash-sales/' + sale
    );


  if (!r.success) {

    $('#items').textContent =
      'Flash sale chưa được nạp kho. Vào trang Admin bấm "Warmup".';

    return;
  }


  off =
    r.serverTime - Date.now();

  start =
    +r.sale.startTime;

  end =
    +r.sale.endTime;


  $('#title').textContent =
    r.sale.name;


  $('#items').innerHTML =
    r.items.map((i) => {

      const pct =
        i.initialStock
          ? Math.round(
              (i.remaining /
                i.initialStock) *
              100
            )
          : 0;


      return `
        <div class="card">

          <div class="emoji">
            🎧
          </div>

          <h3>
            ${i.name}
          </h3>

          <div class="price">
            ${vnd(i.salePrice)}
          </div>

          <div class="bar">
            <i
              style="width:${pct}%"
            ></i>
          </div>

          <small>
            Còn ${i.remaining}/${i.initialStock}
            · tối đa ${i.limitPerUser}/người
          </small>

          <button
            data-p="${i.productId}"
            ${i.remaining <= 0
              ? 'disabled'
              : ''}
          >
            ${
              i.remaining <= 0
                ? 'Hết hàng'
                : 'Mua ngay'
            }
          </button>

          <div class="msg">
            ${
              msgs[i.productId] || ''
            }
          </div>

        </div>
      `;

    }).join('');
}


/*
 * =========================
 * BUY PRODUCT
 * =========================
 */

async function buy(p) {

  /*
   * Kiểm tra đăng nhập trước
   */

  const token =
    getToken();

  const user =
    getCurrentUser();


  if (!token || !user) {

    msgs[p] =
      '🔐 Bạn cần đăng nhập để mua hàng.';

    await tick();

    setTimeout(() => {
      window.location.href =
        '/login.html';
    }, 700);

    return;
  }


  msgs[p] =
    '⏳ Đang giữ hàng…';


  await tick();


  try {

    const r =
      await api(
        `/flash-sales/${sale}/products/${p}/buy`,
        {
          method: 'POST',

          body: {
            quantity: 1
          }
        }
      );


    if (r.success) {

      msgs[p] =
        '⏳ Đã giữ hàng, đang xử lý đơn…';

      await tick();

      poll(
        p,
        r.orderId
      );

    } else {

      msgs[p] =
        '❌ ' +
        (
          ERR[r.error] ||
          r.error ||
          'Lỗi'
        );

      await tick();
    }

  } catch (error) {

    console.error(
      '[buy]',
      error
    );

    msgs[p] =
      '❌ ' +
      (
        error.message ||
        'Không thể mua hàng.'
      );

    await tick();
  }
}


/*
 * =========================
 * POLL ORDER
 * =========================
 */

async function poll(
  p,
  id,
  n = 0
) {

  try {

    const r =
      await api(
        '/orders/' + id
      );


    if (r.order) {

      if (
        r.order.status ===
        'confirmed'
      ) {

        msgs[p] =
          '✅ Đặt hàng thành công!';

      } else if (
        r.order.status ===
        'failed'
      ) {

        msgs[p] =
          '❌ Đơn thất bại';

      } else {

        msgs[p] =
          '⏳ Đơn hàng đang xử lý…';
      }


      await tick();

      /*
       * Nếu vẫn pending thì tiếp tục poll
       */

      if (
        r.order.status === 'pending' &&
        n < 30
      ) {

        setTimeout(
          () =>
            poll(
              p,
              id,
              n + 1
            ),
          500
        );
      }

      return;
    }


    if (n < 30) {

      setTimeout(
        () =>
          poll(
            p,
            id,
            n + 1
          ),
        500
      );
    }

  } catch (error) {

    console.error(
      '[poll order]',
      error
    );
  }
}


/*
 * =========================
 * BUY BUTTON
 * =========================
 */

$('#items').onclick =
  (e) => {

    const productId =
      e.target.dataset.p;

    if (!productId) {
      return;
    }

    buy(productId);
  };


/*
 * =========================
 * COUNTDOWN
 * =========================
 */

setInterval(() => {

  const now =
    Date.now() + off;


  $('#count').textContent =
    !end

      ? '--:--:--'

      : now < start

        ? 'Bắt đầu sau ' +
          hms(start - now)

        : now < end

          ? 'Kết thúc sau ' +
            hms(end - now)

          : 'Đã kết thúc';

}, 1000);


/*
 * =========================
 * INITIALIZE
 * =========================
 */

renderAuthArea();

tick();

setInterval(
  tick,
  2000
);