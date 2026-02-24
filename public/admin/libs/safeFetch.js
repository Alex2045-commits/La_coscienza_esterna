export async function safeFetch(url, options = {}) {
  try {
    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-CSRF-Token": getCookie("csrf_token"), // aggiungi CSRF
      ...(options.headers || {})
    };

    const res = await fetch(url, {
      ...options,
      headers,
      credentials: "include"
    });

    const data = await res.json();

    if (res.status === 401 || data?.error === 'AUTH_REQUIRED') {
      window.location.href = '/login/login.html';
      return null;
    }

    if (data?.error === 'ADMIN_ONLY') {
      alert("Accesso riservato agli admin.");
      return null;
    }

    return data;
  } catch (e) {
    console.error('Errore fetch:', e);
    return null;
  }
}