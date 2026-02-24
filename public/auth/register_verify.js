document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("verifyForm");
  const codeInput = document.getElementById("code");
  const resendBtn = document.getElementById("resendBtn");
  const err = document.getElementById("error");
  const ok = document.getElementById("ok");

  const userId = Number(localStorage.getItem("register_verify_user_id") || 0);
  if (!userId) {
    window.location.href = "/login/login.html";
    return;
  }

  function setMsg(error = "", success = "") {
    err.textContent = error;
    ok.textContent = success;
  }

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    setMsg();
    const code = String(codeInput.value || "").trim();
    if (!/^\d{6}$/.test(code)) {
      setMsg("Inserisci un codice valido di 6 cifre.");
      return;
    }

    try {
      const res = await fetch("http://localhost:8000/api/register_verify.php", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, code })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setMsg(data.error || "Verifica fallita.");
        return;
      }
      localStorage.removeItem("register_verify_user_id");
      setMsg("", "Email verificata. Reindirizzamento al login...");
      setTimeout(() => {
        window.location.href = "/login/login.html";
      }, 900);
    } catch (e2) {
      setMsg("Errore di connessione al server.");
    }
  });

  resendBtn?.addEventListener("click", async () => {
    setMsg();
    resendBtn.disabled = true;
    try {
      const res = await fetch("http://localhost:8000/api/register_verify.php", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, resend: true })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setMsg(data.error || "Impossibile reinviare il codice.");
        return;
      }
      setMsg("", "Codice reinviato.");
    } catch (e2) {
      setMsg("Errore di connessione al server.");
    } finally {
      setTimeout(() => {
        resendBtn.disabled = false;
      }, 1200);
    }
  });
});
