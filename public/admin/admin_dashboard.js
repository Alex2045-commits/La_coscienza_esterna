// ===================================================
// Admin Dashboard — La Coscienza Esterna (CLEAN VERSION)
// ===================================================

import { requireAdmin, bindLogout, initDashboard, safeFetch, logout } from "./libs/auth.js";

// Evita che le pagine protette siano salvate nella cache
if ('serviceWorker' in navigator) {
  // non usare service worker qui, ma blocco normale:
  window.history.replaceState({}, document.title, window.location.href);
}

const selectPageBtn = document.getElementById("selectPage");
const pageInput = document.getElementById("pageInput");

function jumpToPage() {
    const totalPages = Math.ceil(allSecurityLogs.length / SECURITY_ROWS_PER_PAGE);
    const page = parseInt(pageInput.value);

    if (isNaN(page) || page < 1 || page > totalPages) {
        alert("Pagina non valida. Inserisci un numero tra 1 e " + (totalPages || 1));
        return;
    }

    renderSecurityPage(page);
    pageInput.value = ""; // opzionale: pulisce l'input dopo il salto
}

// click sul bottone
selectPageBtn.addEventListener("click", jumpToPage);

// invio da tastiera nell'input
pageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        jumpToPage();
    }
});

// Inserisci subito nel DOM, prima di qualsiasi script che mostra notifiche
const globalNotifContainer = document.createElement('div');
globalNotifContainer.id = 'globalToastContainer';
globalNotifContainer.style.position = 'fixed';
globalNotifContainer.style.top = '20px';
globalNotifContainer.style.right = '20px';
globalNotifContainer.style.display = 'flex';
globalNotifContainer.style.flexDirection = 'column';
globalNotifContainer.style.gap = '10px';
globalNotifContainer.style.zIndex = 99999;
globalNotifContainer.style.pointerEvents = 'none'; // click passa attraverso
document.body.appendChild(globalNotifContainer);

let alertCount = 0;
let securityLogsByDay = {};
let bufferedSecurityLogs = {};
let displayedSecurityIds = new Set();

async function simulateAttack(event) {
  try {
    const res = await fetch('/admin/api/security_simulate.php', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event })
    });

    const data = await res.json();

    if (!res.ok) {
      console.error('Errore simulazione:', data);
      showNotification(`❌ ${data.error || 'Errore simulazione'}`);
      return;
    }

    // ✅ Marca il log come simulazione
    const simulatedLog = data.log || { event };
    simulatedLog.simulation = true; 

    // Inserisci subito il log simulato nella tabella Security
    handleSecurityAlert(simulatedLog);

    showNotification(`⚠️ Simulato: ${event}`, 4000);

  } catch (e) {
    console.error(e);
    showNotification('❌ Errore di rete');
  }
}

function appendSecurityTestLine(text, kind = "warn") {
  const box = document.getElementById("securityTestOutput");
  if (!box) return;
  const line = document.createElement("div");
  line.className = `security-test-line ${kind}`;
  line.textContent = `[${new Date().toLocaleTimeString("it-IT")}] ${text}`;
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
}

async function runSecurityProbe({ label, url, method = "GET", body = null, expectedStatuses = [403] }) {
  const csrf = document.querySelector('meta[name="csrf-token"]')?.getAttribute("content") || "";
  const headers = {};
  if (method !== "GET") {
    headers["Content-Type"] = "application/json";
    headers["X-CSRF-Token"] = csrf;
  }

  try {
    const res = await fetch(url, {
      method,
      credentials: "include",
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
    const txt = await res.text();
    const shortTxt = (txt || "").slice(0, 220);
    if (expectedStatuses.includes(res.status)) {
      appendSecurityTestLine(`${label}: OK (status ${res.status}) -> ${shortTxt}`, "ok");
    } else {
      appendSecurityTestLine(`${label}: inatteso status ${res.status} -> ${shortTxt}`, "err");
    }
  } catch (e) {
    appendSecurityTestLine(`${label}: errore rete ${String(e)}`, "err");
  }
}

// ---------- Helpers ----------
const el  = s => document.querySelector(s);
const els = s => [...document.querySelectorAll(s)];
let CURRENT_ADMIN = null;
let SEEN_KEY = null;
let seenSecurityIds = new Set();
const badge = el("#alertBadge");

function toast(msg, type = "info", t = 2800) {
  const c = el("#toastContainer");
  if (!c) return;

  const d = document.createElement("div");
  d.textContent = msg;
  d.style.background = type === "error" ? "#dc2626" : "#111827";
  d.style.color = "#e5e7eb";
  d.style.padding = "10px 14px";
  d.style.marginTop = "8px";
  d.style.borderRadius = "8px";
  d.style.boxShadow = "0 6px 22px rgba(0,0,0,.6)";
  d.style.transition = "opacity .4s";

  c.appendChild(d);
  setTimeout(() => {
    d.style.opacity = "0";
    setTimeout(() => d.remove(), 400);
  }, t);
}

function playWarningSound(){
  el("#soundWarning")?.play().catch(()=>{});
}

// ---------- State ----------
let CURRENT_SECTION = "home";
let charts = { logs: null, security: null };

let USERS_STATE = {
  page: 1,
  perPage: 10,
  sortBy: "id",
  sortDir: "desc",
  q: "",
  role: "",
  showDeleted: false
};

// ===============================
// INIT (UNICO)
// ===============================
el("#securityAudit")?.addEventListener("click", e => {
  const row = e.target.closest("tr");
  if (!row) return;

  row.classList.remove("sec-new");
});

// Aggiorna la UI della tabella
function syncSecurityUI() {
  const rows = [...document.querySelectorAll("#securityAudit tr[data-id]")];

  rows.forEach(tr => {
    const id = tr.dataset.id;
    const log = bufferedSecurityLogs[id];
    if (!log) {
      tr.style.display = "none";
      return;
    }

    tr.classList.remove("sec-new", "sec-ok", "sec-warning", "sec-critical");

    const isSimulation = log.simulation === true || log.simulation === "true";
    const levelClass = securityLevel(log.event, isSimulation ? "simulation" : "real");
    tr.classList.add(levelClass);

    // ✅ Mostra comunque il log anche se segnato come letto
    const isNew = !seenSecurityIds.has(String(id));
    if(isNew) tr.classList.add("sec-new");
    tr.style.display = ""; // forza sempre visibile
  });

  // Aggiorna badge solo sui log non visti
  const unseenCount = rows.filter(r => r.classList.contains("sec-new")).length;
  alertCount = unseenCount;
  updateAlertBadge();
}

document.getElementById("alertBadge")?.addEventListener("click", () => {
    document.querySelectorAll("#securityAudit tr.sec-new").forEach(tr => {
        markSecurityAsRead(tr.dataset.id);
    });
});

async function loadSecurityMonthFull() {
  if (shouldResetSecurityChart()) {
    securityLogsByDay = {};
  }

  const csrfToken = document.querySelector('meta[name="csrf-token"]').getAttribute('content');
  console.log("Token letto da JS:", csrfToken);

  const res = await fetch('/admin/api/security_admin/security_logs_month_full.php?page=1', {
    method: 'GET',
    headers: {
        'X-CSRF-Token': csrfToken
    },
    credentials: 'include'
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    console.error("Errore fetch security logs:", error);
    toast("Security logs non disponibili", "error");
    return;
  }

  const payload = await res.json().catch(() => ({}));
  const logs = Array.isArray(payload.logs) ? payload.logs : [];
  const stats = (payload.stats && typeof payload.stats === "object") ? payload.stats : {};
  if (!Array.isArray(payload.logs)) {
    console.error("Payload security month non valido:", payload);
    toast("Security logs non disponibili", "error");
    return;
  }

  // ---- LOG ----
  logs.forEach(log => {
    bufferedSecurityLogs[log.id] = log;
    displayedSecurityIds.add(log.id);

    const day = log.created_at?.slice(0,10);
    if (day) {
      securityLogsByDay[day] ??= [];
      securityLogsByDay[day].push(log);
    }

    if (!log.read) alertCount++;
    else seenSecurityIds.add(String(log.id));
  });

  localStorage.setItem(SEEN_KEY, JSON.stringify([...seenSecurityIds]));

  updateAlertBadge();

  // ---- CHART ----
  const labels = generateMonthDays();
  const data = labels.map(d => stats[d] ?? 0);

  securityChartLabels = labels;
  securityChartData = data;

  if (charts.security) charts.security.destroy();

  charts.security = new Chart(el("#chartSecurity"), {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Eventi sicurezza",
        data,
        tension: 0.3,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false
    }
  });
}

function showSection(section) {
  CURRENT_SECTION = section;
  els(".section").forEach(s => s.classList.remove("active"));
  el(`#section-${section}`)?.classList.add("active");

  els(".menu-item").forEach(b => b.classList.remove("active"));
  el(`.menu-item[data-section='${section}']`)?.classList.add('active');

  if(section === "security"){
    document.querySelectorAll("#securityAudit tr[data-id]").forEach(tr => {
      seenSecurityIds.add(String(tr.dataset.id));
    });
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seenSecurityIds]));
    syncSecurityUI();

    const tbody = el("#securityAudit");
    if (tbody) {
        // ✅ Inserisci tutti i log buffered quando entri nella sezione
        Object.values(bufferedSecurityLogs).forEach(log => {
            insertBufferedLog(log);
        });
        syncSecurityUI();
    }
    return;
  }

  if (section === "home") loadStats();
  if (section === "overview") loadStats();
  if (section === "users") loadUsers();
}

