// user_dashboard.js (Fantasy theme)
// Requires auth.js - safeFetch, checkLogin, logout

// Get CSRF token from meta tag
function getCsrfToken() {
  return document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ||
         (document.cookie.split('; ').find(c => c.startsWith('csrf_token='))?.split('=')[1] || '');
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('FILE_READ_ERROR'));
    reader.readAsDataURL(file);
  });
}

// toast
function toast(msg, t = 'info', tms = 2500) {
  const c = document.getElementById('toastContainer');
  if (!c) return;
  const el = document.createElement('div');
  el.style.background = t === 'error' ? '#d9534f' : '#0b1220';
  el.style.color = '#fff';
  el.style.padding = '8px 12px';
  el.style.marginTop = '8px';
  el.style.borderRadius = '8px';
  el.style.boxShadow = '0 4px 12px rgba(0,0,0,0.4)';
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => el.remove(), tms);
}

// state
let STATE = { user: null, progress: null, avatarUnlocks: new Set() };
let selectedAvatar = null;
let NOTIFS = { page: 1, perPage: 10, totalPages: 1, total: 0 };

const PREMIUM_AVATAR_REQUIREMENTS = {
  'avatar26.png': { xp: 220, coins: 120 },
  'avatar27.png': { xp: 300, coins: 180 },
  'avatar28.png': { xp: 420, coins: 260 },
  'avatar29.png': { xp: 580, coins: 360 },
  'avatar30.png': { xp: 760, coins: 500 }
};

const START_LEVEL_URLS = {
  1: '/game/livello0/livello_0.html',
  2: '/game/livello1/livello1.html',
  3: '/game/livello2/livello2.html',
  4: '/game/livello3/livello3.html'
};

// xp formula
function xpNeededFor(level) { return 50 + (level - 1) * 50; }

function getUnlockedLevelForCurrentAccount() {
  const uid = Number(STATE.user?.id || 0);
  if (!uid) return 1;
  const keys = [
    `eov_unlocked_level_u${uid}`,
    `eov_unlocked_level_user_${uid}`,
    'eov_unlocked_level',
    'eov_unlocked_level_guest'
  ];
  let best = 1;
  keys.forEach((k) => {
    const raw = localStorage.getItem(k);
    const n = Number(raw || 1);
    if (Number.isFinite(n)) {
      const clamped = Math.max(1, Math.min(4, Math.floor(n)));
      if (clamped > best) best = clamped;
    }
  });
  localStorage.setItem(`eov_unlocked_level_u${uid}`, String(best));
  return best;
}

function showSection(section) {
  const sections = {
    home: document.getElementById('sectionHome'),
    profile: document.getElementById('sectionProfile'),
    notifications: document.getElementById('sectionNotifications')
  };

  Object.values(sections).forEach(s => s && s.classList.remove('active'));
  if (sections[section]) sections[section].classList.add('active');

  document.getElementById('menuHome')?.classList.toggle('active', section === 'home');
  document.getElementById('menuProfile')?.classList.toggle('active', section === 'profile');
  document.getElementById('menuNotifications')?.classList.toggle('active', section === 'notifications');
}

async function pingActivity() {
  try {
    await safeFetch('/api/update_activity.php', { method: 'POST' });
  } catch (_) {
    // ignore heartbeat failures
  }
}

// render all
async function renderAll() {
  await loadProfile();
  await loadProgress();
  await loadAvatarChoices();
  await loadNotifications();
}

// load profile
async function loadProfile() {
  const r = await safeFetch('/api/user/user_info.php');
  if (!r.ok) { toast('Devi autenticarti', 'error'); return; }
  const j = await r.json();
  const u = j.user || j;
  STATE.user = u;
  STATE.avatarUnlocks = new Set(Array.isArray(j.avatar_unlocks) ? j.avatar_unlocks : []);

  document.getElementById('username').textContent = u.username;
  document.getElementById('roleBadge').textContent = u.role;
  const avatarEl = document.getElementById('avatar');
  const avatarName = (u.avatar && String(u.avatar).trim()) ? String(u.avatar).trim() : 'avatar1.png';
  const avatarUrl = `/avatars/${avatarName}`;
  const fallbackUrl = '/avatars/avatar1.png';
  const probe = new Image();
  probe.onload = () => {
    avatarEl.style.backgroundImage = `url(${avatarUrl})`;
  };
  probe.onerror = () => {
    avatarEl.style.backgroundImage = `url(${fallbackUrl})`;
  };
  probe.src = avatarUrl;

  document.getElementById('coins').textContent = 'Coins: ' + (u.coins ?? 0);
  if (u.banned_until) {
    document.getElementById('banNotice').style.display = 'block';
    document.getElementById('banNotice').textContent = 'BANNED until ' + u.banned_until;
  } else {
    document.getElementById('banNotice').style.display = 'none';
  }
}

