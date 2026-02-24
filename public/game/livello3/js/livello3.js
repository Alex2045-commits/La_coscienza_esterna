const LOGIN_PAGE_URL = '/login/login.html';
let CURRENT_ACCOUNT = null;
const FINAL_ARC_CHAPTERS = (window.EOV_STORY_BIBLE?.chapters || []).filter((c) => c.id >= 4);

function redirectToLogin() {
    window.location.href = LOGIN_PAGE_URL;
}

async function requireLoggedAccount() {
    try {
        const res = await fetch('/api/me.php', {
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
        window.location.href = '/index/index.html';
    };

    const logoutBtn = mkBtn('Logout');
    logoutBtn.onclick = async () => {
        try {
            await fetch('/api/logout.php', {
                method: 'POST',
                credentials: 'include'
            });
        } catch (e) {}
        window.location.href = '/index/index.html';
    };

    wrap.appendChild(homeBtn);
    wrap.appendChild(logoutBtn);
    document.body.appendChild(wrap);
}

function renderNarrativeHub() {
    if (document.getElementById('narrativeHubPanel')) return;

    const panel = document.createElement('section');
    panel.id = 'narrativeHubPanel';
    panel.style.cssText = "max-width:920px;margin:24px auto 0 auto;padding:18px 22px;border:1px solid rgba(255,255,255,0.2);border-radius:12px;background:rgba(8,12,20,0.72);color:#e8eef8;font-family:'Courier New',monospace;line-height:1.45;";

    const title = document.createElement('h2');
    title.textContent = "Arco Finale - La Coscienza Esterna";
    title.style.cssText = "margin:0 0 12px 0;font-size:1.1rem;letter-spacing:0.6px;";
    panel.appendChild(title);

    const list = document.createElement('div');
    if (FINAL_ARC_CHAPTERS.length === 0) {
        list.textContent = "Capitoli finali in preparazione.";
    } else {
        FINAL_ARC_CHAPTERS.forEach((ch) => {
            const row = document.createElement('article');
            row.style.cssText = "padding:10px 0;border-top:1px solid rgba(255,255,255,0.08);";
            row.innerHTML = `
                <div style="font-weight:700;color:#c9d8ff;">Capitolo ${ch.id} - ${ch.title}</div>
                <div style="color:#a7b7d8;">Tema: ${ch.theme}</div>
                <div style="margin-top:6px;color:#dbe6ff;">${(ch.beats || []).join(" ")}</div>
            `;
            list.appendChild(row);
        });
    }
    panel.appendChild(list);

    document.body.appendChild(panel);
}

window.addEventListener("load", async function () {
    const user = await requireLoggedAccount();
    if (!user) return;
    CURRENT_ACCOUNT = user;
    ensureGlobalGameActions();
    renderNarrativeHub();
    const preLoader = document.getElementById("preLoader");
    preLoader.classList.add("hidden");
});