document.addEventListener("click", e => {
  const btn = e.target.closest(".btn-ban");
  if (!btn) return;

  banFromSecurityRow({
    userId: btn.dataset.userId || null,
    ip: btn.dataset.ip || null
  });
});

window.banFromSecurityRow = async function({ userId, ip }) {
    const isValidUser = userId && Number(userId) > 0;

    // Consideriamo IP valido solo se non è loopback (::1 o 127.0.0.1)
    let isValidIp = false;
    if (ip && ip !== '—') {
        // IPv4 check
        if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip) && ip !== '127.0.0.1') isValidIp = true;
        // IPv6 check, escludendo loopback
        if (/^([0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}$/i.test(ip) && ip !== '::1') isValidIp = true;
    }

    if (!isValidUser && !isValidIp) {
        alert('❌ Nessun target da bannare');
        return;
    }

    let duration = prompt('Durata ban? (1h, 24h, 7d, perma)', '7d');
    if (!duration || !['1h','24h','7d','perma'].includes(duration)) {
        alert('Durata non valida');
        return;
    }

    const payload = {
        user_id: isValidUser ? Number(userId) : null,
        ip: isValidIp ? ip : null,  // invia solo IP valido
        duration,
        reason: 'Security alert (admin action)'
    };

    try {
        const res = await fetch('/admin/api/admin_ban_ip.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (data.ok) {
            showNotification(`🚫 Ban applicato a ${isValidUser ? 'user ' + userId : ''}${isValidIp ? ' IP ' + ip : ''}`, 4000);
        } else {
            alert('❌ Errore ban: ' + (data.error || 'unknown'));
        }
    } catch (e) {
        console.error(e);
        alert('❌ Errore di rete');
    }
};

// ===============================
// STATS
// ===============================
async function loadStats() {
  const r = await safeFetch("/admin/api/admin_stats.php");
  if (!r.ok) {  
    toast("Errore stats", "error");
    return;
  }

  const payload = await r.json().catch(() => ({}));
  const s = payload?.stats;
  if (!s || typeof s !== "object") {
    console.error("Payload stats non valido:", payload);
    toast("Statistiche non disponibili", "error");
    return;
  }
  console.log(s); // Verifica cosa ricevi dal server

  window.stats = s; // Salviamo i dati globalmente

  // HOME STATS
  const statTotalUsersHome = el("#statTotalUsersHome");
  const statSecurityAlertsHome = el("#statSecurityAlertsHome");
  
  if (statTotalUsersHome) {
    statTotalUsersHome.textContent = s.total_users;
    animateStatValue(statTotalUsersHome);
  }
  if (statSecurityAlertsHome) {
    statSecurityAlertsHome.textContent = alertCount;
  }

  // OVERVIEW STATS
  const statTotalUsers = el("#statTotalUsers");
  const statActiveUsers = el("#statActiveUsers");
  const statDeletedUsers = el("#statDeletedUsers");
  const statSecurityAlertsOverview = el("#statSecurityAlertsOverview");
  
  if (statTotalUsers) {
    statTotalUsers.textContent = s.total_users;
    animateStatValue(statTotalUsers);
  }
  if (statActiveUsers) {
    statActiveUsers.textContent = (s.active_now_users ?? s.active_users ?? 0);
    animateStatValue(statActiveUsers);
  }
  if (statDeletedUsers) {
    statDeletedUsers.textContent = s.deleted_users;
    animateStatValue(statDeletedUsers);
  }
  if (statSecurityAlertsOverview) {
    statSecurityAlertsOverview.textContent = alertCount;
  }
}

// Funzione per animare i valori delle stat
function animateStatValue(element) {
  element.style.animation = 'none';
  setTimeout(() => {
    element.style.animation = 'statBounce 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55)';
  }, 10);
}