// load progress
async function loadProgress() {
  const r = await safeFetch('/api/user/get_progress.php');
  if (!r.ok) {
    STATE.progress = { level: 1, experience: 0, coins: 0, inventory: {} };
    updateProgressUI();
    return;
  }
  const j = await r.json();

  STATE.progress = j.progress || { level: 1, experience: 0, coins: 0, inventory: {} };
  updateProgressUI();
  renderInventory();
}

// update UI
function updateProgressUI() {
  const p = STATE.progress || { level: 1, experience: 0, coins: 0 };
  const lvl = p.level || 1;
  const xp = p.experience || 0;
  const totalXp = Number(p.total_experience ?? xp);
  const needed = xpNeededFor(lvl);
  const pct = Math.min(100, Math.round((xp / needed) * 100));
  document.getElementById('level').textContent = lvl;
  document.getElementById('xp').textContent = `${xp} (tot ${totalXp})`;
  document.getElementById('xpNeeded').textContent = needed;
  document.getElementById('toNext').textContent = Math.max(0, needed - xp);
  document.getElementById('xpInner').style.width = pct + '%';
  document.getElementById('coins').textContent = 'Coins: ' + (p.coins || 0);
}

// inventory render
function renderInventory() {
  const inv = (STATE.progress && STATE.progress.inventory) || {};
  const container = document.getElementById('inventory');
  container.innerHTML = '';
  Object.keys(inv).forEach(k => {
    const el = document.createElement('div');
    el.className = 'item';
    el.style.minWidth = '90px';
    el.innerHTML = `<strong>${k}</strong><div>qty: ${inv[k]}</div>`;
    container.appendChild(el);
  });
}

function getAvatarReq(avatar) {
  return PREMIUM_AVATAR_REQUIREMENTS[avatar] || null;
}

function canUseOrBuyAvatar(avatar) {
  const req = getAvatarReq(avatar);
  if (!req) return true;
  if (STATE.avatarUnlocks.has(avatar)) return true;
  const xp = Number(STATE.progress?.total_experience ?? STATE.progress?.experience ?? 0);
  const coins = Number(STATE.progress?.coins || 0);
  return xp >= req.xp && coins >= req.coins;
}

