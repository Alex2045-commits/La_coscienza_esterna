window.onload = function() {
  const preLoader = document.getElementById('preLoader');
  if (preLoader) preLoader.classList.add('hidden');
};

document.addEventListener("DOMContentLoaded", async () => {
  const APP_ORIGIN = window.location.origin;
  const API_BASE = `${APP_ORIGIN}/api`;
  const btn = document.getElementById("btnVerify2FA");
  const input = document.getElementById("code");
  const err = document.getElementById("error");
  const USER_DASHBOARD_URL = `${APP_ORIGIN}/user/user_dashboard.html`;

  function clampLevel(n) {
    const v = Number(n || 1);
    if (!Number.isFinite(v)) return 1;
    return Math.max(1, Math.min(4, Math.floor(v)));
  }

  function getUnlockedLevelForUser(userId) {
    const uid = Number(userId || 0);
    if (!uid) return 1;
    const keys = [
      `eov_unlocked_level_u${uid}`,
      `eov_unlocked_level_user_${uid}`,
      "eov_unlocked_level",
      "eov_unlocked_level_guest"
    ];
    let best = 1;
    keys.forEach((k) => {
      const lv = clampLevel(localStorage.getItem(k));
      if (lv > best) best = lv;
    });
    localStorage.setItem(`eov_unlocked_level_u${uid}`, String(best));
    return best;
  }

  async function waitForSessionReady(maxAttempts = 6, delayMs = 220) {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const res = await fetch(`${API_BASE}/me.php`, {
          method: "GET",
          credentials: "include",
          cache: "no-store"
        });
        if (res.ok) {
          const me = await res.json().catch(() => null);
          if (me && me.id) return me;
        }
      } catch (_) {}
      await new Promise((r) => setTimeout(r, delayMs));
    }
    return null;
  }

  /* ================= CHECK SESSION 2FA ================= */
  try {
    const check = await fetch(`${API_BASE}/check_2fa_session.php`, {
      method: "GET",
      credentials: "include"
    });
    const json = await check.json();

    if (!check.ok || !json.ok || !json.twofa_required) {
      // sessione 2FA mancante o scaduta → login
      location.href = "/login/login.html";
      return;
    }

  } catch (e) {
    console.error("Errore check session 2FA:", e);
    location.href = "/login/login.html";
    return;
  }

  /* ================= TIMEOUT LATO CLIENT (60s) ================= */
  const TFA_TIMEOUT = 60; // secondi
  let remaining = TFA_TIMEOUT;
  const interval = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      clearInterval(interval);
      alert("Tempo per completare 2FA scaduto!");
      location.href = "/login/login.html";
    }
  }, 1000);

  /* ================= VERIFICA CODICE 2FA ================= */
  btn.addEventListener("click", async () => {
    err.textContent = "";
    const code = input.value.trim();

    if (!/^\d{6}$/.test(code)) {
      err.textContent = "Codice non valido";
      return;
    }

    btn.disabled = true;

    try {
      const res = await fetch(`${API_BASE}/verify_2fa.php`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code })
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        switch(json.error) {
          case "2FA_EXPIRED":
          case "2FA_SESSION_MISSING":
            err.textContent = "Sessione 2FA scaduta o mancante. Rifare il login.";
            setTimeout(() => location.href = "/login/login.html", 2000);
            break;
          case "INVALID_2FA_CODE":
            err.textContent = "Codice 2FA errato.";
            break;
          default:
            err.textContent = json.error || "Errore sconosciuto";
        }
        return;
      }

      // ✅ Login completato → resume utente / dashboard admin
      clearInterval(interval);
      localStorage.removeItem('login_role'); // pulisci
      const me = await waitForSessionReady();
      if (!me) {
        err.textContent = "Sessione non pronta. Riprova.";
        return;
      }
      if (me.role === 'admin') {
        location.href = `${APP_ORIGIN}/admin/admin_dashboard.php`;
      } else {
        location.href = USER_DASHBOARD_URL;
      }

    } catch (e) {
      console.error(e);
      err.textContent = "Errore di connessione. Riprova.";
    } finally {
      btn.disabled = false;
    }
  });
});
window.addEventListener("pageshow", e => {
  if (e.persisted) location.reload();
});