document.addEventListener("DOMContentLoaded", async () => {
  // ================= CSRF =================
  const csrfToken = document.querySelector('meta[name="csrf-token"]').getAttribute('content');
  console.log("CSRF token:", csrfToken); // per debug

  // ================= AUTH =================
  const admin = await requireAdmin();
  if (!admin || admin.status === "unauth") return location.href = "/login/login.html";
  if (admin.status === "2fa") return location.href = "/login/2fa.html";

  const startGameBtn = document.getElementById("btnStartGameAdmin");
  if (startGameBtn) {
    startGameBtn.addEventListener("click", () => {
      window.location.href = "/user/user_dashboard.html";
    });
  }

  const goIndexBtn = document.getElementById("btnGoIndexAdmin");
  if (goIndexBtn) {
    goIndexBtn.addEventListener("click", () => {
      window.location.href = "/index/index.html";
    });
  }

  CURRENT_ADMIN = admin;
  el("#adminName").textContent = admin.username;

  // ================= UPDATE LAST ACTIVITY (heartbeat) =================
  async function updateLastActivity() {
    try {
      const updateRes = await fetchWithCSRF("/api/update_activity.php", {
        method: "POST"
      });
      if (updateRes.ok) {
        console.log("✅ Last activity updated");
      }
    } catch (e) {
      console.error("Failed to update activity:", e);
    }
  }

  // ping iniziale + heartbeat ogni 60s
  await updateLastActivity();
  const activityInterval = setInterval(() => {
    // evita ping quando tab non visibile
    if (document.visibilityState === "visible") {
      updateLastActivity();
    }
  }, 60 * 1000);

  window.addEventListener("beforeunload", () => clearInterval(activityInterval));

  // ================= SIDEBAR =================
  bindMenu();
  bindLogout();
  showSection("home");

  // ================= SECURITY STATE =================
  SEEN_KEY = `security_seen_ids_${CURRENT_ADMIN.id}`;
  seenSecurityIds = new Set(
    (JSON.parse(localStorage.getItem(SEEN_KEY) || "[]") || []).map(String)
  );

  // ================= FETCH DATA =================
  async function fetchWithCSRF(url, options = {}) {
    options.credentials = "include"; // necessario per sessione
    options.headers = {
      ...options.headers,
      "X-CSRF-Token": csrfToken,
    };
    return fetch(url, options);
  }

  // Users
  await loadUsers();
  // Stats
  await loadStats();
  // Security logs full
  await loadSecurityMonthFull();

  // ================= NOTIFICATIONS =================
  const ESSENTIAL_SECURITY_EVENTS = new Set([
    "failed_login",
    "login_failed",
    "bruteforce",
    "security_bruteforce",
    "sql_injection",
    "xss_attempt",
    "csrf_attempt",
    "lfi_attempt",
    "rce_attempt",
    "privilege_escalation",
    "account_takeover",
    "banned_user_action_attempt"
  ]);

  function isEssentialSecurityNotification(row) {
    const rawEvent = String(row?.event || "").trim().toLowerCase();
    if (!rawEvent) return false;

    const normalized = normalizeEvent(rawEvent);
    if (rawEvent === "anti_cheat_run_missing" || normalized === "anti_cheat_run_missing") {
      return false;
    }
    if (ESSENTIAL_SECURITY_EVENTS.has(rawEvent) || ESSENTIAL_SECURITY_EVENTS.has(normalized)) {
      return true;
    }

    // Tieni solo anti-cheat rilevante, ignora eventi gameplay normali.
    if (rawEvent.startsWith("anti_cheat_")) return true;
    if (rawEvent.includes("cheat")) return true;

    return false;
  }

  function pickEssentialNotifications(rows, limit) {
    const filtered = (Array.isArray(rows) ? rows : []).filter(isEssentialSecurityNotification);
    const toTs = (v) => Date.parse(String(v || "").replace(" ", "T")) || 0;
    const sorted = filtered.slice().sort((a, b) => toTs(b?.created_at) - toTs(a?.created_at));

    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const d = now.getDate();
    const isToday = (row) => {
      const ts = toTs(row?.created_at);
      if (!ts) return false;
      const dt = new Date(ts);
      return dt.getFullYear() === y && dt.getMonth() === m && dt.getDate() === d;
    };

    const today = sorted.filter(isToday);
    const older = sorted.filter((r) => !isToday(r));
    return today.concat(older).slice(0, limit);
  }

  async function loadNotifications(limitEl) {
    const limit = parseInt(limitEl?.value) || 10;
    const perPage = 500; // max consentito lato API
    const maxPages = 20; // guardrail
    const tbody = document.getElementById("notifTable");
    if (tbody) tbody.innerHTML = `<tr><td colspan="3" style="opacity:.75">Caricamento...</td></tr>`;

    try {
      const allRows = [];
      let page = 1;
      let totalPages = 1;

      do {
        const res = await fetchWithCSRF(`/admin/api/security_admin/list.php?page=${page}&per_page=${perPage}`);
        if (!res.ok) break;
        const data = await res.json().catch(() => ({}));
        const rows = Array.isArray(data.logs) ? data.logs : [];
        allRows.push(...rows);
        totalPages = Math.max(1, Number(data.total_pages || 1));
        page++;
      } while (page <= totalPages && page <= maxPages);

      if (allRows.length > 0) {
        const essentialRows = pickEssentialNotifications(allRows, limit);
        renderNotifications(essentialRows);
        return;
      }
    } catch (e) {
      console.warn("list.php notifications fallback:", e);
    }

    try {
      const fb = await fetchWithCSRF(`/admin/api/security_admin/security_logs_month_full.php?page=1`);
      if (!fb.ok) throw new Error(`fallback status ${fb.status}`);
      const data = await fb.json().catch(() => ({}));
      const rows = Array.isArray(data.logs) ? data.logs : [];
      renderNotifications(pickEssentialNotifications(rows, limit));
    } catch (e) {
      console.error("Errore caricamento notifiche admin:", e);
      if (tbody) tbody.innerHTML = `<tr><td colspan="3" style="color:#f87171">Errore caricamento notifiche</td></tr>`;
      toast("Errore caricamento notifiche admin", "error");
    }
  }

  const notifLimit = document.getElementById("notifLimit");
  if (notifLimit) {
    notifLimit.addEventListener("change", () => loadNotifications(notifLimit));
    loadNotifications(notifLimit);
  }

  function renderNotifications(rows) {
    const tbody = document.getElementById("notifTable");
    if (!tbody) return;
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="3" style="opacity:.7">Nessuna notifica sicurezza / anti-cheat essenziale</td></tr>`;
      return;
    }

    const isUnread = (row) => {
      const readVal = (typeof row?.read !== "undefined") ? row.read : row?.read_by_admin;
      const unread = (readVal === false || readVal === 0 || readVal === "0");
      if (!unread) return false;

      // "Nuova" solo se recente: evita di colorare tutto lo storico non letto
      const created = String(row?.created_at || "");
      const parsed = Date.parse(created.replace(" ", "T"));
      if (!Number.isFinite(parsed)) return false;
      const ageMs = Date.now() - parsed;
      return ageMs >= 0 && ageMs <= (15 * 60 * 1000);
    };

    tbody.innerHTML = rows.map(r => `
      <tr class="${isUnread(r) ? 'admin-notif-new' : ''}">
        <td>
          ${isUnread(r) ? '<span class="admin-notif-dot" aria-hidden="true"></span>' : '<span class="admin-notif-dot admin-notif-dot-hidden" aria-hidden="true"></span>'}
          <span>${r.event || "-"}</span>
        </td>
        <td>${r.ip || "-"}</td>
        <td>${r.created_at || "-"}</td>
      </tr>
    `).join("");
  }

  // ================= USERS FILTER =================
  const searchInput = el("#search");
  const roleSelect = el("#role");
  const showDeletedCheckbox = el("#showDeleted");
  
  if (searchInput) searchInput.addEventListener("keyup", () => loadUsers(1));
  if (roleSelect) roleSelect.addEventListener("change", () => loadUsers(1));
  if (showDeletedCheckbox) showDeletedCheckbox.addEventListener("change", () => loadUsers(1));

  // ================= SECURITY =================
  initSecurityRealtime();
  pruneOldSecurityLogs();
  syncSecurityUI();
  updateAlertBadge();
  await loadAllSecurityLogs();
  renderSecurityPage(1);
  updateSecurityPagination();

  // ================= BADGE =================
  if (badge) {
    badge.addEventListener("click", () => {
      document.querySelectorAll("#securityAudit tr.sec-new").forEach(tr => {
        const id = tr.dataset.id;
        if (!id) return;
        seenSecurityIds.add(String(id));
        tr.classList.remove("sec-new");
      });
      localStorage.setItem(SEEN_KEY, JSON.stringify([...seenSecurityIds]));
      alertCount = 0;
      updateAlertBadge();
    });
  }

  // ================= STATS =================
  await loadStats();

  // ================= AUTO-REFRESH PAGINA (ogni 5 minuti) =================
  setInterval(() => {
    location.reload();
  }, 5 * 60 * 1000); // 5 minuti = 300000 ms
});

// ===============================
// USERS
// ===============================
async function loadUsers(page = USERS_STATE.page) {
  USERS_STATE.page = page;
  USERS_STATE.q = el("#search")?.value || "";
  USERS_STATE.role = el("#role")?.value || "";
  USERS_STATE.showDeleted = el("#showDeleted")?.checked || false;

  const params = new URLSearchParams({
    q: USERS_STATE.q,
    role: USERS_STATE.role,
    page: USERS_STATE.page,
    per_page: USERS_STATE.perPage,
    sort_by: USERS_STATE.sortBy,
    sort_dir: USERS_STATE.sortDir,
    show_deleted: USERS_STATE.showDeleted ? 1 : 0
  });

  const r = await safeFetch(`/admin/api/admin_users.php?${params}`);
  if (!r.ok){
    toast("Errore utenti", "error");
    return;
  } 

  const j = await r.json();
  renderUsers(j.users || []);
}

function renderUsers(users) {
  const tb = el("#tab");
  if (!tb) return;

  if (!users || users.length === 0) {
    tb.innerHTML = `<tr><td colspan="6" style="text-align:center;opacity:0.7;">Nessun utente trovato</td></tr>`;
    return;
  }

  tb.innerHTML = users.map(u => {
    // Calcola il colore del badge security score
    const score = parseInt(u.security_score) || 0;
    let scoreBadgeClass = 'ok';
    if (score >= 50) scoreBadgeClass = 'danger';
    else if (score >= 30) scoreBadgeClass = 'warning';
    else if (score >= 10) scoreBadgeClass = 'info';

    // Formatta last_activity
    const lastActivity = u.last_activity ? new Date(u.last_activity).toLocaleString('it-IT') : '—';

    return `
      <tr class="${u.deleted_at ? 'deleted' : ''}" data-id="${u.id}">
        <td><strong>${u.username}</strong></td>
        <td>${u.email}</td>
        <td><span class="badge ${u.role === 'admin' ? 'danger' : 'info'}">${u.role}</span></td>
        <td><span class="badge ${scoreBadgeClass}">${score}</span></td>
        <td>${lastActivity}</td>
        <td class="actions">
          ${u.deleted_at
            ? `<button class="ghost" onclick="restoreUser(${u.id})">♻️ Ripristina</button>`
            : u.banned_until
              ? `
                <span class="ban-badge">🚫 ${remainingBan(u.banned_until)}</span>
                <button class="ghost danger" onclick="unbanUser(${u.id})">🔓 Sblocca</button>
              `
              : `
                <button class="ghost danger" onclick="deleteUser(${u.id})">🗑️ Elimina</button>
                <button class="ghost warning" onclick="banUser(${u.id})">🚫 Ban</button>
              `
          }
        </td>
      </tr>
    `;
  }).join("");
}

window.restoreUser = async id => {
  if (!confirm("Ripristinare questo account?")) return;

  await safeFetch("/admin/api/admin_user_action.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "restore", id })
  });

  toast("Utente ripristinato");
  loadUsers();
};

// ===============================
// LOGS
// ===============================
function logLevel(action){
  if (!action || typeof action !== "string") return "log-ok";

  if(action.includes("critical") || action.includes("brute") || action.includes("banned"))
    return "log-critical";
  if(action.includes("failed") || action.includes("warning"))
    return "log-warning";
  return "log-ok";
}

// ===============================
// SECURITY AUDIT
// ===============================

// Funzione di inserimento riga log (mantieni la tua attuale)
function insertBufferedLog(log, tbody = el("#securityAudit"), fromRender = false) {
    if (!log || displayedSecurityIds.has(log.id)) return;

    const tr = document.createElement("tr");
    tr.dataset.id = log.id;
    tr.dataset.created = log.created_at ?? new Date().toISOString();
    tr.dataset.event = log.event ?? "";
    tr.dataset.simulation = log.simulation ? "true" : "false";

    const levelClass = securityLevel(log.event, log.simulation ? "simulation" : "real");
    tr.classList.add(levelClass);

    const ipDisplay = normalizeIp(log.ip) || '—';
    const ipBan = normalizeIp(log.ip) || null;

    tr.innerHTML = `
        <td><span class="status-dot ${levelClass}"></span></td>
        <td>${log.user_id ?? "—"}</td>
        <td>${log.event}</td>
        <td>${ipDisplay}</td>
        <td>${log.created_at ?? new Date().toISOString()}</td>
        <td class="actions">
            <button onclick="banFromSecurityRow({ userId: '${log.user_id}', ip: '${ipBan}' })">🚫 Ban</button>
        </td>
    `;

    tr.addEventListener("click", () => markSecurityAsRead(log.id));

    tbody.appendChild(tr);
    displayedSecurityIds.add(log.id);

    if (!fromRender && !seenSecurityIds.has(String(log.id))) {
        alertCount++;
        updateAlertBadge();
    }
}

// ===============================
// ACTIONS
// ===============================
window.deleteUser = async id => {
  if (!confirm("Eliminare utente?")) return;
  try {
    const r = await safeFetch("/admin/api/admin_user_action.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id })
    });
    if (!r.ok) {
      toast("❌ Errore eliminazione", "error");
      return;
    }
    toast("🗑️ Utente eliminato", "info");
    loadUsers();
  } catch (e) {
    toast("❌ Errore: " + e.message, "error");
  }
};

window.setRole = async (id, role) => {
  await safeFetch("/admin/api/admin_user_action.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "role", id, role })
  });
  loadUsers();
};

function remainingBan(until){
  if (!until) return "n/a";

  // Forza UTC
  const now = new Date();
  const untilUtc = new Date(until + "Z"); // aggiunge Z = UTC
  const ms = untilUtc - now;

  if (ms <= 0) return "scaduto";

  const h = Math.floor(ms / 36e5);
  const d = Math.floor(h / 24);
  const m = Math.floor((ms % 36e5) / 6e4);

  return d > 0 ? `${d}g ${h%24}h` : `${h}h ${m}m`;
}

// ===============================
// SIDEBAR TOGGLE (☰)
// ===============================

const sidebar = document.getElementById("sidebar");
const toggle = document.getElementById("sidebarToggle");
const icon = toggle.querySelector("i");
const overlay = document.getElementById("overlay");

toggle.addEventListener("click", () => {
  const closed = sidebar.classList.toggle("closed");

  document.body.classList.toggle("sidebar-open", !closed);
  overlay.classList.toggle("active", !closed);

  // Micro-delay per animazione elegante
  setTimeout(() => {
    icon.classList.toggle("fa-bars", closed);
    icon.classList.toggle("fa-xmark", !closed);
  }, 120);
});

overlay.addEventListener("click", () => {
  sidebar.classList.add("closed");
  document.body.classList.remove("sidebar-open");
  overlay.classList.remove("active");

  setTimeout(() => {
    icon.classList.add("fa-bars");
    icon.classList.remove("fa-xmark");
  }, 120);
});

window.banUser = async (id) => {
  if (!id) {
    toast("⚠️ Utente non valido", "error");
    return;
  }

  const duration = prompt('Durata ban? (1h, 24h, 7d, perma)', '7d');
  if (!duration || !['1h', '24h', '7d', 'perma'].includes(duration)) {
    toast("⚠️ Durata non valida", "error");
    return;
  }

  try {
    const res = await safeFetch('/admin/api/admin_ban_user.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: id,
        duration,
        reason: 'Ban manuale da dashboard'
      })
    });

    const data = await res.json();

    if (!data.ok) {
      toast('❌ Errore ban: ' + (data.error || 'unknown'), "error");
      return;
    }

    toast(`🚫 Utente bannato fino a ${data.banned_until}`, "info");
    loadUsers();

  } catch (e) {
    toast('❌ Errore: ' + e.message, "error");
  }
};

window.banIp = function (ip) {
    if (!ip) return;

    const conferma = confirm(
        `⚠️ Sei sicuro di voler bannare l'IP:\n\n${ip}\n\nQuesta azione è manuale e irreversibile.`
    );

    if (!conferma) return;

    fetch('/admin/api/admin_ban_ip.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': window.csrfToken ?? ''
        },
        credentials: 'include',
        body: JSON.stringify({ ip })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            alert(`✅ IP ${ip} bannato con successo`);
        } else {
            alert(`❌ Errore: ${data.error || 'ban fallito'}`);
        }
    })
    .catch(err => {
        console.error(err);
        alert('❌ Errore di rete');
    });
};