// add item
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('menuHome')?.addEventListener('click', () => showSection('home'));
  document.getElementById('menuProfile')?.addEventListener('click', () => showSection('profile'));
  document.getElementById('menuNotifications')?.addEventListener('click', async () => {
    showSection('notifications');
    NOTIFS.page = 1;
    await loadNotifications();
  });
  showSection('home');

  document.getElementById('addItem').onclick = async () => {
    const name = document.getElementById('newItem').value.trim();
    if (!name) return toast('Inserisci nome item', 'error');
    STATE.progress.inventory = STATE.progress.inventory || {};
    STATE.progress.inventory[name] = (STATE.progress.inventory[name] || 0) + 1;
    renderInventory();
    toast('Item aggiunto');
  };

  document.getElementById('saveProgress').onclick = async () => {
    const res = await safeFetch('/api/save_progress.php', {
      method: 'POST',
      body: JSON.stringify({ inventory: STATE.progress.inventory })
    });
    const j = await res.json();
    if (j.ok) toast('Inventario salvato');
    else toast('Errore salvataggio', 'error');
    await loadProgress();
    await loadProfile();
  };

  // avatar upload/select
  document.getElementById('randomAvatar').onclick = async () => {
    const idx = Math.floor(Math.random() * 25) + 1;
    const f = `avatar${idx}.png`;
    const res = await safeFetch('/api/avatar_select.php', { method: 'POST', body: JSON.stringify({ avatar: f }) });
    const j = await res.json();
    if (j.ok) {
      toast('Avatar aggiornato');
      await loadProfile();
      await loadProgress();
      await loadAvatarChoices();
    } else {
      toast('Errore avatar', 'error');
    }
  };

  document.getElementById('saveAvatarBtn').addEventListener('click', async () => {
    if (!selectedAvatar) return toast('Seleziona un avatar', 'error');

    if (!canUseOrBuyAvatar(selectedAvatar)) {
      const req = getAvatarReq(selectedAvatar);
      return toast(`Richiesti XP ${req.xp} e C ${req.coins}`, 'error');
    }

    const res = await safeFetch('/api/avatar_select.php', {
      method: 'POST',
      body: JSON.stringify({ avatar: selectedAvatar })
    });
    const j = await res.json();

    if (j.ok) {
      if (j.purchased) {
        STATE.avatarUnlocks.add(selectedAvatar);
        if (STATE.progress) {
          STATE.progress.coins = Number(j.coins ?? STATE.progress.coins ?? 0);
          updateProgressUI();
        }
        toast('Avatar premium acquistato');
      } else {
        toast('Avatar salvato');
      }
      await loadProfile();
      await loadProgress();
      await loadAvatarChoices();
      return;
    }

    if (j.error === 'INSUFFICIENT_XP') {
      toast(`XP insufficienti: ${j.current_xp}/${j.required_xp}`, 'error');
      return;
    }
    if (j.error === 'INSUFFICIENT_COINS') {
      toast(`Coins insufficienti: ${j.current_coins}/${j.required_coins}`, 'error');
      return;
    }
    toast('Errore: ' + (j.error || ''), 'error');
  });

  document.getElementById('uploadBtn').addEventListener('click', async () => {
    try {
      const f = document.getElementById('avatarUpload').files[0];
      if (!f) return toast('Seleziona un file', 'error');

      const allowed = ['image/png', 'image/jpeg'];
      if (!allowed.includes(f.type)) return toast('Formato non valido (solo PNG/JPG)', 'error');
      if (f.size > 2 * 1024 * 1024) return toast('File troppo grande (max 2MB)', 'error');

      const dataUrl = await fileToDataUrl(f);
      const token = getCsrfToken();
      const authToken = localStorage.getItem('auth_token_jwt') || '';
      const res = await fetch('/api/avatar_upload.php', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'X-CSRF-Token': token,
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
        },
        body: JSON.stringify({
          avatar_base64: dataUrl,
          filename: f.name || 'avatar.png'
        })
      });

      const j = await res.json();
      if (j.ok) {
        toast('Upload OK');
        await loadProfile();
        await loadAvatarChoices();
      } else {
        toast('Upload error: ' + (j.error || ''), 'error');
      }
    } catch (_) {
      toast('Upload fallito', 'error');
    }
  });

  // sidebar mini button logic
  const sidebar = document.getElementById('sidebar');
  const miniBtn = document.getElementById('sidebarMiniBtn');
  const toggleBtn = document.getElementById('toggleSidebar');
  if (toggleBtn && sidebar && miniBtn) {
    toggleBtn.addEventListener('click', () => {
      sidebar.classList.toggle('closed');
      miniBtn.style.display = sidebar.classList.contains('closed') ? 'flex' : 'none';
    });
    miniBtn.addEventListener('click', () => {
      sidebar.classList.remove('closed');
      miniBtn.style.display = 'none';
    });
  }

  document.getElementById('btnLogout').onclick = async () => { await logout(); };

  const btnGoIndex = document.getElementById('btnGoIndex');
  if (btnGoIndex) {
    btnGoIndex.onclick = () => {
      window.location.href = '/index/index.html';
    };
  }

  const btnStartGame = document.getElementById('btnStartGame');
  if (btnStartGame) {
    btnStartGame.onclick = () => {
      const nextLevel = getUnlockedLevelForCurrentAccount();
      window.location.href = START_LEVEL_URLS[nextLevel] || START_LEVEL_URLS[1];
    };
  }

  const notifPrev = document.getElementById('notifPrev');
  const notifNext = document.getElementById('notifNext');
  if (notifPrev) {
    notifPrev.onclick = async () => {
      if (NOTIFS.page <= 1) return;
      NOTIFS.page -= 1;
      await loadNotifications();
    };
  }
  if (notifNext) {
    notifNext.onclick = async () => {
      if (NOTIFS.page >= NOTIFS.totalPages) return;
      NOTIFS.page += 1;
      await loadNotifications();
    };
  }

  pingActivity();
  setInterval(pingActivity, 60 * 1000);
});

