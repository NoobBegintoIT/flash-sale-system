const $ = (s) => document.querySelector(s);
const userId = () => localStorage.getItem('uid') || (localStorage.setItem('uid', 'user-' + Math.random().toString(36).slice(2, 7)), localStorage.getItem('uid'));
const vnd = (n) => Number(n).toLocaleString('vi-VN') + '₫';
async function api(url, opt = {}) {
  const r = await fetch('/api' + url, { method: opt.method || 'GET', headers: { 'Content-Type': 'application/json', 'x-user-id': userId() }, body: opt.body ? JSON.stringify(opt.body) : undefined });
  return { status: r.status, ...(await r.json().catch(() => ({}))) };
}