window.unbanUser = async id => {
  if (!id) {
    toast("ID utente non valido", "error");
    return;
  }

  if (!confirm("Sbloccare questo utente?")) return;

  const r = await safeFetch("/admin/api/admin_unban_user.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id })
  });

  if (!r.ok) {
    const err = await r.json().catch(()=>({error:"Server error"}));
    toast(`Errore sblocco utente: ${err.error}`, "error");
    return;
  }

  toast("Utente sbloccato", "info");
  loadUsers();
};

// ===============================
// MENU
// ===============================
function bindMenu() {
  els(".menu-item").forEach(btn => {
    btn.addEventListener("click", () => {
      showSection(btn.dataset.section);

      // 📱 mobile: chiudi sidebar dopo click
      if (window.innerWidth < 900) {
        sidebar.classList.add("closed");
        overlay.classList.remove("active");
      }
    });
  });
}

function generateMonthDays() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0..10
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const labels = [];
  for (let d = 1; d <= daysInMonth; d++) {
    labels.push(`${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  return labels;
}

let securityChartLabels, securityChartData;

function customSecurityTooltip(context) {
  const tooltipElId = 'securityTooltip';
  let tooltipEl = document.getElementById(tooltipElId);

  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.id = tooltipElId;
    tooltipEl.style.position = 'absolute';
    tooltipEl.style.background = '#111';
    tooltipEl.style.color = '#fff';
    tooltipEl.style.padding = '10px';
    tooltipEl.style.borderRadius = '8px';
    tooltipEl.style.pointerEvents = 'none';
    tooltipEl.style.fontSize = '12px';
    tooltipEl.style.zIndex = '999';
    tooltipEl.style.maxWidth = '320px';
    document.body.appendChild(tooltipEl);
  }

  const tooltip = context.tooltip;

  if (tooltip.opacity === 0) {
    tooltipEl.style.opacity = 0;
    return;
  }

  const idx = tooltip.dataPoints[0].dataIndex;
  const day = securityChartLabels[idx];
  const logs = securityLogsByDay[day] || [];

  let html = `<b>${day}</b><br/>Totale: ${securityChartData[idx]}<hr/>`;

  if (logs.length === 0) {
    html += 'Nessun log disponibile';
  } else {
    logs.slice(0, 9).forEach(l => {
      html += `<div style="margin:2px 0;">
        <b>${l.event}</b><br/>
        <span style="color:#bbb">${l.created_at} | ${l.ip || '—'}</span>
      </div>`;
    });
    if (logs.length > 9) html += `<div style="color:#aaa;margin-top:4px;">+${logs.length-9} altri...</div>`;
  }

  tooltipEl.innerHTML = html;
  tooltipEl.style.opacity = 1;

  const chart = context.chart;
  const xScale = chart.scales.x;
  const yScale = chart.scales.y;

  // POSIZIONE: sopra l'asse X, non sopra il pallino
  const x = xScale.getPixelForValue(idx);
  const y = chart.chartArea.bottom;

  const canvasRect = chart.canvas.getBoundingClientRect();
  const tooltipWidth = tooltipEl.offsetWidth;
  const tooltipHeight = tooltipEl.offsetHeight;

  let left = canvasRect.left + x - tooltipWidth / 2;
  let top = canvasRect.top + y - tooltipHeight - 12; // sopra la X

  left = Math.max(8, Math.min(left, window.innerWidth - tooltipWidth - 8));
  top  = Math.max(8, Math.min(top, window.innerHeight - tooltipHeight - 8));

  tooltipEl.style.left = `${left}px`;
  tooltipEl.style.top = `${top}px`;
}

function updateChartWithLog(log) {
  const day = (log.created_at || "").split(" ")[0];
  const idx = securityChartLabels.indexOf(day);

  if (idx === -1) return;

  securityChartData[idx] += 1;

  charts.security?.update();
}

// 🗑️ Elimina singolo log e aggiorna la tabella (soft delete)
window.deleteLog = async function(id, btn) {
  if (!id) return;
  if (!confirm("Eliminare questo log?")) return;

  const csrfMatch = document.cookie.match(/csrf_token=([^;]+)/);
  const csrfToken = csrfMatch ? csrfMatch[1] : null;
  if (!csrfToken) {
    toast("Token CSRF mancante", "error");
    return;
  }

  try {
    const res = await safeFetch("/admin/api/admin_logs_action.php", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken
      },
      body: JSON.stringify({ action: "delete_one", id })
    });

    const data = await res.json();

    if (!data.ok || !data.deleted_log) {
      toast("Log non trovato o già eliminato", "error");
      return;
    }

    // Aggiorna solo la riga cliccata
    const row = btn?.closest("tr") || document.querySelector(`tr[data-id='${id}']`);
    if (!row) return;

    row.innerHTML = `
      <td colspan="5" style="font-style:italic; color:#6b7280;">
        🗑️ Log eliminato ✅ — <strong>${data.deleted_log.action}</strong>
      </td>
      <td>
        <button class="ghost" id="downloadDeletedLog_${id}">⬇️ Scarica log</button>
      </td>
    `;
    row.classList.add("log-deleted");

    // Bottone per scaricare JSON del log eliminato
    const downloadBtn = document.getElementById(`downloadDeletedLog_${id}`);
    downloadBtn?.addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(data.deleted_log, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `deleted_log_${id}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

    toast("Log eliminato ✅", "info");

  } catch (e) {
    console.error("Errore eliminazione log:", e);
    toast("Errore server", "error");
  }
};

