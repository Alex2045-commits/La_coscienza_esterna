const username = document.getElementById("username");
const email = document.getElementById("email");
const password = document.getElementById("password");
const btn = document.getElementById("registerBtn");
const form = document.getElementById("registerForm");
const error = document.getElementById("error");
const ok = document.getElementById("ok");
const toggle = document.querySelector(".toggle-password");

async function blockIfAlreadyLogged() {
  try {
    const res = await fetch("http://localhost:8000/api/session_status.php", {
      method: "GET",
      credentials: "include",
      cache: "no-store"
    });
    if (!res.ok) return;
    const payload = await res.json().catch(() => null);
    if (!payload || !payload.authenticated || !payload.user || !payload.user.id) return;
    const me = payload.user;
    window.location.href = me.role === "admin"
      ? `${window.location.origin}/admin/admin_dashboard.php`
      : `${window.location.origin}/user/user_dashboard.html`;
  } catch (_) {
    // ignore
  }
}

function validPassword(pwd) {
  if (pwd.length < 8) return false;
  if (!/[a-zA-Z]/.test(pwd)) return false;
  if (!/\d/.test(pwd)) return false;
  return true;
}

async function reg(event) {
  event.preventDefault();
  error.textContent = "";
  ok.textContent = "";

  const u = username.value.trim();
  const e = email.value.trim();
  const p = password.value;

  if (!u || !e || !p) {
    error.textContent = "Compila tutti i campi.";
    return;
  }
  if (!validPassword(p)) {
    error.textContent = "Password debole: minimo 8 caratteri con almeno una lettera e un numero.";
    return;
  }

  btn.classList.add("loading");
  btn.disabled = true;

  try {
    const res = await fetch("http://localhost:8000/api/register.php", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: u, email: e, password: p })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      error.textContent = data.error || `Errore: ${res.status}`;
      return;
    }

    const userId = Number(data.user_id || 0);
    if (data.verify_required && userId > 0) {
      localStorage.setItem("register_verify_user_id", String(userId));
      ok.textContent = "Registrazione completata. Verifica email in corso...";
      setTimeout(() => { window.location.href = "/auth/register_verify.html"; }, 900);
      return;
    }

    ok.textContent = "Registrazione completata. Reindirizzamento al login...";
    setTimeout(() => { window.location.href = "/login/login.html"; }, 1200);
  } catch (e2) {
    console.error(e2);
    error.textContent = "Impossibile contattare il server.";
  } finally {
    btn.classList.remove("loading");
    btn.disabled = false;
  }
}

if (toggle) {
  toggle.addEventListener("click", () => {
    const show = password.type === "password";
    password.type = show ? "text" : "password";
    toggle.textContent = show ? "Nascondi" : "Mostra";
  });
}

form?.addEventListener("submit", reg);
blockIfAlreadyLogged();
