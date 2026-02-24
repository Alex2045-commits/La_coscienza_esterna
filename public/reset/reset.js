
document.addEventListener('DOMContentLoaded', () => {
    const resetPasswordBtn = document.getElementById('resetPasswordBtn');
    resetPasswordBtn.addEventListener('click', submitPassword);

    const errorMessage = document.getElementById('error-message');
    const successMessage = document.getElementById('success-message');

    function getTokenFromURL() {
        return new URLSearchParams(window.location.search).get('token');
    }

    async function submitPassword() {
        const password = document.getElementById('password').value.trim();
        const token = getTokenFromURL();

        errorMessage.style.display = 'none';
        successMessage.style.display = 'none';

        if (!password) {
            errorMessage.textContent = "Inserisci la nuova password.";
            errorMessage.style.display = 'block';
            return;
        }
        if (!token) {
            errorMessage.textContent = "Token mancante. Controlla il link dell'email.";
            errorMessage.style.display = 'block';
            return;
        }

        resetPasswordBtn.disabled = true;
        resetPasswordBtn.textContent = "Caricamento...";

        try {
            const res = await fetch("http://localhost:8000/api/reset_password.php", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token, password })
            });

            const data = await res.json();

            if (data.ok) {
                successMessage.textContent = data.message;
                successMessage.style.display = 'block';
                setTimeout(() => {
                    window.location.href = "/login/login.html";
                }, 2000);
            } else {
                errorMessage.textContent = data.message;
                errorMessage.style.display = 'block';
            }
        } catch (e) {
            console.error(e);
            errorMessage.textContent = "Errore nella comunicazione con il server.";
            errorMessage.style.display = 'block';
        } finally {
            resetPasswordBtn.disabled = false;
            resetPasswordBtn.textContent = "Continua";
        }
    }
});