async function request2FA(){
  const csrfMatch = document.cookie.match(/csrf_token=([^;]+)/);
  const csrfToken = csrfMatch ? csrfMatch[1] : null;

  if(!csrfToken){
    toast("Token CSRF mancante", "error");
    return;
  }

  const r = await safeFetch("/admin/api/security_admin/request_2fa.php", {
    method: "POST",
    headers: { "X-CSRF-Token": csrfToken }
  });

  if(!r.ok){
    toast("Errore invio 2FA", "error");
    return;
  }

  const code = prompt("Inserisci codice 2FA ricevuto via email");
  if(!code) return;

  const confirm = await safeFetch("/admin/api/security_admin/confirm_clear_logs.php", {
    method: "POST",
    headers:{ 
      "Content-Type":"application/json",
      "X-CSRF-Token": csrfToken
    },
    body: JSON.stringify({ code })
  });

  if(!confirm.ok){
    toast("Codice errato", "error");
    return;
  }

  const j = await confirm.json();
  toast(`🧹 Eliminati ${j.deleted} log`, "info");
  loadLogs();
}

// ===============================
// LONG PRESS → MODAL SICURA
// ===============================
(() => {
  const btn = el("#btnClearLogs");
  if(!btn) return;

  let t;
  const HOLD = 1200;

  const start = ()=>{
    btn.classList.add("holding");
    playWarningSound();

    t = setTimeout(()=>{
      request2FA();
    }, HOLD);
  };

  const stop = ()=>{
    clearTimeout(t);
    btn.classList.remove("holding");
  };

  btn.addEventListener("mousedown", start);
  btn.addEventListener("mouseup", stop);
  btn.addEventListener("mouseleave", stop);
  btn.addEventListener("touchstart", start);
  btn.addEventListener("touchend", stop);
})();

