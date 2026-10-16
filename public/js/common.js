const $ = (s) => document.querySelector(s);


function getToken() {
  return localStorage.getItem('flash_access_token');
}


function setToken(token) {
  localStorage.setItem(
    'flash_access_token',
    token
  );
}


function clearToken() {
  localStorage.removeItem(
    'flash_access_token'
  );
}


function getCurrentUser() {
  const raw =
    localStorage.getItem('flash_user');

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}


function setCurrentUser(user) {
  localStorage.setItem(
    'flash_user',
    JSON.stringify(user)
  );
}


function clearCurrentUser() {
  localStorage.removeItem(
    'flash_user'
  );
}


/*
 * Giữ lại userId() để shop.js cũ
 * không bị lỗi nếu vẫn đang gọi hàm này.
 *
 * Nhưng ID này KHÔNG còn được gửi
 * lên server để xác thực.
 */
function userId() {
  const user = getCurrentUser();

  if (!user) {
    return null;
  }

  return String(user.id);
}


const vnd = (n) =>
  Number(n).toLocaleString('vi-VN') + '₫';


async function api(url, opt = {}) {

  const headers = {
    'Content-Type': 'application/json',
    ...(opt.headers || {})
  };


  const token = getToken();

  if (token) {
    headers.Authorization =
      `Bearer ${token}`;
  }


  const r = await fetch(
    '/api' + url,
    {
      method: opt.method || 'GET',

      headers,

      body: opt.body
        ? JSON.stringify(opt.body)
        : undefined
    }
  );


  const data =
    await r.json().catch(() => ({}));


  /*
   * JWT hết hạn / không hợp lệ
   */
  if (r.status === 401) {

    clearToken();
    clearCurrentUser();

    window.location.href =
      '/login.html';

    throw new Error(
      'Phiên đăng nhập đã hết hạn.'
    );
  }


  return {
    status: r.status,
    ...data
  };
}