// =============================
// XP SYSTEM INTEGRATO PER IL GIOCO
// =============================

// effetto grafico +XP
function showFloatingXP(text, color = "yellow") {
    const el = document.createElement("div");
    el.textContent = text;

    el.style.position = "absolute";
    el.style.left = "50%";
    el.style.top = "200px";
    el.style.transform = "translateX(-50%)";
    el.style.color = color;
    el.style.fontSize = "32px";
    el.style.fontWeight = "bold";
    el.style.textShadow = "2px 2px 5px black";
    el.style.opacity = "1";
    el.style.transition = "all 1.5s ease-out";
    el.style.pointerEvents = "none";

    document.body.appendChild(el);

    setTimeout(() => {
        el.style.top = "120px";
        el.style.opacity = "0";
    }, 100);

    setTimeout(() => el.remove(), 1600);
}


// SafeFetch (usato anche nel gioco)
async function gameFetch(url, opts = {}) {
    opts.credentials = "include";
    opts.headers = opts.headers || {};

    // richieste POST → CSRF
    if (opts.method && opts.method !== "GET") {
        const match = document.cookie.match(/(^| )csrf_token=([^;]+)/);
        if (match) opts.headers["X-CSRF-Token"] = match[2];
    }

    let res = await fetch(url, opts);

    // se token scaduto → tenta refresh
    if (res.status === 401) {
        const refresh = await fetch("refresh.php", {
            method: "POST",
            credentials: "include",
        });

        if (refresh.ok)
            res = await fetch(url, opts);
    }

    return res;
}


// funzione globale da chiamare quando un evento di gioco produce progresso
async function giveXP(action = "monster_kill") {
    if (!action || typeof action !== "string") return;
    if (!window.__EOV_RUN_TOKEN) window.__EOV_RUN_TOKEN = null;

    try {
        const res = await gameFetch("http://localhost:8000/api/user/gain_xp.php", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                action,
                stage: 0,
                run_token: window.__EOV_RUN_TOKEN
            })
        });

        const data = await res.json();

        // errori lato server → no cheating
        if (!data.ok) {
            console.warn("Errore XP:", data.error);
            return;
        }
        if (data.run_token && typeof data.run_token === "string") {
            window.__EOV_RUN_TOKEN = data.run_token;
        }

        // effetto
        showFloatingXP(`+${data.xpEarned || 0} XP`);

        // livello aumentato?
        if (data.levels_gained > 0) {
            showFloatingXP(`LEVEL UP! (${data.new_level})`, "gold");
        }

        console.log("XP gained:", data.xpEarned || 0);
        console.log("Level now:", data.new_level);

    } catch (err) {
        console.error("XP ERROR", err);
    }
}

