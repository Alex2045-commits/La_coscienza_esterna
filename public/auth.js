// ===============================
// AUTH + SAFE FETCH HELPERS
// ===============================
const APP_ORIGIN = window.location.origin;
const API_BASE = `${APP_ORIGIN}/api`;

// Recupera cookie
function getCookie(name) {
  return document.cookie
    .split("; ")
    .find(c => c.startsWith(name + "="))
    ?.split("=")[1] || null;
}

// Safe fetch con CSRF token, JWT e cookie di sessione
async function safeFetch(url, options = {}) {
  if (!url.startsWith("http") && !url.startsWith("/")) {
    url = `${API_BASE}/${url}`;
  }

  const csrfToken =
    getCookie("csrf_token") ||
    document.querySelector('meta[name="csrf-token"]')?.getAttribute("content") ||
    "";

  const authToken = localStorage.getItem("auth_token_jwt") || "";

  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json; charset=utf-8",
    ...(csrfToken && { "X-CSRF-Token": csrfToken }),
    ...(authToken && { Authorization: `Bearer ${authToken}` }),
    ...(options.headers || {})
  };

  return fetch(url, {
    ...options,
    credentials: "include",
    mode: "cors",
    headers
  });
}

// Controlla se l'utente e loggato
async function checkLogin() {
  try {
    const res = await safeFetch(`${API_BASE}/me.php`);
    if (!res.ok) {
      const savedToken = localStorage.getItem("auth_token");
      if (savedToken) {
        return JSON.parse(savedToken);
      }
      return null;
    }

    const user = await res.json();
    if (user && user.id) {
      localStorage.setItem("auth_token", JSON.stringify(user));
    }
    return user;
  } catch (e) {
    console.error("Login check error:", e);
    const savedToken = localStorage.getItem("auth_token");
    return savedToken ? JSON.parse(savedToken) : null;
  }
}

// Verifica ruolo specifico
async function authCheck(requiredRole = null) {
  const user = await checkLogin();
  if (!user) return null;

  if (requiredRole && user.role !== requiredRole) {
    if (requiredRole === "user" && user.role === "admin") {
      return user;
    }
    return null;
  }

  return user;
}

// Logout
async function logout() {
  try {
    const res = await safeFetch(`${API_BASE}/logout.php`, {
      method: "POST"
    });
    if (res.ok) {
      document.cookie = "csrf_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;";
      window.location.href = `${APP_ORIGIN}/login/login.html`;
    }
  } catch (e) {
    console.error("Logout error:", e);
    window.location.href = `${APP_ORIGIN}/login/login.html`;
  }
}

// Require admin
async function requireAdmin() {
  const user = await authCheck("admin");
  return user ? { status: "ok", ...user } : { status: "unauth" };
}

// Espone helper globali
window.safeFetch = safeFetch;
window.getCookie = getCookie;
window.checkLogin = checkLogin;
window.authCheck = authCheck;
window.logout = logout;
window.requireAdmin = requireAdmin;