// ===============================
// PRO ADMIN — SECURITY REALTIME
// ===============================
let securitySocket = null;

// -------------------------------
// GESTIONE ALERT
// -------------------------------
function handleSecurityAlert(log) {
    const day = log.created_at?.slice(0,9);
    if (day) securityLogsByDay[day] ??= [];
    if (day) securityLogsByDay[day].push(log);

    if (!log?.id || displayedSecurityIds.has(log.id)) return;

    bufferedSecurityLogs[log.id] = log;

    if (!seenSecurityIds.has(String(log.id))) alertCount++;
    updateAlertBadge();

    renderSecurityPage(currentSecurityPage);
    updateSecurityPagination();

    playAlertSound();
    showNotification(`${log.simulation ? "⚠️ Simulazione:" : "🚨 Attacco:"} ${log.event}`, 4000);
    updateChartWithLog(log);
}

// -------------------------------
// INIT WS / SSE UNIFICATO
// -------------------------------
function initSecurityRealtime() {
    if (securitySocket) return;

    try {
        securitySocket = new WebSocket(`ws://${window.location.hostname}:4000`);
        securitySocket.onopen = () => console.log("WS admin connesso su 4000");

        securitySocket.onmessage = e => {
            const msg = JSON.parse(e.data);
            if (msg.type === "alert") handleSecurityAlert(msg.alert);
        };

        securitySocket.onerror = err => {
            console.error("WS errore:", err);
            securitySocket.close();
        };

        securitySocket.onclose = () => {
            console.warn("WS chiuso, fallback SSE...");
            securitySocket = null;
            setTimeout(initSecuritySSE, 2000);
        };

    } catch (err) {
        console.error("WS non disponibile, uso SSE");
        setTimeout(initSecuritySSE, 1000);
    }
}

function initSecuritySSE() {
    if (securitySocket) return;

    const url = `http://${window.location.hostname}:8001/realtime.php?admin_id=${CURRENT_ADMIN.id}`;
    securitySocket = new EventSource(url, { withCredentials: true });

    securitySocket.addEventListener("alert", e => {
        const log = JSON.parse(e.data);
        handleSecurityAlert(log);
    });

    securitySocket.onerror = () => {
        console.warn("SSE errore/chiuso, retry...");
        securitySocket.close();
        securitySocket = null;
        setTimeout(initSecuritySSE, 5000);
    };
}

// -------------------------------
// UTILITY
// -------------------------------
function updateAlertBadge() {
    const badge = document.getElementById("alertBadge");
    if (!badge) return;

    if (alertCount > 0) {
        badge.textContent = alertCount;
        badge.classList.remove("hidden");
    } else {
        badge.classList.add("hidden");
    }
}

function pruneOldSecurityLogs() {
    const tbody = el("#securityAudit");
    if (!tbody) return;

    const now = new Date();

    [...tbody.querySelectorAll("tr[data-id]")].forEach(tr => {
        const createdAt = tr.dataset.created;
        if (!createdAt) return;

        const created = new Date(createdAt.replace(" ", "T") + "Z");
        if (isNaN(created)) return;

        const diffDays = (now - created) / (1000 * 60 * 60 * 24);
        if (diffDays >= 30) {
            tr.remove();
            if (tr.dataset.id) {
                seenSecurityIds.delete(tr.dataset.id);
                delete bufferedSecurityLogs[tr.dataset.id];
                displayedSecurityIds.delete(tr.dataset.id);
            }
        }
    });

    localStorage.setItem(SEEN_KEY, JSON.stringify([...seenSecurityIds]));
}

// Funzioni ausiliarie
function normalizeIp(ip) {
    if (!ip || ip === '—') return ''; // stringa vuota, JS la gestisce
    if (ip === '::1') return '127.0.0.1';
    return ip;
}

