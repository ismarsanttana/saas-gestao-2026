const API = import.meta.env.VITE_API_URL;

export async function apiFetch(path: string, init: RequestInit = {}, withAuth = true) {
  const headers = new Headers(init.headers || {});
  headers.set('Content-Type', 'application/json');

  const token = sessionStorage.getItem('access_token') || '';
  if (withAuth && token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${API}${path}`, {
    ...init,
    headers,
    credentials: 'include'
  });

  if (res.status === 401) {
    sessionStorage.removeItem('access_token');
    window.dispatchEvent(new CustomEvent('app:unauthorized'));
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `HTTP ${res.status}`);
  }

  const ct = res.headers.get('Content-Type') || '';
  if (ct.includes('application/json')) return res.json();
  return res.text();
}
