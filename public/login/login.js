window.onload = () => {
  const preLoader = document.getElementById('preLoader');
  if (preLoader) preLoader.classList.add('hidden');
};

document.addEventListener("DOMContentLoaded", () => {
  const APP_ORIGIN = window.location.origin;
  const API_BASE = `${APP_ORIGIN}/api`;
  const btn = document.getElementById("btnLogin");
  const identifierInput = document.getElementById("identifier");
  const passwordInput = document.getElementById("password");
  const togglePasswordBtn = document.getElementById("togglePasswordBtn");
  const err = document.getElementById("error");
  const USER_DASHBOARD_URL = `${APP_ORIGIN}/user/user_dashboard.php`;

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

  function redirectAfterLogin(user) {
    if (!user || user.role === "admin") {
      window.location.href = `${APP_ORIGIN}/admin/admin_dashboard.php`;
      return;
    }
    window.location.href = USER_DASHBOARD_URL;
  }

  async function blockIfAlreadyLogged() {
    try {
      const res = await fetch(`${API_BASE}/session_status.php`, {
        method: "GET",
        credentials: "include",
        cache: "no-store"
      });
      if (!res.ok) return;
      const payload = await res.json().catch(() => null);
      if (!payload || !payload.authenticated || !payload.user || !payload.user.id) return;
      redirectAfterLogin(payload.user);
    } catch (_) {
      // ignore
    }
  }

    /* ================= PASSWORD DIMENTICATA ================= */
  const forgotBtn = document.getElementById("forgotPasswordBtn");
  if (forgotBtn) {
    forgotBtn.addEventListener('click', async () => {
      const username = prompt("Inserisci il tuo username o email:");
      if (!username) return;

      forgotBtn.disabled = true;
      const err = document.getElementById("error");

      try {
        const res = await fetch(`${API_BASE}/forgot_password.php`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username })
        });

        const json = await res.json();
        console.log("Risposta reset password:", json);

        if (!res.ok || !json.ok) {
          // Usa sia 'error' che 'message' per compatibilità con PHP
          err.textContent = json.error || json.message || "Errore durante l'invio dell'email";
        } else {
          alert("Email di reset inviata correttamente (controlla la tua casella)");
        }

      } catch (e) {
        console.error(e);
        err.textContent = "Errore invio reset password: " + e.message;
      } finally {
        forgotBtn.disabled = false;
      }
    });
  }


  /* ================= FETCH CON TIMEOUT ================= */
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
      } catch (e) {
        // retry
      }
      await new Promise(r => setTimeout(r, delayMs));
    }
    return null;
  }

  /* ================= LOGIN ================= */
  async function login(event) {
    event.preventDefault();
    if (btn.disabled) return;

    err.textContent = "";
    btn.disabled = true;

    const identifier = identifierInput.value.trim();
    const password = passwordInput.value.trim();

    if (!identifier || !password) {
      err.textContent = "Inserisci username/email e password";
      btn.disabled = false;
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/login.php`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password })
      });

      const json = await res.json().catch(() => ({}));
      console.log("Risposta del server:", json);

      if (!res.ok || !json.ok) {
        if (json.error === "EMAIL_NOT_VERIFIED" && Number(json.user_id || 0) > 0) {
          localStorage.setItem("register_verify_user_id", String(Number(json.user_id)));
          window.location.href = "/auth/register_verify.html";
          return;
        }
        err.textContent = json.error || "Login fallito";
        return;
      }

      /* ================= EMAIL OTP STEP-UP ================= */
      if (json.email_verification_required) {
        // salva user_id per email_otp.js
        localStorage.setItem("otp_user_id", json.user_id);
        window.location.href = `${APP_ORIGIN}/login_failed_too_much/email_otp.html`;
        return;
      }

      /* ================= LOGIN ADMIN → 2FA ================= */
      if (json.twofa_required) {
        // Salva il ruolo per la pagina 2FA
        localStorage.setItem('login_role', json.role);
        window.location.href = `${APP_ORIGIN}/auth/2fa.html`;
        return;
      }

      /* ================= LOGIN NORMALE - REINDIRIZZA A DASHBOARD ================= */
      const me = await waitForSessionReady();
      if (!me) {
        err.textContent = "Sessione non pronta. Riprova tra un secondo.";
        return;
      }

      redirectAfterLogin(me);

    } catch (e) {
      console.error(e);
      err.textContent = e.message === "TIMEOUT"
        ? "Timeout: il server non risponde"
        : "Errore di connessione al server";
    } finally {
      btn.disabled = false;
    }
  }

  /* ================= SUBMIT FORM ================= */
  const loginForm = document.getElementById("loginForm");
  if (loginForm) {
    loginForm.addEventListener("submit", login);
  }

  if (togglePasswordBtn && passwordInput) {
    togglePasswordBtn.addEventListener("click", () => {
      const isHidden = passwordInput.type === "password";
      passwordInput.type = isHidden ? "text" : "password";
      togglePasswordBtn.textContent = isHidden ? "Nascondi" : "Mostra";
    });
  }

  blockIfAlreadyLogged();
});

window.addEventListener("pageshow", e => {
  if (e.persisted) location.reload();
});
