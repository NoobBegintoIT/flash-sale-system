async function login(username, password) {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      username,
      password
    })
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(
      data.message ||
      data.error ||
      'Đăng nhập thất bại.'
    );
  }

  setToken(data.token);
  setCurrentUser(data.user);

  return data;
}


function logout() {
  clearToken();
  clearCurrentUser();

  window.location.href = '/';
}


function isLoggedIn() {
  return Boolean(getToken());
}


function currentUser() {
  return getCurrentUser();
}