function simulateHackEvent() {
    const attacks = [
        "csrf_attempt",
        "union_select",
        "drop_table",
        "or_1_equals_1",
        "lfi_attempt",
        "rce_attempt"
    ];

    // Scegli casualmente uno degli attacchi
    const event = attacks[Math.floor(Math.random() * attacks.length)];
    simulateAttack(event);
}

/**
 * Restituisce la classe CSS del dot di sicurezza
 * @param {string} event - nome evento
 * @param {"real"|"simulation"} type - tipo log
 * @returns {string} - sec-ok | sec-warning | sec-critical
 */

function securityLevel(event, type = "real") {
    if (!event) return "sec-ok";

    const e = normalizeEvent(event);

    const criticalEvents = [
      "sql_injection",
      "bruteforce",
      "xss_attempt",
      "privilege_escalation",
      "account_takeover",
      "csrf_attempt",
      "lfi_attempt",
      "rce_attempt",
      "ban"
    ];

    if (criticalEvents.includes(e)) {
        return "sec-critical"; // 🔴
    }

    if (e === "failed_login" || type === "simulation") {
        return "sec-warning"; // 🟡
    }

    return "sec-ok"; // 🟢
}

function playAlertSound(){
    document.getElementById("soundAlert")?.play().catch(()=>{});
}

function showNotification(msg, duration = 3000) {
    const container = document.getElementById('globalToastContainer');
    if (!container) return;

    const notif = document.createElement('div');
    notif.textContent = msg;
    notif.style.cssText = `
        background: #dc2626;
        color: #fff;
        padding: 12px 18px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.4);
        font-weight: 600;
        opacity: 0;
        transform: translateY(-20px);
        transition: opacity 0.3s, transform 0.3s;
        pointer-events: auto;
        max-width: 300px;
    `;
    container.appendChild(notif);

    requestAnimationFrame(() => {
        notif.style.opacity = '1';
        notif.style.transform = 'translateY(0)';
    });

    setTimeout(() => {
        notif.style.opacity = '0';
        notif.style.transform = 'translateY(-20px)';
        setTimeout(()=>notif.remove(), 300);
    }, duration);
}

function normalizeEvent(event) {
  if (!event) return event;

  const map = {
    // login / auth
    login_failed: 'failed_login',
    failedlogin: 'failed_login',
    auth_failed: 'failed_login',

    // bruteforce
    security_bruteforce: 'bruteforce',
    brute_force: 'bruteforce',

    // SQL injection
    sqli: 'sql_injection',
    sqlinject: 'sql_injection',
    sql_injection_detected: 'sql_injection',

    // XSS
    xss: 'xss_attempt',

    // privilege escalation
    privilege_escalate: 'privilege_escalation',

    // account takeover
    ato: 'account_takeover',

    // CSRF
    csrf: 'csrf_attempt',

    // LFI
    lfi: 'lfi_attempt',

    // RCE
    rce: 'rce_attempt',

    // ban
    banned: 'ban'
  };

  return map[event.toLowerCase()] ?? event.toLowerCase();
}

// -------------------------------
// INIT AUTOMATICO
// -------------------------------

document.getElementById('simulateFailedLogin')
  ?.addEventListener('click', () =>
    simulateAttack('login_failed')
  );

document.getElementById('simulateBruteForce')
  ?.addEventListener('click', () =>
    simulateAttack('security_bruteforce')
  );

document.getElementById('simulateSQLi')
  ?.addEventListener('click', () =>
    simulateAttack('sql_injection')
  );

document.getElementById('simulateXSS')
  ?.addEventListener('click', () =>
    simulateAttack('xss_attempt')
  );

document.getElementById('simulatePrivEsc')
  ?.addEventListener('click', () =>
    simulateAttack('privilege_escalation')
  );

document.getElementById('simulateATO')
  ?.addEventListener('click', () =>
    simulateAttack('account_takeover')
  );

// Evento sul pulsante
document.getElementById('simulateAttack')?.addEventListener('click', simulateHackEvent);
document.getElementById('simulateCSRF')?.addEventListener('click', () => simulateAttack('csrf_attempt'));
document.getElementById('simulateLFI')?.addEventListener('click', () => simulateAttack('lfi_attempt'));
document.getElementById('simulateRCE')?.addEventListener('click', () => simulateAttack('rce_attempt'));

// Security Test Panel (automatic probes)
document.getElementById('btnTestSqliAdmin')?.addEventListener('click', async () => {
  await runSecurityProbe({
    label: 'SQLi Admin API',
    url: '/admin/api/admin_users.php?q=SELECT%20*%20FROM%20users',
    method: 'GET',
    expectedStatuses: [403]
  });
});

document.getElementById('btnTestSqliUser')?.addEventListener('click', async () => {
  await runSecurityProbe({
    label: 'SQLi User API',
    url: '/api/user/user_info.php?q=%27%20OR%201%3D1%20--',
    method: 'GET',
    expectedStatuses: [403]
  });
});

document.getElementById('btnTestXssUser')?.addEventListener('click', async () => {
  await runSecurityProbe({
    label: 'XSS User API',
    url: '/api/user/user_info.php?q=%3Cscript%3Ealert(1)%3C%2Fscript%3E',
    method: 'GET',
    expectedStatuses: [403]
  });
});

document.getElementById('btnTestLfiUser')?.addEventListener('click', async () => {
  await runSecurityProbe({
    label: 'LFI User API',
    url: '/api/user/user_info.php?q=..%2F..%2Fetc%2Fpasswd',
    method: 'GET',
    expectedStatuses: [403]
  });
});

document.getElementById('btnTestRceUser')?.addEventListener('click', async () => {
  await runSecurityProbe({
    label: 'RCE User API',
    url: '/api/user/user_info.php?q=%24%28curl%20http%3A%2F%2Fevil.local%29',
    method: 'GET',
    expectedStatuses: [403]
  });
});

document.getElementById('btnTestAntiCheat')?.addEventListener('click', async () => {
  await runSecurityProbe({
    label: 'Anti-Cheat invalid run token',
    url: '/api/user/gain_xp.php',
    method: 'POST',
    body: { action: 'l0_level_complete', stage: 0, run_token: 'tamper-test-token' },
    expectedStatuses: [403, 409]
  });
});

document.getElementById('btnClearSecurityTestLog')?.addEventListener('click', () => {
  const box = document.getElementById('securityTestOutput');
  if (box) box.innerHTML = '';
});

// Segna notifiche come lette
async function markSecurityAsRead(id) {
  if (!id || isNaN(Number(id))) return;

  try {
    const res = await fetch('/admin/api/security_admin/mark_read.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ log_id: Number(id) })
    });

    const data = await res.json();
    if (!data.ok) console.warn("Mark read failed:", data.error);

    // Aggiorna lo stato locale
    seenSecurityIds.add(String(id));
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seenSecurityIds]));

    // Aggiorna solo badge e classe .sec-new senza toccare display
    const tr = document.querySelector(`#securityAudit tr[data-id='${id}']`);
    if (tr) tr.classList.remove("sec-new");

    const rows = getSecurityRows();
    const unseenCount = rows.filter(r => r.classList.contains("sec-new")).length;
    alertCount = unseenCount;
    updateAlertBadge();

  } catch (e) {
    console.error("Errore rete mark read:", e);
  }
}

