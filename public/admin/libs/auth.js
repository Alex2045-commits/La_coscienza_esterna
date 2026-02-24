// ===============================
// AUTH + SAFE FETCH + COOKIE HELPERS
// ===============================

// ✅ Recupera cookie
export function getCookie(name) {
  return document.cookie
    .split("; ")
    .find(c => c.startsWith(name + "="))
    ?.split("=")[1] || null;
}

// ✅ Imposta cookie (opzionale)
export function setCookie(name, value, options = {}) {
  let cookieStr = `${name}=${value}; path=${options.path || "/"}; samesite=${options.samesite || "Lax"}`;
  if (options.secure) cookieStr += "; secure";
  if (options.httponly) cookieStr += "; httponly";
  if (options.expires) cookieStr += `; expires=${new Date(options.expires).toUTCString()}`;
  document.cookie = cookieStr;
}

// ===============================
// SAFE FETCH (gestione cookie + produzione)
// ===============================
export async function safeFetch(url, options = {}) {
  return fetch(url, {
    ...options,
    credentials: "include", // ESSENZIALE per inviare cookie
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
}

// ===============================
// REQUIRE ADMIN
// ===============================
export async function requireAdmin() {
    try {
        const res = await fetch("/api/me.php", {
            credentials: "include"
        });

        if (!res.ok) return { status: "unauth" };
        const user = await res.json();
        return { status: "ok", ...user };
    } catch (e) {
        console.error("Auth error", e);
        return { status: "unauth" };
    }
}

// ===============================
// INIT DASHBOARD
// ===============================
export function initDashboard() {
  // Qui metti tutte le funzioni di init della dashboard
  // esempio:
  if (typeof bindMenu === "function") bindMenu();
  if (typeof showSection === "function") showSection("home");
  if (typeof initAdminWS === "function") initAdminWS();
  if (typeof initSecurityRealtime === "function") initSecurityRealtime();

  console.log("Dashboard inizializzata per admin:", window.CURRENT_ADMIN?.username);
}

// ===============================
// INIZIALIZZAZIONE AUTOMATICA
// ===============================

// helper DOM
export const el  = s => document.querySelector(s);
export const els = s => [...document.querySelectorAll(s)];

// ===============================
// BIND LOGOUT MODAL
// ===============================
export function bindLogout() {
  const btn = document.querySelector("#btnLogout");
  const modal = document.querySelector("#logoutModal");

  if (!btn) return console.warn("btnLogout non trovato");
  if (!modal) return console.warn("logoutModal non trovato");

  const confirmBtn = document.querySelector("#confirmLogout");
  const cancelBtn = document.querySelector("#cancelLogout");
  const overlay = modal.querySelector(".modal-overlay");

  if (!confirmBtn || !cancelBtn || !overlay) {
    console.warn("Elementi modal mancanti", { confirmBtn, cancelBtn, overlay });
    return;
  }

  let lastFocused = null;

  const openModal = () => {
    lastFocused = document.activeElement;
    modal.classList.remove("hidden");
    document.body.style.overflow = "hidden";
    cancelBtn.focus();
  };

  const closeModal = () => {
    modal.classList.add("hidden");
    document.body.style.overflow = "";
    lastFocused?.focus();
  };

  // Apri modal
  btn.addEventListener("click", () => {
    openModal();
  });

  // Chiudi modal
  cancelBtn.addEventListener("click", () => {
    closeModal();
  });
  overlay.addEventListener("click", () => {
    closeModal();
  });

  // Conferma logout
  confirmBtn.addEventListener("click", async () => {
    closeModal();

    try {
      const res = await fetch("http://localhost:8000/api/logout.php", {
        method: "POST",
        credentials: "include",
        keepalive: true
      });
      if (!res.ok) throw new Error("Logout failed");
      window.location.replace("http://localhost:4000/login/login.html");
    } catch (e) {
      console.error("Errore logout:", e);
      // In alcuni browser il redirect puo' interrompere la fetch, ma il logout lato server e' gia' eseguito.
      window.location.replace("http://localhost:4000/login/login.html");
    }
  });

  // ESC + focus trap
  modal.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      closeModal();
      return;
    }

    if (e.key === "Tab") {
      const focusables = [cancelBtn, confirmBtn];
      const i = focusables.indexOf(document.activeElement);
      if (e.shiftKey && i === 0) { e.preventDefault(); focusables.at(-1).focus(); }
      else if (!e.shiftKey && i === focusables.length - 1) { e.preventDefault(); focusables[0].focus(); }
    }
  });

}



export async function logout() {
  try{
    const res = await fetch("http://localhost:8000/api/logout.php", {
      method: "POST",
      credentials: "include"
    });

    if (!res.ok) throw new Error("Logout failed");

    window.location.replace("http://localhost:4000/login/login.html");
  } catch (e) {
    console.error("Errore logout:", e);
    alert("Errore imprevisto durante il logout");
  }
}

// Nota: init e bind vengono gestiti da public/admin/admin_dashboard.js
// per evitare doppie inizializzazioni e doppi listener.

// ===============================
// 🔐 Prevent BFCache (back button)
// ===============================
window.addEventListener("pageshow", function (event) {
  if (
    event.persisted ||
    performance.getEntriesByType("navigation")[0]?.type === "back_forward"
  ) {
    window.location.reload();
  }
});

// ===============================
// FINE AUTH.JS
// ===============================