// load avatar choices
async function loadAvatarChoices() {
  const list = document.getElementById('avatarList');
  list.innerHTML = '';

  for (let i = 1; i <= 30; i++) {
    const f = `avatar${i}.png`;
    const req = getAvatarReq(f);
    const unlocked = !req || STATE.avatarUnlocks.has(f);
    const canBuy = canUseOrBuyAvatar(f);

    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'avatar-choice';
    if (req) card.classList.add('premium');
    if (!unlocked) card.classList.add('locked');
    if (!unlocked && canBuy) card.classList.add('can-buy');

    const img = document.createElement('img');
    img.src = '/avatars/' + f;
    img.alt = f;

    const meta = document.createElement('span');
    meta.className = 'avatar-meta';
    if (!req) {
      meta.textContent = 'Base';
    } else if (unlocked) {
      meta.textContent = 'Sbloccato';
    } else {
      meta.textContent = `XP${req.xp} C${req.coins}`;
    }

    card.onclick = () => {
      if (req && !unlocked && !canBuy) {
        toast(`Servono XP ${req.xp} e C ${req.coins}`, 'error');
        return;
      }
      [...list.children].forEach(x => x.classList.remove('selected'));
      card.classList.add('selected');
      document.getElementById('avatar').style.backgroundImage = `url(/avatars/${f})`;
      selectedAvatar = f;
    };

    if (STATE.user && STATE.user.avatar === f) {
      card.classList.add('selected');
      selectedAvatar = f;
    }

    card.appendChild(img);
    card.appendChild(meta);
    list.appendChild(card);
  }
}

// notifications
async function loadNotifications() {
  const tbody = document.getElementById('notificationsTableBody');
  const info = document.getElementById('notificationsInfo');
  const prevBtn = document.getElementById('notifPrev');
  const nextBtn = document.getElementById('notifNext');
  if (!tbody) return;

  const url = `/api/notifications.php?page=${NOTIFS.page}&per_page=${NOTIFS.perPage}`;
  const r = await safeFetch(url);
  if (!r.ok) {
    tbody.innerHTML = '<tr><td colspan="2">Impossibile caricare le notifiche.</td></tr>';
    if (info) info.textContent = 'Errore caricamento';
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    return;
  }

  const j = await r.json();
  const rows = Array.isArray(j) ? j : (Array.isArray(j.notifications) ? j.notifications : []);
  NOTIFS.totalPages = Math.max(1, Number(j.total_pages || 1));
  NOTIFS.total = Number(j.total || rows.length || 0);
  NOTIFS.page = Math.max(1, Math.min(NOTIFS.page, NOTIFS.totalPages));

  tbody.innerHTML = '';
  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="2">Nessuna notifica disponibile.</td></tr>';
  } else {
    rows.forEach(n => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${n.message || '-'}</td><td>${n.created_at || ''}</td>`;
      tbody.appendChild(tr);
    });
  }

  if (info) info.textContent = `Pagina ${NOTIFS.page}/${NOTIFS.totalPages} - Totale ${NOTIFS.total}`;
  if (prevBtn) prevBtn.disabled = NOTIFS.page <= 1;
  if (nextBtn) nextBtn.disabled = NOTIFS.page >= NOTIFS.totalPages;
}

function handleSecurityAlert(log) {
  const day = log.created_at.slice(0, 10);
  const idx = securityChartLabels.indexOf(day);

  if (idx !== -1) {
    securityChartData[idx]++;
  } else {
    securityChartLabels.push(day);
    securityChartData.push(1);
  }
  charts.security.update();
}

async function loadAdminSecurityStats() {
  if (!STATE.user || STATE.user.role !== 'admin') return;

  const res = await safeFetch('/admin/api/security_stats.php');
  if (!res.ok) return;

  const json = await res.json();
  if (!json.ok || !Array.isArray(json.data)) return;

  securityChartLabels.length = 0;
  securityChartData.length = 0;

  json.data.forEach(row => {
    securityChartLabels.push(row.day);
    securityChartData.push(row.total);
  });

  if (!securityChartInitialized) {
    initSecurityChart();
    securityChartInitialized = true;
  } else {
    charts.security.update();
  }
}

// initial auth + load
async function ensureAuthenticatedUser(maxAttempts = 10, delayMs = 250) {
  for (let i = 0; i < maxAttempts; i++) {
    const me = await checkLogin();
    if (me && (me.role === 'user' || me.role === 'admin')) {
      return me;
    }

    try {
      const res = await safeFetch('/api/session_status.php', {
        method: 'GET',
        cache: 'no-store'
      });
      if (res.ok) {
        const payload = await res.json().catch(() => null);
        if (payload?.authenticated && payload?.user?.id) {
          return payload.user;
        }
      }
    } catch (_) {
      // ignore and retry
    }

    await new Promise(r => setTimeout(r, delayMs));
  }

  return null;
}

(async () => {
  const me = await ensureAuthenticatedUser();
  if (!me || (me.role !== 'user' && me.role !== 'admin')) {
    window.location.href = '/login/login.html';
    return;
  }
  STATE.user = me;
  await renderAll();

  // SOLO ADMIN
  if (STATE.user.role !== 'admin') {
    const sec = document.getElementById('securityPanel');
    if (sec) sec.style.display = 'none';
  }
})();

