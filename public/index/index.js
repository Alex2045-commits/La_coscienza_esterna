const API_BASE = window.location.origin;
const LEVEL_URLS = {
  1: `${window.location.origin}/game/livello0/livello_0.html`,
  2: `${window.location.origin}/game/livello1/livello1.html`,
  3: `${window.location.origin}/game/livello2/livello2.html`,
  4: `${window.location.origin}/game/livello3/livello3.html`
};
let CURRENT_USER = null;
let CURRENT_UNLOCKED_LEVEL = 1;

function unlockedKeyForUser(userId) {
  return `eov_unlocked_level_u${userId}`;
}

function legacyUnlockedKeys(userId) {
  return [
    unlockedKeyForUser(userId),
    `eov_unlocked_level_user_${userId}`,
    "eov_unlocked_level",
    "eov_unlocked_level_guest"
  ];
}

function redirectToOfflineGame() {
  window.location.href = `${window.location.origin}/gameOffline/offline.html`;
}

async function performLogout() {
  try {
    await fetch(`${API_BASE}/api/logout.php`, {
      method: "POST",
      credentials: "include"
    });
  } catch (e) {
    console.warn("logout error:", e);
  } finally {
    window.location.href = `${window.location.origin}/index/index.html`;
  }
}

function clampUnlockedLevel(level) {
  const parsed = Number(level || 1);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.min(4, Math.floor(parsed)));
}

async function getLoggedUser() {
  const jwt = localStorage.getItem("auth_token_jwt") || "";
  try {
    const res = await fetch(`${API_BASE}/api/session_status.php`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: {
        ...(jwt ? { Authorization: `Bearer ${jwt}` } : {})
      }
    });
    if (!res.ok) {
      // fallback me.php
      const meRes = await fetch(`${API_BASE}/api/me.php`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: {
          ...(jwt ? { Authorization: `Bearer ${jwt}` } : {})
        }
      });
      if (!meRes.ok) return null;
      const me = await meRes.json().catch(() => null);
      return (me && me.id) ? me : null;
    }
    const payload = await res.json().catch(() => null);
    if (!payload || !payload.authenticated || !payload.user || !payload.user.id) {
      const meRes = await fetch(`${API_BASE}/api/me.php`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: {
          ...(jwt ? { Authorization: `Bearer ${jwt}` } : {})
        }
      });
      if (!meRes.ok) return null;
      const me = await meRes.json().catch(() => null);
      return (me && me.id) ? me : null;
    }
    return payload.user;
  } catch (e) {
    console.warn("session_status non disponibile:", e);
    try {
      const meRes = await fetch(`${API_BASE}/api/me.php`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: {
          ...(jwt ? { Authorization: `Bearer ${jwt}` } : {})
        }
      });
      if (!meRes.ok) return null;
      const me = await meRes.json().catch(() => null);
      return (me && me.id) ? me : null;
    } catch (_) {
      return null;
    }
  }
}

function readUnlockedLevel(user) {
  if (!user || !user.id) return 1;
  const keys = legacyUnlockedKeys(user.id);
  let best = 1;
  keys.forEach((k) => {
    const v = clampUnlockedLevel(localStorage.getItem(k));
    if (v > best) best = v;
  });

  // Migra sempre verso la chiave utente corrente
  localStorage.setItem(unlockedKeyForUser(user.id), String(best));
  return best;
}

function updateHubUI(user, unlockedLevel) {
  const hubStatus = document.getElementById("hubStatus");
  const levelButtons = document.querySelectorAll(".level-btn[data-level]");
  const startAreaLabel = document.querySelector(".start-area span");
  if (!hubStatus || !levelButtons.length) return;

  if (!user) {
    hubStatus.textContent = "Accedi per abilitare il salvataggio livelli.";
    if (startAreaLabel) startAreaLabel.textContent = "Inizia la Storia";
    levelButtons.forEach((btn) => {
      const lvl = Number(btn.dataset.level || 1);
      btn.disabled = lvl !== 1;
    });
    return;
  }

  hubStatus.textContent = `Accesso: ${user.username} | Sbloccato fino al livello ${unlockedLevel}`;
  if (startAreaLabel) {
    startAreaLabel.textContent = unlockedLevel >= 2 ? "Continua Avventura" : "Inizia la Storia";
  }
  levelButtons.forEach((btn) => {
    const lvl = Number(btn.dataset.level || 1);
    btn.disabled = lvl > unlockedLevel;
  });
}

function updateAuthButtons(user) {
  const primaryLink = document.getElementById("authPrimaryLink");
  const primaryBtn = document.getElementById("btnAuthPrimary");
  const secondaryLink = document.getElementById("authSecondaryLink");
  const secondaryBtn = document.getElementById("btnAuthSecondary");
  if (!primaryLink || !primaryBtn || !secondaryLink || !secondaryBtn) return;

  if (!user) {
    primaryLink.href = "../login/login.html";
    primaryBtn.textContent = "Accedi";
    secondaryLink.href = "../register/register.html";
    secondaryBtn.textContent = "Registrati";
    secondaryBtn.onclick = null;
    return;
  }

  primaryLink.href = user.role === "admin"
    ? `${window.location.origin}/admin/admin_dashboard.php`
    : `${window.location.origin}/user/user_dashboard.html`;
  primaryBtn.textContent = "Dashboard";

  secondaryLink.href = "#";
  secondaryBtn.textContent = "Logout";
  secondaryBtn.onclick = async (ev) => {
    ev.preventDefault();
    await performLogout();
  };
}

function bindHubEvents(user, unlockedLevel) {
  document.querySelectorAll(".level-btn[data-level]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const level = Number(btn.dataset.level || 1);
      if (!user) {
        redirectToOfflineGame();
        return;
      }
      if (level > unlockedLevel) return;
      const target = LEVEL_URLS[level];
      if (target) window.location.href = target;
    });
  });
}

// Funzione richiesta dal markup
async function startGame() {
  if (!CURRENT_USER) {
    redirectToOfflineGame();
    return;
  }
  if (CURRENT_UNLOCKED_LEVEL >= 2) {
    const target = LEVEL_URLS[CURRENT_UNLOCKED_LEVEL] || LEVEL_URLS[2];
    window.location.href = target;
    return;
  }
  const target = LEVEL_URLS[1];
  window.location.href = target;
}
window.startGame = startGame;

window.onload = async function () {
  const preLoader = document.getElementById("preLoader");
  if (preLoader) preLoader.classList.add("hidden");
  document.body.classList.remove("loading");

  const user = await getLoggedUser();
  const unlockedLevel = readUnlockedLevel(user);
  CURRENT_USER = user;
  CURRENT_UNLOCKED_LEVEL = unlockedLevel;
  updateAuthButtons(user);
  updateHubUI(user, unlockedLevel);
  bindHubEvents(user, unlockedLevel);
};

document.body.classList.add("loading");

function full() {
  window.open("index.html", "", "fullscreen=yes, scrollbars=no, width=100%, height=100%");
}
window.full = full;

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch((error) => {
      console.error("Errore nel registrare il Service Worker:", error);
    });
  });
}

window.addEventListener("pageshow", (e) => {
  if (e.persisted) location.reload();
});