// ===============================
// THEME SWITCHER
// ===============================

const themeButtons = document.querySelectorAll('.theme-btn');

themeButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const theme = btn.dataset.theme;
    document.documentElement.setAttribute('data-theme', theme);

    // Aggiorna classe active
    themeButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

// Imposta il pulsante attivo al caricamento
const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
const activeBtn = document.querySelector(`.theme-btn[data-theme="${currentTheme}"]`);
if(activeBtn) activeBtn.classList.add('active');

// ===============================
// SECURITY CHART MONTH RESET
// ===============================
const SECURITY_CHART_MONTH_KEY = "security_chart_month";

function getCurrentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function shouldResetSecurityChart() {
    const saved = localStorage.getItem(SECURITY_CHART_MONTH_KEY);
    const current = getCurrentMonthKey();

    if (saved !== current) {
        // Nuovo mese → reset grafico
        localStorage.setItem(SECURITY_CHART_MONTH_KEY, current);
        return true;
    }
    return false;
}

// ===============================
// DOWNLOAD SECURITY CHART
// ===============================
document.getElementById("btnDownloadSecurityChart")?.addEventListener("click", () => {
  if (!charts.security) {
    toast("Grafico non disponibile", "error");
    return;
  }
  
  const link = document.createElement("a");
  link.href = charts.security.toBase64Image("image/png", 1);
  link.download = `security-chart-${getCurrentMonthKey()}.png`;
  link.click();
});

function softReload() {
  // Ricarica dati principali
  loadStats();
  loadLogs(1);
  loadUsers();
  loadNotifications(document.getElementById("notifLimit"));

  // Aggiorna badge alert
  updateAlertBadge();

  // Reinizializza WS/SSE
  if (!securitySocket || securitySocket.readyState === WebSocket.CLOSED) {
    initSecurityRealtime();
  }

  console.log("✅ Soft reload completato dopo BFCache");
}

// ===============================
// 🔐 Prevent BFCache after logout
// ===============================
window.addEventListener("pageshow", function (event) {
  if (event.persisted || performance.getEntriesByType("navigation")[0]?.type === "back_forward") {
    softReload();
  }
});

// ===============================
// PAGINAZIONE SICUREZZA COMPLETA
// ===============================

const SECURITY_ROWS_PER_PAGE = 9; // righe per pagina
let currentSecurityPage = 1;
let allSecurityLogs = [];

// ---------- FUNZIONI DI RENDER ----------
function renderLogRow(log) {
    const tr = document.createElement("tr");
    tr.dataset.id = log.id;
    tr.dataset.created = log.created_at ?? new Date().toISOString();
    tr.dataset.event = log.event ?? "";
    tr.dataset.simulation = log.simulation ? "true" : "false";

    const levelClass = securityLevel(log.event, log.simulation ? "simulation" : "real");
    tr.classList.add(levelClass);

    const ipDisplay = normalizeIp(log.ip) || '—';

    tr.innerHTML = `
        <td><span class="status-dot ${levelClass}"></span></td>
        <td>${log.user_id ?? "—"}</td>
        <td>${log.event}</td>
        <td>${ipDisplay}</td>
        <td>${log.created_at ?? new Date().toISOString()}</td>
        <td class="actions">
            <button onclick="banFromSecurityRow({ userId: '${log.user_id}', ip: '${ipDisplay}' })">🚫 Ban</button>
        </td>
    `;
    return tr;
}

function renderSecurityPage(page = 1) {
    currentSecurityPage = page;
    const tbody = document.querySelector("#securityAudit");
    if (!tbody) return;

    const totalPages = Math.ceil(allSecurityLogs.length / SECURITY_ROWS_PER_PAGE);

    // Normalizza pagina
    if (page < 1) page = 1;
    if (page > totalPages) page = totalPages || 1;

    const startIdx = (page - 1) * SECURITY_ROWS_PER_PAGE;
    const endIdx = startIdx + SECURITY_ROWS_PER_PAGE;
    const pageLogs = allSecurityLogs.slice(startIdx, endIdx);

    tbody.innerHTML = "";

    if (pageLogs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; opacity:0.7;">Nessun log disponibile</td></tr>`;
    } else {
        pageLogs.forEach(log => tbody.appendChild(renderLogRow(log)));
    }

    updateSecurityPagination();
}

// ---------- NAVIGAZIONE ----------
function updateSecurityPagination() {
    const totalPages = Math.ceil(allSecurityLogs.length / SECURITY_ROWS_PER_PAGE);

    const info = document.querySelector("#securityPageInfo");
    const prev = document.querySelector("#securityPrevBtn");
    const next = document.querySelector("#securityNextBtn");

    if (info) info.textContent = `Pagina ${currentSecurityPage} / ${totalPages || 1}`;
    if (prev) prev.disabled = currentSecurityPage <= 1;
    if (next) next.disabled = currentSecurityPage >= totalPages;

    if (prev) prev.onclick = () => {
        if (currentSecurityPage > 1) renderSecurityPage(currentSecurityPage - 1);
    };
    if (next) next.onclick = () => {
        if (currentSecurityPage < totalPages) renderSecurityPage(currentSecurityPage + 1);
    };
}

// ---------- FETCH LOG DAL SERVER ----------
async function loadAllSecurityLogs() {
    try {
        const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
        const res = await fetch('/admin/api/security_admin/security_logs_month_full.php', {
            method: 'GET',
            credentials: 'include',
            headers: {
                'X-CSRF-Token': csrfToken,
                'Content-Type': 'application/json'
            }
        });

        if (!res.ok) {
            const failText = await res.text().catch(() => "");
            console.error("Errore HTTP security logs:", res.status, failText.slice(0, 200));
            toast("Errore caricamento security logs", "error");
            return;
        }

        const data = await res.json().catch(() => ({}));
        const logs = Array.isArray(data.logs) ? data.logs : [];
        console.log("Totale log ricevuti:", logs.length);

        if (Array.isArray(data.logs)) {
            // Ordina decrescente per created_at
            allSecurityLogs = logs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            currentSecurityPage = 1;
            renderSecurityPage();
        } else {
            console.error("Payload security logs non valido:", data);
            toast("Security logs non disponibili", "error");
        }
    } catch (e) {
        console.error("Errore fetch security logs:", e);
        toast("Errore rete security logs", "error");
    }
}

// ---------- UTILITY ----------
function recalcAlertCount() {
    alertCount = Object.values(bufferedSecurityLogs)
        .filter(l => !seenSecurityIds.has(String(l.id))).length;
    updateAlertBadge();
}

// ---------- INIZIALIZZAZIONE ----------
document.addEventListener("DOMContentLoaded", () => {
    loadAllSecurityLogs();   // fetch iniziale
    recalcAlertCount();       // aggiorna badge alert
});
