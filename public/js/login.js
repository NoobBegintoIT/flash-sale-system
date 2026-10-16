const form = document.getElementById('login-form');

const usernameInput =
  document.getElementById('username');

const passwordInput =
  document.getElementById('password');

const loginButton =
  document.getElementById('login-button');

const errorMessage =
  document.getElementById('error-message');

const togglePassword =
  document.getElementById('toggle-password');


function showError(message) {
  errorMessage.textContent = message;
  errorMessage.classList.add('show');
}


function hideError() {
  errorMessage.textContent = '';
  errorMessage.classList.remove('show');
}


togglePassword.addEventListener('click', () => {
  const isPassword =
    passwordInput.type === 'password';

  passwordInput.type =
    isPassword ? 'text' : 'password';

  togglePassword.textContent =
    isPassword ? 'Ẩn' : 'Hiện';
});


form.addEventListener('submit', async (event) => {
  event.preventDefault();

  hideError();

  const username =
    usernameInput.value.trim();

  const password =
    passwordInput.value;

  if (!username || !password) {
    showError(
      'Vui lòng nhập username/email và mật khẩu.'
    );

    return;
  }

  loginButton.disabled = true;

  loginButton.innerHTML = `
    <span class="loading">
      <span class="spinner"></span>
      Đang đăng nhập...
    </span>
  `;

  try {
    const response = await fetch(
      '/api/auth/login',
      {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json'
        },

        body: JSON.stringify({
          username,
          password
        })
      }
    );

    const data =
      await response.json().catch(() => ({}));

    if (!response.ok || !data.success) {
      throw new Error(
        data.message ||
        data.error ||
        'Đăng nhập thất bại.'
      );
    }

    // Lưu JWT
    setToken(data.token);

    // Lưu thông tin user
    setCurrentUser(data.user);

    console.log('[login] Đăng nhập thành công:', {
      username: data.user.username,
      role: data.user.role
    });

    // Điều hướng theo role
    if (data.user.role === 'admin') {
      window.location.href = '/admin.html';
      return;
    }

    window.location.href = '/index.html';

  } catch (error) {
    console.error('[login]', error);

    showError(
      error.message ||
      'Không thể đăng nhập.'
    );

    loginButton.disabled = false;
    loginButton.textContent = 'Đăng nhập';
  }
});


/*
 * Nếu đã đăng nhập rồi,
 * tự chuyển đến trang tương ứng.
 */
const existingToken = getToken();
const existingUser = getCurrentUser();

if (existingToken && existingUser) {

  if (existingUser.role === 'admin') {
    window.location.href = '/admin.html';
  } else {
    window.location.href = '/index.html';
  }

}