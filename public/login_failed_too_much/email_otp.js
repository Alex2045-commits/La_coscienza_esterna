// email_otp.js
document.addEventListener("DOMContentLoaded", () => {
  const APP_ORIGIN = window.location.origin;
  const API_BASE = `${APP_ORIGIN}/api`;
  const form = document.getElementById("emailOtpForm");
  const input = document.getElementById("emailOtpInput");
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

  if (!form || !input || !err) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    err.textContent = "";

    const code = input.value.trim();
    if (!code) {
      err.textContent = "Inserisci il codice ricevuto via email";
      return;
    }

    // Recupera user_id da localStorage e convertilo in numero
    const userId = parseInt(window.localStorage.getItem("otp_user_id"), 10);
    if (!userId) {
      err.textContent = "Stato utente mancante, riprova il login";
      return;
    }

    try {
      console.log("Invio conferma 2FA:", { code, userId });

      const res = await fetch(`${API_BASE}/confirm_2fa.php`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, user_id: userId })
      });

      const json = await res.json();
      console.log("Verifica OTP email:", json);

      if (!res.ok || !json.ok) {
        err.textContent = json.error || "Codice non valido";
        return;
      }

      // Pulizia localStorage dopo conferma
      localStorage.removeItem("otp_user_id");

      // Se utente ha TOTP → vai al 2FA normale
      if (json.twofa_required) {
        localStorage.setItem('login_role', json.role);
        window.location.href = `${APP_ORIGIN}/auth/2fa.html`;
        return;
      }

      // Login completo → resume utente / dashboard admin
      const role = json.role || 'user';
      if (role === 'admin') {
        window.location.href = `${APP_ORIGIN}/admin/admin_dashboard.php`;
      } else {
        window.location.href = USER_DASHBOARD_URL;
      }

    } catch (e) {
      console.error(e);
      err.textContent = "Errore di connessione al server";
    }
  });
});
