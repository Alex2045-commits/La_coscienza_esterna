const LOGIN_PAGE_URL = 'http://localhost:4000/login/login.html';
let CURRENT_ACCOUNT = null;

function redirectToLogin() {
    window.location.href = LOGIN_PAGE_URL;
}

async function requireLoggedAccount() {
    try {
        const res = await fetch('http://localhost:8000/api/me.php', {
            method: 'GET',
            credentials: 'include'
        });
        if (res.status === 401 || !res.ok) {
            redirectToLogin();
            return null;
        }
        const user = await res.json().catch(() => null);
        if (!user || !user.id) {
            redirectToLogin();
            return null;
        }
        return user;
    } catch (e) {
        console.warn('requireLoggedAccount error', e);
        redirectToLogin();
        return null;
    }
}

function navigateToLevel() {
    if (!CURRENT_ACCOUNT || !CURRENT_ACCOUNT.id) {
        redirectToLogin();
        return;
    }
    // Ottiene il valore selezionato dal menu a tendina e reindirizza l'utente alla pagina corrispondente
    var selectedLevel = document.getElementById('levelSelect').value;
    window.location.href = selectedLevel; // Reindirizzamento al livello selezionato
}

function ensureGlobalGameActions() {
    if (!document.getElementById('globalGameActionsStyle')) {
        const style = document.createElement('style');
        style.id = 'globalGameActionsStyle';
        style.textContent = `
            #globalGameActions {
                position: fixed;
                top: 14px;
                left: 14px;
                z-index: 100002;
                display: flex;
                gap: 8px;
            }
            #globalGameActions .game-action-btn {
                border: 1px solid rgba(255,255,255,0.26);
                border-radius: 10px;
                padding: 9px 13px;
                background: linear-gradient(135deg, rgba(18,25,40,0.92), rgba(36,58,92,0.82));
                color: #f2f8ff;
                font-weight: 700;
                letter-spacing: 0.2px;
                cursor: pointer;
                box-shadow: 0 8px 22px rgba(0, 0, 0, 0.3);
                backdrop-filter: blur(4px);
                transition: transform .15s ease, box-shadow .2s ease, filter .2s ease;
            }
            #globalGameActions .game-action-btn:hover {
                transform: translateY(-1px);
                filter: brightness(1.08);
                box-shadow: 0 12px 26px rgba(0, 0, 0, 0.38);
            }
        `;
        document.head.appendChild(style);
    }
    if (document.getElementById('globalGameActions')) return;
    const wrap = document.createElement('div');
    wrap.id = 'globalGameActions';

    const mkBtn = (label) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = label;
        b.className = 'game-action-btn';
        return b;
    };

    const homeBtn = mkBtn('Home');
    homeBtn.onclick = () => {
        window.location.href = 'http://localhost:4000/index/index.html';
    };

    const logoutBtn = mkBtn('Logout');
    logoutBtn.onclick = async () => {
        try {
            await fetch('http://localhost:8000/api/logout.php', {
                method: 'POST',
                credentials: 'include'
            });
        } catch (e) {}
        window.location.href = 'http://localhost:4000/index/index.html';
    };

    wrap.appendChild(homeBtn);
    wrap.appendChild(logoutBtn);
    document.body.appendChild(wrap);
}

window.addEventListener("load", async function () {
    const user = await requireLoggedAccount();
    if (!user) return;
    CURRENT_ACCOUNT = user;
    ensureGlobalGameActions();
    const preLoader = document.getElementById("preLoader");
    preLoader.classList.add("hidden");
});
