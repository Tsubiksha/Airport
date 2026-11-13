const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function apiFetch(path, options = {}) {
  const url = `${API_URL}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    let errMsg = `Request failed: ${res.status}`;
    try {
      const err = await res.json();
      errMsg = err.detail || JSON.stringify(err) || errMsg;
    } catch {}
    throw new Error(errMsg);
  }
  return res.json();
}
