// main.js (versione corretta e pulita)
// Dipende da: player.js, mostro.js, secondomostro.js
// Assicurati di servire la pagina via http://localhost:8000/... in modo che i cookie vengano inviati
// =========================
// PROGRESSO GIOCATORE (client-side cache)
// =========================
let playerProgress = {
  level: 1,
  exp: 0,
  coins: 0,
  expToNext: 100 // xpToNext può essere recalcolato su load; inizializziamo a 100
};
let CURRENT_ACCOUNT = null;
let RUN_TOKEN = null;
const MAX_PLAYABLE_LEVEL = 4;

// debounce / throttle per salvataggio
let _saveTimeout = null;
const SAVE_THROTTLE_MS = 1500;

// Global sound object for sharing between prologue and demo
let firstActSound = null;

function getUnlockedLevelStorageKey() {
  if (CURRENT_ACCOUNT && CURRENT_ACCOUNT.id) {
    return `eov_unlocked_level_u${CURRENT_ACCOUNT.id}`;
  }
  return 'eov_unlocked_level_guest';
}

function unlockPlayableLevel(level) {
  const safeLevel = Math.max(1, Math.min(MAX_PLAYABLE_LEVEL, Number(level) || 1));
  const key = getUnlockedLevelStorageKey();
  const current = Number(localStorage.getItem(key) || 1);
  if (!Number.isFinite(current) || safeLevel > current) {
    localStorage.setItem(key, String(safeLevel));
  }
}

// =========================
// HELPERS
// =========================
function getCookie(name) {
  const m = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[2]) : null;
}

function redirectToOfflineMode() {
  console.log("Redirecting to offline mode...");
  // Don't redirect, just continue
  // window.location.href = 'http://localhost:4000/gameOffline/offline.html';
}

function ensureGlobalGameActions() {
  if (!document.getElementById('globalGameActionsStyle')) {
    const style = document.createElement('style');
    style.id = 'globalGameActionsStyle';
    style.textContent = `
      #globalGameActions {
        position: fixed;
        top: 14px;
        right: 14px;
        z-index: 100002;
        display: flex;
        gap: 8px;
      }
      #globalGameActions .game-action-btn {
        border: 1px solid rgba(135, 195, 255, 0.42);
        border-radius: 999px;
        padding: 10px 16px;
        background: linear-gradient(135deg, rgba(7, 18, 33, 0.9), rgba(29, 58, 96, 0.78));
        color: #ecf6ff;
        font-weight: 700;
        letter-spacing: 0.25px;
        cursor: pointer;
        box-shadow: 0 10px 24px rgba(0, 0, 0, 0.34);
        backdrop-filter: blur(4px);
        transition: transform .15s ease, box-shadow .2s ease, filter .2s ease, border-color .2s ease;
      }
      #globalGameActions .game-action-btn:hover {
        transform: translateY(-1px);
        filter: brightness(1.09);
        border-color: rgba(172, 217, 255, 0.8);
        box-shadow: 0 12px 28px rgba(0, 0, 0, 0.4);
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
    if (CURRENT_ACCOUNT && CURRENT_ACCOUNT.role === 'admin') {
      window.location.href = 'http://localhost:8000/admin/admin_dashboard.php';
      return;
    }
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

function xpNeededForLevel(level) {
  return 50 + (Math.max(1, level) - 1) * 50;
}

async function loadProgressFromServer() {
  try {
    const res = await fetch('http://localhost:8000/api/user/get_progress.php', {
      method: 'GET',
      credentials: 'include'
    });

    if (res.status === 401) {
      redirectToOfflineMode();
      return false;
    }

    if (!res.ok) {
      console.warn('Errore load progress:', res.status);
      return false;
    }

    const data = await res.json().catch(() => null);
    const p = data && data.progress ? data.progress : null;
    if (!p) return false;

    playerProgress.level = Number(p.level || 1);
    playerProgress.exp = Number(p.experience || 0);
    playerProgress.coins = Number(p.coins || 0);
    playerProgress.expToNext = xpNeededForLevel(playerProgress.level);
    updateHUD();
    return true;
  } catch (e) {
    console.error('Errore fetch get_progress:', e);
    return false;
  }
}

async function requireLoggedAccount() {
  try {
    const res = await fetch('http://localhost:8000/api/me.php', {
      method: 'GET',
      credentials: 'include'
    });

    if (res.status === 401) {
      redirectToOfflineMode();
      return null;
    }

    if (!res.ok) {
      redirectToOfflineMode();
      return null;
    }

    const user = await res.json().catch(() => null);
    if (!user || !user.id) {
      redirectToOfflineMode();
      return null;
    }

    return user;
  } catch (e) {
    console.error('Errore check account:', e);
    redirectToOfflineMode();
    return null;
  }
}

function updateHUD() {
  const lvlEl = document.getElementById("levelDisplay");
  const coinEl = document.getElementById("coinAmount");
  const xpBarEl = document.getElementById("xpBar");

  if (lvlEl) lvlEl.textContent = "Stage 1 | Lv " + playerProgress.level;
  if (coinEl) {
    coinEl.textContent = playerProgress.coins;
    // optional: show coin image next to number handled in HTML/CSS
  }
  if (xpBarEl) {
    const pct = playerProgress.expToNext > 0 ? Math.max(0, Math.min(100, (playerProgress.exp / playerProgress.expToNext) * 100)) : 0;
    xpBarEl.style.width = pct + "%";
  }
}

function updateHeartsHUD(health) {
  const img = document.getElementById("heartsHudImage");
  if (!img) return;
  const h = Number(health);
  if (h >= 3) img.src = "CuoriGioco/3cuori.png";
  else if (h === 2) img.src = "CuoriGioco/2cuori.png";
  else if (h === 1) img.src = "CuoriGioco/1cuore.png";
  else img.src = "CuoriGioco/0cuori.png";
}

function startStoryRotation(lines) {
  const storyEl = document.querySelector("#storyHint p");
  if (!storyEl || !Array.isArray(lines) || lines.length === 0) return null;

  let idx = 0;
  let timer = null;
  let paused = false;
  let destroyed = false;
  const cleanLines = lines.map((s) => String(s || "").trim()).filter(Boolean);
  if (cleanLines.length === 0) return null;

  const clearTimer = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const scheduleNext = (ms) => {
    if (paused || destroyed) return;
    clearTimer();
    timer = setTimeout(next, ms);
  };

  const next = () => {
    if (paused || destroyed) return;
    const text = cleanLines[idx];
    storyEl.textContent = text;
    const readMs = Math.max(7800, Math.min(17000, 3200 + text.length * 90));
    idx = (idx + 1) % cleanLines.length;
    scheduleNext(readMs);
  };

  next();
  window.addEventListener("beforeunload", () => {
    destroyed = true;
    clearTimer();
  }, { once: true });

  return {
    pause() {
      paused = true;
      clearTimer();
    },
    resume() {
      if (destroyed || !paused) return;
      paused = false;
      scheduleNext(250);
    },
    stop() {
      destroyed = true;
      paused = true;
      clearTimer();
    }
  };
}

function floatingText(text, x, y, color = "#fff") {
  const el = document.createElement("div");
  el.textContent = text;
  el.style.position = "fixed";
  el.style.left = (x || 100) + "px";
  el.style.top = (y || 100) + "px";
  el.style.fontSize = "34px";
  el.style.fontWeight = "800";
  el.style.letterSpacing = "0.6px";
  el.style.color = color;
  el.style.textShadow = "0 3px 14px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,1)";
  el.style.webkitTextStroke = "1px rgba(0,0,0,0.55)";
  el.style.background = "rgba(10, 16, 26, 0.58)";
  el.style.padding = "6px 10px";
  el.style.borderRadius = "10px";
  el.style.border = "1px solid rgba(255,255,255,0.2)";
  el.style.pointerEvents = "none";
  el.style.transition = "transform 1100ms ease-out, opacity 1100ms ease-out";
  el.style.transform = "translateY(0)";
  el.style.opacity = "1";
  el.style.zIndex = 9999;
  document.body.appendChild(el);

  // animate up + fade out
  requestAnimationFrame(() => {
    el.style.transform = "translateY(-40px)";
    el.style.opacity = "0";
  });

  setTimeout(() => {
    el.remove();
  }, 1200);
}

function waitMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function playDryImpulse() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(120, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.14, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.14);
  } catch (_) {}
}

function createFirstActSound() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) {
    return {
      startAmbience: async () => {},
      pulse: () => {},
      hit: () => {},
      footstep: () => {},
      dangerInterference: () => {},
      titleReveal: () => {},
      startPhoneBuzz: () => {},
      stopPhoneBuzz: () => {},
      stopAll: async () => {}
    };
  }

  let ctx = null;
  let master = null;
  let ambience = null;
  let phone = null;
  let lastStepAt = 0;
  const STEP_MIN_MS = 90;

  const ensure = async () => {
    if (!ctx) {
      ctx = new Ctx();
      master = ctx.createGain();
      master.gain.value = 0.0001;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") {
      try { await ctx.resume(); } catch (_) {}
    }
    return ctx;
  };

  const now = () => (ctx ? ctx.currentTime : 0);

  const startAmbience = async () => {
    await ensure();
    if (ambience) return;

    const low = ctx.createOscillator();
    const mid = ctx.createOscillator();
    const g = ctx.createGain();
    const wobble = ctx.createOscillator();
    const wobbleDepth = ctx.createGain();
    const roomNoiseGain = ctx.createGain();
    const roomNoiseHp = ctx.createBiquadFilter();
    const roomNoiseLp = ctx.createBiquadFilter();

    low.type = "sine";
    mid.type = "triangle";
    low.frequency.value = 46;
    mid.frequency.value = 69;
    g.gain.value = 0.0001;

    wobble.type = "sine";
    wobble.frequency.value = 0.12;
    wobbleDepth.gain.value = 0.015;
    roomNoiseGain.gain.value = 0.0001;
    roomNoiseHp.type = "highpass";
    roomNoiseHp.frequency.value = 220;
    roomNoiseLp.type = "lowpass";
    roomNoiseLp.frequency.value = 2500;

    const noiseBuffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * 1.5)), ctx.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseData.length; i++) {
      noiseData[i] = (Math.random() * 2 - 1) * 0.25;
    }
    const roomNoise = ctx.createBufferSource();
    roomNoise.buffer = noiseBuffer;
    roomNoise.loop = true;

    wobble.connect(wobbleDepth);
    wobbleDepth.connect(g.gain);
    low.connect(g);
    mid.connect(g);
    g.connect(master);
    roomNoise.connect(roomNoiseHp);
    roomNoiseHp.connect(roomNoiseLp);
    roomNoiseLp.connect(roomNoiseGain);
    roomNoiseGain.connect(master);

    const t = now();
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), t);
    master.gain.linearRampToValueAtTime(0.18, t + 1.2);
    g.gain.linearRampToValueAtTime(0.095, t + 1.2);
    roomNoiseGain.gain.linearRampToValueAtTime(0.018, t + 1.1);

    low.start(t);
    mid.start(t);
    wobble.start(t);
    roomNoise.start(t);
    ambience = { low, mid, g, wobble, roomNoise, roomNoiseGain };
  };

  const pulse = async (intensity = 0.5) => {
    await ensure();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(150 + (intensity * 40), now());
    g.gain.setValueAtTime(0.0001, now());
    g.gain.exponentialRampToValueAtTime(0.02 + (intensity * 0.03), now() + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now() + 0.22);
    osc.connect(g);
    g.connect(master);
    osc.start(now());
    osc.stop(now() + 0.24);
  };

  const hit = async () => {
    await ensure();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(120, now());
    osc.frequency.exponentialRampToValueAtTime(78, now() + 0.18);
    g.gain.setValueAtTime(0.0001, now());
    g.gain.exponentialRampToValueAtTime(0.09, now() + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, now() + 0.19);
    osc.connect(g);
    g.connect(master);
    osc.start(now());
    osc.stop(now() + 0.2);
  };

  const footstep = async (speed = 1) => {
    const ts = performance.now();
    const minDelay = Math.max(STEP_MIN_MS, 165 - Math.min(65, speed * 48));
    if (ts - lastStepAt < minDelay) return;
    lastStepAt = ts;

    await ensure();
    const noiseBuffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * 0.12)), ctx.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseData.length; i++) {
      noiseData[i] = (Math.random() * 2 - 1) * 0.6;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 160;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2400;
    const g = ctx.createGain();

    const t = now();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.045, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);

    // Light ducking: lascia spazio ai passi senza far sparire l'ambiente.
    if (ambience) {
      ambience.g.gain.cancelScheduledValues(t);
      ambience.g.gain.setValueAtTime(Math.max(0.0001, ambience.g.gain.value), t);
      ambience.g.gain.exponentialRampToValueAtTime(0.07, t + 0.012);
      ambience.g.gain.exponentialRampToValueAtTime(0.095, t + 0.14);

      ambience.roomNoiseGain.gain.cancelScheduledValues(t);
      ambience.roomNoiseGain.gain.setValueAtTime(Math.max(0.0001, ambience.roomNoiseGain.gain.value), t);
      ambience.roomNoiseGain.gain.exponentialRampToValueAtTime(0.013, t + 0.012);
      ambience.roomNoiseGain.gain.exponentialRampToValueAtTime(0.018, t + 0.14);
    }
    if (phone) {
      phone.gain.gain.cancelScheduledValues(t);
      phone.gain.gain.setValueAtTime(Math.max(0.0001, phone.gain.gain.value), t);
      phone.gain.gain.exponentialRampToValueAtTime(0.0042, t + 0.012);
      phone.gain.gain.exponentialRampToValueAtTime(0.0075, t + 0.14);
    }

    noise.connect(hp);
    hp.connect(lp);
    lp.connect(g);
    g.connect(master);
    noise.start(t);
    noise.stop(t + 0.17);
  };

  const dangerInterference = async () => {
    await ensure();
    const t = now();
    const duration = 0.42;
    const noiseBuffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * duration)), ctx.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseData.length; i++) {
      noiseData[i] = (Math.random() * 2 - 1) * 0.42;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 900;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 4400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.03, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    noise.connect(hp);
    hp.connect(lp);
    lp.connect(g);
    g.connect(master);
    noise.start(t);
    noise.stop(t + duration + 0.01);
  };

  const titleReveal = async () => {
    await ensure();
    const t = now();
    const low = ctx.createOscillator();
    const mid = ctx.createOscillator();
    const high = ctx.createOscillator();
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();

    low.type = "sine";
    mid.type = "triangle";
    high.type = "sine";

    // Accordo aperto e lento per reveal del titolo
    low.frequency.setValueAtTime(110, t);
    low.frequency.exponentialRampToValueAtTime(146.8, t + 1.4);
    mid.frequency.setValueAtTime(220, t);
    mid.frequency.exponentialRampToValueAtTime(293.7, t + 1.5);
    high.frequency.setValueAtTime(329.6, t);
    high.frequency.exponentialRampToValueAtTime(392.0, t + 1.7);

    lp.type = "lowpass";
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.linearRampToValueAtTime(2400, t + 1.2);

    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.11, t + 0.35);
    g.gain.exponentialRampToValueAtTime(0.09, t + 1.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.35);

    low.connect(g);
    mid.connect(g);
    high.connect(g);
    g.connect(lp);
    lp.connect(master);

    low.start(t);
    mid.start(t + 0.04);
    high.start(t + 0.08);
    low.stop(t + 2.4);
    mid.stop(t + 2.4);
    high.stop(t + 2.4);
  };

  const startPhoneBuzz = async () => {
    await ensure();
    if (phone) return;
    const carrier = ctx.createOscillator();
    const gain = ctx.createGain();
    const lfo = ctx.createOscillator();
    const lfoDepth = ctx.createGain();

    carrier.type = "square";
    carrier.frequency.value = 176;
    gain.gain.value = 0.0001;

    lfo.type = "square";
    lfo.frequency.value = 9;
    lfoDepth.gain.value = 0.009;

    lfo.connect(lfoDepth);
    lfoDepth.connect(gain.gain);
    carrier.connect(gain);
    gain.connect(master);

    gain.gain.setValueAtTime(0.0001, now());
    gain.gain.linearRampToValueAtTime(0.0075, now() + 0.06);

    carrier.start(now());
    lfo.start(now());
    phone = { carrier, gain, lfo };
  };

  const stopPhoneBuzz = () => {
    if (!phone || !ctx) return;
    const t = now();
    phone.gain.gain.cancelScheduledValues(t);
    phone.gain.gain.setValueAtTime(Math.max(0.0001, phone.gain.gain.value), t);
    phone.gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    phone.carrier.stop(t + 0.1);
    phone.lfo.stop(t + 0.1);
    phone = null;
  };

  const stopAll = async () => {
    stopPhoneBuzz();
    if (ambience && ctx) {
      const t = now();
      ambience.g.gain.cancelScheduledValues(t);
      ambience.g.gain.setValueAtTime(Math.max(0.0001, ambience.g.gain.value), t);
      ambience.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      ambience.roomNoiseGain.gain.cancelScheduledValues(t);
      ambience.roomNoiseGain.gain.setValueAtTime(Math.max(0.0001, ambience.roomNoiseGain.gain.value), t);
      ambience.roomNoiseGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), t);
      master.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      ambience.low.stop(t + 0.36);
      ambience.mid.stop(t + 0.36);
      ambience.wobble.stop(t + 0.36);
      ambience.roomNoise.stop(t + 0.36);
      ambience = null;
    }
    if (ctx) {
      setTimeout(() => {
        if (ctx && ctx.state !== "closed") ctx.close().catch(() => {});
      }, 420);
    }
  };

  return { startAmbience, pulse, hit, footstep, dangerInterference, titleReveal, startPhoneBuzz, stopPhoneBuzz, stopAll };
}

function ensureFirstActOverlay() {
  let root = document.getElementById("firstActOverlay");
  if (root) return root;
  root = document.createElement("div");
  root.id = "firstActOverlay";
  root.innerHTML = `
    <div id="firstActScene" class="scene-black">
      <div id="firstActRoom"></div>
      <div id="firstActMirror"></div>
      <div id="firstActPhone"></div>
      <div id="firstActReflection"></div>
      <div id="firstActHero"></div>
      <div id="firstActVoice"></div>
      <div id="firstActHint"></div>
      <div id="firstActCenter"></div>
      <div id="firstActAudioPrompt">Premi un tasto per attivare l'audio</div>
      <div id="firstActTitleWrap">
        <h1 id="firstActTitle">LA COSCIENZA ESTERNA</h1>
        <p id="firstActSubtitle">Non tutto cio' che si vede cambia.</p>
      </div>
    </div>
  `;
  document.body.appendChild(root);
  return root;
}

function ensureFullscreenKick() {
  let tried = false;
  const tryFs = async () => {
    if (tried) return;
    tried = true;
    const el = document.documentElement;
    if (document.fullscreenElement) return;
    try {
      if (el.requestFullscreen) await el.requestFullscreen();
    } catch (_) {
      // Browser may block without explicit gesture.
    }
  };

  const bindTry = () => {
    ["click", "pointerdown", "keydown", "touchstart"].forEach((ev) => {
      window.addEventListener(ev, tryFs, { passive: true, once: true });
    });
  };

  tryFs();
  bindTry();
}

async function runFirstActPrologue() {
  const root = ensureFirstActOverlay();
  const scene = document.getElementById("firstActScene");
  const center = document.getElementById("firstActCenter");
  const voice = document.getElementById("firstActVoice");
  const hint = document.getElementById("firstActHint");
  const room = document.getElementById("firstActRoom");
  const hero = document.getElementById("firstActHero");
  const phone = document.getElementById("firstActPhone");
  const mirror = document.getElementById("firstActMirror");
  const reflection = document.getElementById("firstActReflection");
  const titleWrap = document.getElementById("firstActTitleWrap");
  const audioPrompt = document.getElementById("firstActAudioPrompt");
  firstActSound = createFirstActSound();
  const sound = firstActSound;
  const retryAudioAutostart = () => {
    sound.startAmbience();
  };
  let soundUnlocked = false;
  if (audioPrompt) audioPrompt.classList.add("show");
  if (audioPrompt) setTimeout(() => audioPrompt.classList.remove("show"), 2000);
  const unlockSoundOnGesture = () => {
    if (soundUnlocked) return;
    soundUnlocked = true;
    sound.startAmbience();
    sound.pulse(0.25);
  };

  // Il personaggio (e il telefono) devono stare nel riquadro centrale,
  // cosi seguono il restringimento della stanza.
  if (hero.parentNode !== room) room.appendChild(hero);
  if (phone.parentNode !== room) room.appendChild(phone);
  if (mirror.parentNode !== room) room.appendChild(mirror);
  if (reflection.parentNode !== room) room.appendChild(reflection);

  let heroX = 0;
  let reflectLag = false;
  let mirrorOverlapActive = false;
  let stopLoop = false;
  let interactionLocked = true;
  const keys = { left: false, right: false };
  const heroAnim = {
    scale: 0.9,
    current: null,
    reflectionCurrent: null,
    frame: 0,
    tick: 0,
    reflectionFrame: 0,
    reflectionTick: 0,
    frameRate: 7,
    idle: { src: "/game/Personaggi_Gioco/Idle.png", frames: 1, w: 129, h: 128 },
    run: { src: "/game/Personaggi_Gioco/Run.png", frames: 8, w: 128, h: 128 },
    runBack: { src: "/game/Personaggi_Gioco/RunBack.png", frames: 8, w: 128, h: 128 },
    walk: { src: "/game/Personaggi_Gioco/Run.png", fallbackSrc: "/game/Personaggi_Gioco/Run.png", frames: 8, w: 128, h: 128 },
    walkBack: { src: "/game/Personaggi_Gioco/RunBack.png", fallbackSrc: "/game/Personaggi_Gioco/RunBack.png", frames: 8, w: 128, h: 128 },
    reflectionRunBack: { src: "/game/Personaggi_Gioco/RunBack.png", frames: 8, w: 128, h: 128 }
  };
  let mirrorOppositeActive = false;
  const getMaxResponsiveShrink = () => {
    const base = Math.min(window.innerWidth || 0, window.innerHeight || 0);
    return Math.max(12, Math.min(42, Math.floor(base * 0.05)));
  };
  let layoutSyncActive = true;
  let overlayWindowActive = !document.hidden;

  const loadSheet = (sheet) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        sheet.h = img.naturalHeight;
        sheet.w = Math.max(1, Math.floor(img.naturalWidth / sheet.frames));
      }
      resolve();
    };
    img.onerror = () => {
      if (sheet.fallbackSrc && sheet.src !== sheet.fallbackSrc) {
        sheet.src = sheet.fallbackSrc;
        img.src = sheet.src;
        return;
      }
      resolve();
    };
    img.src = sheet.src;
  });

  const applyAnimSheet = (mode) => {
    const sheet = heroAnim[mode] || heroAnim.idle;
    if (heroAnim.current === mode) return;
    heroAnim.current = mode;
    heroAnim.frame = 0;
    heroAnim.tick = 0;
    const drawW = Math.round(sheet.w * heroAnim.scale);
    const drawH = Math.round(sheet.h * heroAnim.scale);
    const sheetW = drawW * sheet.frames;
    hero.style.width = `${drawW}px`;
    hero.style.height = `${drawH}px`;
    hero.style.backgroundImage = `url("${sheet.src}")`;
    hero.style.backgroundSize = `${sheetW}px ${drawH}px`;
    hero.style.backgroundPosition = "0px 0px";

    if (!mirrorOppositeActive) {
      heroAnim.reflectionCurrent = mode;
      reflection.style.width = `${drawW}px`;
      reflection.style.height = `${drawH}px`;
      reflection.style.backgroundImage = `url("${sheet.src}")`;
      reflection.style.backgroundSize = `${sheetW}px ${drawH}px`;
      reflection.style.backgroundPosition = "0px 0px";
    }
  };

  const applyReflectionSheet = (mode) => {
    const sheet = heroAnim[mode] || heroAnim.idle;
    if (heroAnim.reflectionCurrent === mode) return;
    heroAnim.reflectionCurrent = mode;
    heroAnim.reflectionFrame = 0;
    heroAnim.reflectionTick = 0;
    const drawW = Math.round(sheet.w * heroAnim.scale);
    const drawH = Math.round(sheet.h * heroAnim.scale);
    const sheetW = drawW * sheet.frames;
    reflection.style.width = `${drawW}px`;
    reflection.style.height = `${drawH}px`;
    reflection.style.backgroundImage = `url("${sheet.src}")`;
    reflection.style.backgroundSize = `${sheetW}px ${drawH}px`;
    reflection.style.backgroundPosition = "0px 0px";
  };

  const applyResponsiveFirstActLayout = () => {
    if (!layoutSyncActive) return;
    const roomRect = room.getBoundingClientRect();
    const maxShrink = getMaxResponsiveShrink();
    const curShrink = Number(room.dataset.shrink || 0);
    if (Number.isFinite(curShrink)) {
      const safeShrink = Math.max(0, Math.min(maxShrink, curShrink));
      room.dataset.shrink = String(safeShrink);
      room.style.setProperty("--shrink", `${safeShrink}px`);
    }
    const roomH = Math.max(220, roomRect.height || Math.round(window.innerHeight * 0.5));
    const roomW = Math.max(320, roomRect.width || Math.round(window.innerWidth * 0.6));

    // Calcolo scala ideale in base all'altezza utile della stanza.
    const targetScale = Math.max(0.68, Math.min(1.03, roomH / 360));
    if (Math.abs(heroAnim.scale - targetScale) > 0.005) {
      heroAnim.scale = targetScale;
      applyAnimSheet(heroAnim.current || "idle");
      applyReflectionSheet(heroAnim.reflectionCurrent || heroAnim.current || "idle");
    }

    const basePx = Math.round(Math.max(10, Math.min(46, roomH * 0.10)));
    hero.style.bottom = `${basePx}px`;
    reflection.style.bottom = `${basePx}px`;

    mirror.style.bottom = `${basePx}px`;
    const reflectionW = Math.max(36, reflection.clientWidth || hero.clientWidth || 64);
    const reflectionH = Math.max(72, reflection.clientHeight || hero.clientHeight || 96);
    const mirrorBaseW = Math.max(64, Math.round(reflectionW * 1.8));
    const mirrorExtraRight = 10;
    const mirrorW = mirrorBaseW + mirrorExtraRight;
    const mirrorH = Math.max(120, Math.round(reflectionH + 58));
    mirror.style.setProperty("--mirror-width", `${mirrorW}px`);
    mirror.style.setProperty("--mirror-height", `${mirrorH}px`);
    const mirrorLeft = Math.round((roomW * 0.60) - (mirrorBaseW * 0.5) + 40);
    mirror.style.left = `${mirrorLeft}px`;

    const phoneBottom = Math.round(basePx + roomH * 0.15);
    phone.style.bottom = `${phoneBottom}px`;
    phone.style.right = `${Math.round(Math.max(14, roomW * 0.16))}px`;
  };

  const refreshOverlayActivity = () => {
    overlayWindowActive = !document.hidden;
  };

  const waitForOverlayActive = () => new Promise((resolve) => {
    if (overlayWindowActive) {
      resolve();
      return;
    }
    const poll = () => {
      if (overlayWindowActive) {
        resolve();
        return;
      }
      setTimeout(poll, 80);
    };
    poll();
  });

  const waitOverlayMs = async (ms) => {
    if (ms <= 0) return;
    await waitForOverlayActive();
    let elapsed = 0;
    while (elapsed < ms) {
      await waitForOverlayActive();
      const slice = Math.min(60, ms - elapsed);
      await waitMs(slice);
      elapsed += slice;
    }
  };

  const getReflectionMirrorStopX = () => {
    const roomRect = room.getBoundingClientRect();
    const mirrorRect = mirror.getBoundingClientRect();
    const reflectionW = Math.max(36, reflection.clientWidth || hero.clientWidth || 64);
    const roomW = Math.max(320, roomRect.width || 320);
    const mirrorLeftInsideRoom = Math.max(0, mirrorRect.left - roomRect.left);
    const mirrorW = Math.max(90, mirrorRect.width || 110);
    const mirrorCenter = mirrorLeftInsideRoom + (mirrorW * 0.5);
    // Il riflesso usa rx = -x: per centrarlo nello specchio, il personaggio
    // principale deve fermarsi alla posizione opposta rispetto al centro stanza.
    // Aggiungo meta larghezza riflesso per allineare il CENTRO del corpo.
    return Math.round((roomW * 0.5) - mirrorCenter + (reflectionW * 0.5));
  };

  const stepAnim = (moving, velocityX) => {
    const movingLeft = velocityX < -0.08;
    const mode = moving ? (movingLeft ? "runBack" : "run") : "idle";
    applyAnimSheet(mode);
    const sheet = heroAnim[heroAnim.current] || heroAnim.idle;
    const reflectionMode = moving ? (movingLeft ? "run" : "runBack") : "idle";
    applyReflectionSheet(reflectionMode);
    const reflectionSheet = heroAnim[heroAnim.reflectionCurrent] || heroAnim.idle;

    let frameAdvanced = false;
    heroAnim.tick += 1;
    if (heroAnim.tick >= heroAnim.frameRate) {
      heroAnim.tick = 0;
      heroAnim.frame = (heroAnim.frame + 1) % Math.max(1, sheet.frames);
      frameAdvanced = true;
    }
    const frameW = Math.round(sheet.w * heroAnim.scale);
    const frameX = -(heroAnim.frame * frameW);
    const reflectionFrame = heroAnim.frame % Math.max(1, reflectionSheet.frames);
    const reflectionFrameW = Math.round(reflectionSheet.w * heroAnim.scale);
    const reflectionX = -(reflectionFrame * reflectionFrameW);
    hero.style.backgroundPosition = `${frameX}px 0px`;
    reflection.style.backgroundPosition = `${reflectionX}px 0px`;
    if (moving && frameAdvanced) {
      sound.footstep(Math.abs(velocityX));
    }
  };

  const onKeyDown = (e) => {
    if (interactionLocked) return;
    if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a") keys.left = true;
    if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") keys.right = true;
  };
  const onKeyUp = (e) => {
    if (interactionLocked) return;
    if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a") keys.left = false;
    if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") keys.right = false;
  };
  const onMouseMove = (e) => {
    if (interactionLocked) return;
    const w = Math.max(1, window.innerWidth);
    const p = (e.clientX / w) - 0.5;
    scene.style.setProperty("--lookShift", `${Math.round(p * 14)}px`);
  };
  const swallowOverlayInput = (e) => {
    if (!interactionLocked) return;
    if ((e.type === "keydown" || e.type === "keyup") && e.key === "F11") {
      return;
    }
    if (
      e.type === "pointerdown" ||
      e.type === "touchstart" ||
      e.type === "mousedown" ||
      e.type === "click" ||
      e.type === "keydown"
    ) {
      unlockSoundOnGesture();
    }
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("pointerdown", unlockSoundOnGesture, { once: true, passive: true, capture: true });
  window.addEventListener("keydown", unlockSoundOnGesture, { once: true, capture: true });
  window.addEventListener("touchstart", unlockSoundOnGesture, { once: true, passive: true, capture: true });
  window.addEventListener("keydown", swallowOverlayInput, true);
  window.addEventListener("keyup", swallowOverlayInput, true);
  window.addEventListener("click", swallowOverlayInput, true);
  window.addEventListener("pointerdown", swallowOverlayInput, true);
  window.addEventListener("mousedown", swallowOverlayInput, true);
  window.addEventListener("contextmenu", swallowOverlayInput, true);
  window.addEventListener("resize", applyResponsiveFirstActLayout);
  window.addEventListener("focus", refreshOverlayActivity);
  window.addEventListener("blur", refreshOverlayActivity);
  document.addEventListener("visibilitychange", refreshOverlayActivity);
  window.addEventListener("pageshow", retryAudioAutostart);
  window.addEventListener("focus", retryAudioAutostart);
  document.addEventListener("visibilitychange", retryAudioAutostart);

  await Promise.all([
    loadSheet(heroAnim.idle),
    loadSheet(heroAnim.run),
    loadSheet(heroAnim.runBack),
    loadSheet(heroAnim.walk),
    loadSheet(heroAnim.walkBack),
    loadSheet(heroAnim.reflectionRunBack)
  ]);
  applyAnimSheet("idle");
  applyResponsiveFirstActLayout();
  root.classList.add("hide-cursor");

  const showVoice = async (text, ms = 3200) => {
    voice.textContent = text;
    voice.classList.add("show");
    sound.pulse(0.35);
    await waitOverlayMs(ms);
    voice.classList.remove("show");
  };

    const runMoveLoop = async (cfg) => {
    const {
      speed = 1.2,
      minX = -260,
      maxX = 260,
      initialX = 0,
      maxMs = 7000,
      onFrame = () => {},
      until = () => false
    } = cfg;

    heroX = initialX;
    hero.style.transform = `translateX(${heroX}px)`;
    let vx = 0;
    let autopilot = false;

    return new Promise((resolve) => {
      let activeElapsedMs = 0;
      let prevTs = 0;
      const tick = () => {
        if (stopLoop) return resolve();
        if (!overlayWindowActive) {
          prevTs = 0;
          requestAnimationFrame(tick);
          return;
        }

        const now = performance.now();
        if (!prevTs) prevTs = now;
        activeElapsedMs += Math.max(0, now - prevTs);
        prevTs = now;
        if (!autopilot && activeElapsedMs > 2200) autopilot = true;

        const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
        const autoDir = autopilot ? 1 : 0;
        const target = ((dir !== 0 ? dir : autoDir) * speed);

        vx += (target - vx) * 0.16;
        const roomNow = room.getBoundingClientRect();
        const heroW = Math.max(48, hero.clientWidth || 48);
        const dynamicMin = -Math.max(24, Math.round((roomNow.width / 2) - (heroW * 0.58)));
        const dynamicMax = Math.max(24, Math.round((roomNow.width / 2) - (heroW * 0.58)));
        const effectiveMin = Math.max(minX, dynamicMin);
        const effectiveMax = Math.min(maxX, dynamicMax);
        heroX = Math.max(effectiveMin, Math.min(effectiveMax, heroX + vx));
        hero.style.transform = `translateX(${heroX}px)`;

        stepAnim(Math.abs(vx) > 0.12, vx);
        applyResponsiveFirstActLayout();
        onFrame(heroX, vx);

        if (until(heroX, vx) || (activeElapsedMs > maxMs)) return resolve();
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  };

  scene.className = "scene-black";
  center.textContent = "";
  hint.textContent = "";
  voice.textContent = "";
  sound.startAmbience();
  setTimeout(retryAudioAutostart, 180);
  setTimeout(retryAudioAutostart, 900);
  sound.pulse(0.45);
  playDryImpulse();
  await waitOverlayMs(500);
  center.textContent = "Prima di tutto osservavi... esternamente, inerme.";
  center.classList.add("show");
  await waitOverlayMs(3600);
  center.classList.remove("show");
  center.textContent = "";

  heroX = 0;
  hero.style.transform = "translateX(0px)";
  scene.className = "scene-internal";
  hero.className = "hero seated";
  hint.classList.add("show");
  const roomShrinkTimer = setInterval(() => {
    const cur = Number(room.dataset.shrink || 0);
    const next = Math.min(getMaxResponsiveShrink(), cur + 3);
    room.dataset.shrink = String(next);
    room.style.setProperty("--shrink", `${next}px`);
    applyResponsiveFirstActLayout();
  }, 720);

  await waitOverlayMs(4300);
  await showVoice("Non stavi vivendo...", 3100);
  await showVoice("...Stavi assistendo.", 3200);
  clearInterval(roomShrinkTimer);

  playDryImpulse();
  sound.hit();
  scene.className = "scene-control";
  hero.className = "hero standing";
  interactionLocked = true;
  const voiceMove = showVoice("sopravvivere non e' vivere.", 3400);
  await runMoveLoop({
    speed: 1.45,
    minX: -260,
    maxX: 260,
    initialX: 0,
    maxMs: 6500,
    onFrame: (x) => {
      const shift = Math.round((x + 140) * 0.12);
      scene.style.setProperty("--lookShift", `${shift}px`);
    },
    until: (x) => x > 125
  });
  await voiceMove;

  scene.className = "scene-marco";
  hero.className = "hero marco";
  phone.classList.add("show");
  phone.classList.add("vibrate");
  sound.startPhoneBuzz();
  await runMoveLoop({
    speed: 1.35,
    minX: -260,
    maxX: 260,
    initialX: -180,
    maxMs: 7000,
    until: (x) => x > 150
  });
  phone.classList.remove("vibrate");
  sound.stopPhoneBuzz();
  phone.classList.remove("show");

  center.textContent = "Ho gia' deciso io...";
  center.classList.add("show", "invasive", "danger");
  sound.dangerInterference();
  setTimeout(() => sound.dangerInterference(), 380);
  await waitOverlayMs(1800);
  center.classList.remove("show", "danger");
  await waitOverlayMs(900);
  await showVoice("Ti e' sembrato gentile, affidabile...", 3200);
  center.classList.remove("invasive");
  center.textContent = "";

  scene.className = "scene-corridor";
  mirrorOppositeActive = true;
  mirrorOverlapActive = false;
  mirror.classList.add("show");
  reflection.classList.add("show");
  applyResponsiveFirstActLayout();
  reflection.style.bottom = window.getComputedStyle(hero).bottom;
  reflection.style.left = window.getComputedStyle(hero).left;
  hero.className = "hero marco";
  const mirrorStopX = getReflectionMirrorStopX();
  await runMoveLoop({
    speed: 1.35,
    minX: -280,
    maxX: 280,
    initialX: -200,
    maxMs: 7600,
    onFrame: (x) => {
      if (!reflectLag && x > -45) {
        reflectLag = true;
        reflection.style.setProperty("--lag", "1");
        setTimeout(() => reflection.style.setProperty("--lag", "0"), 95);
      }
      if (!mirrorOverlapActive && x > (mirrorStopX - 140)) mirrorOverlapActive = true;
      const mirrorRx = -x;
      reflection.style.setProperty("--rx", `${Math.round(mirrorRx)}px`);
    },
    until: (x) => x >= mirrorStopX
  });
  heroX = Math.min(heroX, mirrorStopX);
  hero.style.transform = `translateX(${heroX}px)`;
  reflection.style.setProperty("--rx", `${Math.round(-heroX)}px`);
  applyAnimSheet("idle");
  applyReflectionSheet("idle");
  heroAnim.frame = 0;
  heroAnim.reflectionFrame = 0;
  heroAnim.tick = 0;
  heroAnim.reflectionTick = 0;
  hero.style.backgroundPosition = "0px 0px";
  reflection.style.backgroundPosition = "0px 0px";

  await showVoice("Hai imparato presto a non chiedere perche'.", 3600);
  mirror.classList.remove("show");
  reflection.classList.remove("show");
  mirrorOppositeActive = false;
  mirrorOverlapActive = false;
  layoutSyncActive = false;
  hero.style.display = "none";
  phone.style.display = "none";

  scene.className = "scene-black";
  titleWrap.classList.add("show");
  sound.titleReveal();
  sound.pulse(0.2);
  await waitOverlayMs(3200);
  titleWrap.classList.remove("show");

  // Small delay before starting narrative

  // Clean up prologue-specific listeners before transitioning
  stopLoop = true;
  window.removeEventListener("resize", applyResponsiveFirstActLayout);
  window.removeEventListener("keydown", onKeyDown);
  window.removeEventListener("keyup", onKeyUp);
  window.removeEventListener("mousemove", onMouseMove);
  window.removeEventListener("pointerdown", unlockSoundOnGesture);
  window.removeEventListener("keydown", unlockSoundOnGesture);
  window.removeEventListener("touchstart", unlockSoundOnGesture);
  window.removeEventListener("keydown", swallowOverlayInput, true);
  window.removeEventListener("keyup", swallowOverlayInput, true);
  window.removeEventListener("click", swallowOverlayInput, true);
  window.removeEventListener("pointerdown", swallowOverlayInput, true);
  window.removeEventListener("mousedown", swallowOverlayInput, true);
  window.removeEventListener("contextmenu", swallowOverlayInput, true);
  window.removeEventListener("focus", refreshOverlayActivity);
  window.removeEventListener("blur", refreshOverlayActivity);
  document.removeEventListener("visibilitychange", refreshOverlayActivity);
  window.removeEventListener("pageshow", retryAudioAutostart);
  window.removeEventListener("focus", retryAudioAutostart);
  document.removeEventListener("visibilitychange", retryAudioAutostart);
  sound.stopAll();

  // Transition to post-prologue narrative (stays in overlay)
  await startDemoGameplay();
}


async function startDemoGameplay() {
  console.log("Starting post-prologue narrative in overlay...");
  try {
    // Hide game HUD elements we don't need
    const preLoader = document.getElementById('preLoader');
    if (preLoader) preLoader.style.display = 'none';
    const gameHud = document.getElementById('gameHud');
    if (gameHud) gameHud.style.display = 'none';
    const gameDiv = document.getElementById('GameDiv');
    if (gameDiv) gameDiv.style.display = 'none';
    const storyHint = document.getElementById('storyHint');
    if (storyHint) storyHint.style.display = 'none';

    // Reuse the existing overlay
    const root = document.getElementById("firstActOverlay");
    if (!root) {
      console.error("Overlay not found for post-prologue");
      return;
    }

    const scene = document.getElementById("firstActScene");
    const center = document.getElementById("firstActCenter");
    const voice = document.getElementById("firstActVoice");
    const hero = document.getElementById("firstActHero");
    const room = document.getElementById("firstActRoom");

    // Hide prologue-specific elements
    const phone = document.getElementById("firstActPhone");
    const mirror = document.getElementById("firstActMirror");
    const reflection = document.getElementById("firstActReflection");
    const titleWrap = document.getElementById("firstActTitleWrap");
    const hint = document.getElementById("firstActHint");
    if (phone) phone.style.display = "none";
    if (mirror) mirror.style.display = "none";
    if (reflection) reflection.style.display = "none";
    if (titleWrap) titleWrap.classList.remove("show");
    if (hint) hint.classList.remove("show");
    if (center) { center.textContent = ""; center.classList.remove("show", "invasive", "danger"); }
    if (room) room.style.display = "none";

    // Add post-prologue styles
    if (!document.getElementById("postPrologueStyle")) {
      const style = document.createElement("style");
      style.id = "postPrologueStyle";
      style.textContent = `
        /* ---- PHASE 1: Narrative text on black ---- */
        #firstActScene.scene-narrative {
          background: #000 !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          cursor: default !important;
        }
        #narrativeTextBox {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          color: rgba(210, 210, 225, 0.95);
          font-size: 1.5rem;
          text-align: center;
          max-width: 75%;
          line-height: 2;
          text-shadow: 0 2px 12px rgba(0,0,0,0.9);
          font-family: 'Courier New', monospace;
          opacity: 0;
          transition: opacity 0.7s ease;
          white-space: pre-line;
        }
        #narrativeTextBox.show { opacity: 1; }

        /* ---- PHASE 2: School corridor ---- */
        #firstActScene.scene-school {
          background: linear-gradient(180deg, #1a1510 0%, #2a2018 30%, #1a1510 100%) !important;
          overflow: hidden !important;
          display: block !important;
        }
        #schoolCorridor {
          position: absolute;
          top: 0; left: 0; right: 0; bottom: 0;
          background:
            repeating-linear-gradient(
              90deg,
              transparent 0px, transparent 120px,
              rgba(80, 60, 40, 0.25) 120px, rgba(80, 60, 40, 0.25) 123px
            ),
            repeating-linear-gradient(
              0deg,
              transparent 0px, transparent 200px,
              rgba(60, 45, 30, 0.15) 200px, rgba(60, 45, 30, 0.15) 202px
            );
        }
        #schoolFloor {
          position: absolute;
          bottom: 0; left: 0; right: 0;
          height: 22%;
          background: linear-gradient(180deg, #3a2e22 0%, #2a2018 100%);
          border-top: 2px solid rgba(100, 80, 55, 0.4);
        }
        #schoolLockers {
          position: absolute;
          top: 20%; left: 0; right: 0;
          height: 40%;
          background:
            repeating-linear-gradient(
              90deg,
              rgba(70, 55, 40, 0.6) 0px, rgba(70, 55, 40, 0.6) 58px,
              rgba(50, 38, 28, 0.8) 58px, rgba(50, 38, 28, 0.8) 60px
            );
          border-bottom: 3px solid rgba(90, 70, 50, 0.5);
        }
        #schoolLights {
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 8%;
          background:
            repeating-linear-gradient(
              90deg,
              transparent 0px, transparent 180px,
              rgba(255, 240, 200, 0.08) 180px, rgba(255, 240, 200, 0.08) 200px
            );
        }
        #schoolHero {
          position: absolute;
          bottom: 22%;
          left: 10%;
          z-index: 5;
          image-rendering: pixelated;
        }
        #schoolEntity {
          position: absolute;
          bottom: 22%;
          right: 8%;
          z-index: 4;
          image-rendering: pixelated;
          transition: filter 1.5s ease, opacity 0.8s ease;
        }
        #schoolEntity.morphing {
          filter: brightness(1.3) saturate(0.5) blur(2px);
        }
        #schoolEntity.human {
          filter: brightness(1) saturate(1) blur(0px);
        }
        #schoolNarrative {
          position: absolute;
          top: 8%;
          left: 50%;
          transform: translateX(-50%);
          color: rgba(200, 200, 220, 0.9);
          font-size: 1.3rem;
          text-align: center;
          max-width: 80%;
          line-height: 1.8;
          text-shadow: 0 2px 10px rgba(0,0,0,0.8);
          font-family: 'Courier New', monospace;
          opacity: 0;
          transition: opacity 0.6s ease;
          z-index: 10;
        }
        #schoolNarrative.show { opacity: 1; }
        #schoolHint {
          position: absolute;
          bottom: 8px;
          left: 50%;
          transform: translateX(-50%);
          color: rgba(150, 150, 170, 0.5);
          font-size: 0.85rem;
          font-family: 'Courier New', monospace;
          z-index: 10;
        }
      `;
      document.head.appendChild(style);
    }

    // ========================================
    // PHASE 1: Auto-advancing narrative texts
    // ========================================
    scene.className = "scene-narrative";
    hero.style.display = "none";
    
    // Show cursor during narrative phase
    if (root) root.classList.remove("hide-cursor");

    // Wait 30 seconds (free time) before showing narrative text
    // Pause functionality - declare globally
    window.isPaused = false;
    window.pauseMenu = null;
    
    // Wait function that respects pause
    const waitMs = async (ms) => {
      const start = Date.now();
      while (Date.now() - start < ms) {
        // Check if paused and wait longer if so
        if (window.isPaused) {
          await new Promise(resolve => setTimeout(resolve, 200));
        } else {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    };
    await waitMs(8000);

    // Check if narrative already completed - skip to ATTO screen
    const savedProgress = localStorage.getItem('eov_atto1_progress');
    if (savedProgress === 'narrative_complete') {
      // Skip the narrative, go directly to ATTO screen
      // Show placeholder and skip to school corridor
      scene.className = "scene-school-atmosphere";
      // Continue with school corridor setup (will be handled later)
    }

    let narrativeBox = document.getElementById("narrativeTextBox");
    if (!narrativeBox) {
      narrativeBox = document.createElement("div");
      narrativeBox.id = "narrativeTextBox";
      scene.appendChild(narrativeBox);
    }

    // Create skip button (hidden by default - right click will be used)
    const skipBtn = document.createElement("button");
    skipBtn.id = "narrativeSkipBtn";
    skipBtn.textContent = "SALTA >";
    skipBtn.style.cssText = "position: absolute; bottom: 30px; right: 30px; padding: 12px 24px; background: rgba(100,80,60,0.8); border: 1px solid rgba(150,130,100,0.5); color: #c9b896; font-family: 'Courier New', monospace; font-size: 14px; cursor: pointer; z-index: 50; opacity: 0; transition: opacity 0.5s; border-radius: 4px;";
    scene.appendChild(skipBtn);

    // Create pause button
    const pauseBtn = document.createElement("button");
    pauseBtn.id = "narrativePauseBtn";
    pauseBtn.textContent = "PAUSA";
    pauseBtn.style.cssText = "position: fixed; bottom: 30px; left: 30px; padding: 12px 24px; background: rgba(100,80,60,0.9); border: 2px solid rgba(200,180,140,0.8); color: #fff; font-family: 'Courier New', monospace; font-size: 16px; cursor: pointer; z-index: 9999; opacity: 1; border-radius: 4px;";
    document.body.appendChild(pauseBtn);

    // Pause functionality
    
    const togglePause = () => {
      // If pause menu already exists, remove it and resume
      const existingMenu = document.getElementById("pauseMenu");
      if (existingMenu) {
        existingMenu.remove();
        window.isPaused = false;
        return;
      }
      
      // Create pause menu
      window.pauseMenu = document.createElement("div");
      window.pauseMenu.id = "pauseMenu";
      window.pauseMenu.style.cssText = "position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.9); z-index: 99999; display: flex; flex-direction: column; justify-content: center; align-items: center; cursor: default;";
      window.pauseMenu.innerHTML = `
        <div style="font-family: 'Times New Roman', serif; font-size: 2rem; color: #c9b896; margin-bottom: 40px;">PAUSA</div>
        <button id="pauseResume" style="padding: 15px 40px; margin: 10px; background: rgba(100,80,60,0.9); border: 2px solid rgba(200,180,140,0.8); color: #fff; font-family: 'Courier New', monospace; font-size: 16px; cursor: pointer; border-radius: 4px; cursor: default;">RIPRENDI</button>
        <button id="pauseAbandon" style="padding: 15px 40px; margin: 10px; background: rgba(150,60,60,0.9); border: 2px solid rgba(200,100,100,0.8); color: #fff; font-family: 'Courier New', monospace; font-size: 16px; cursor: pointer; border-radius: 4px; cursor: default;">ABBANDONA</button>
        <button id="pauseLogout" style="padding: 15px 40px; margin: 10px; background: rgba(60,60,150,0.9); border: 2px solid rgba(100,100,200,0.8); color: #fff; font-family: 'Courier New', monospace; font-size: 16px; cursor: pointer; border-radius: 4px; cursor: default;">LOGOUT</button>
      `;
      document.body.appendChild(window.pauseMenu);
      
      // Stop the narrative
      window.isPaused = true;
      
      document.getElementById("pauseResume").onclick = () => {
        const menu = document.getElementById("pauseMenu");
        if (menu) menu.remove();
        window.isPaused = false;
      };
      
      document.getElementById("pauseAbandon").onclick = () => {
        // Go to main menu / restart
        window.location.href = "/user/user_dashboard.php";
      };
      
      document.getElementById("pauseLogout").onclick = () => {
        // Logout and go to login
        window.location.href = "/api/logout.php";
      };
      
      // Click outside buttons to resume
      window.pauseMenu.addEventListener("click", (e) => {
        if (e.target === window.pauseMenu) {
          window.pauseMenu.remove();
          window.isPaused = false;
        }
      });
    };
    
    // Make togglePause accessible globally
    window.togglePause = togglePause;
    
    pauseBtn.onclick = togglePause;
    
    // ESC key to toggle pause
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        togglePause();
      }
    });

    // Show buttons immediately
    skipBtn.style.opacity = "0.7";
    pauseBtn.style.opacity = "0.7";
    
    // Also show after a short delay just in case
    setTimeout(() => { skipBtn.style.opacity = "0.7"; pauseBtn.style.opacity = "0.7"; }, 2000);

    // Skip mechanism - right click shows confirmation
    let skipNarrative = false;
    
    // Handle right click for skip with confirmation
    const handleRightClick = (e) => {
      e.preventDefault();
      // Create confirmation dialog
      const confirmDialog = document.createElement("div");
      confirmDialog.id = "skipConfirmDialog";
      confirmDialog.style.cssText = "position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.85); display: flex; flex-direction: column; justify-content: center; align-items: center; z-index: 100;";
      confirmDialog.innerHTML = `
        <div style="font-family: 'Times New Roman', serif; font-size: 1.5rem; color: #c9b896; margin-bottom: 30px; text-align: center;">Vuoi saltare questa parte?</div>
        <div style="display: flex; gap: 20px;">
          <button id="skipYes" style="padding: 12px 30px; background: rgba(100,80,60,0.8); border: 1px solid rgba(150,130,100,0.5); color: #c9b896; font-family: 'Courier New', monospace; font-size: 14px; cursor: pointer;">SÌ</button>
          <button id="skipNo" style="padding: 12px 30px; background: rgba(60,60,60,0.6); border: 1px solid rgba(100,100,100,0.5); color: #888; font-family: 'Courier New', monospace; font-size: 14px; cursor: pointer;">NO</button>
        </div>
      `;
      scene.appendChild(confirmDialog);

      document.getElementById("skipYes").addEventListener("click", () => {
        skipNarrative = true;
        confirmDialog.remove();
      });
      
      document.getElementById("skipNo").addEventListener("click", () => {
        confirmDialog.remove();
      });
    };
    
    // Add right click listener
    scene.addEventListener("contextmenu", handleRightClick);
    
    skipBtn.addEventListener("click", handleRightClick);

    // All narrative lines in order
    const allLines = [
      "La vita è sempre stata più difficile per Marco...",

      "...Non perché fosse fragile\nMa perché ha imparato presto a non reagire...",

      "...Ogni giorno subisce\nLe parole\nGli sguardi",
      "Le mani che sanno dove colpire senza lasciare segni evidenti",

      "Antonio",

      "Un ragazzo cresciuto solo nel corpo\nAbbastanza grande per fare male\nAbbastanza piccolo per non capire.",

      "Non urla\nNon minaccia...",

      "...Sorride",

      "mentre sorride spinge\nStringe\nSussurra cose che restano più dei lividi.",

      "Sa scegliere i momenti...\nI corridoi vuoti\nGli angoli ciechi.",

      "Sa che Marco non reagisce\nE questo gli basta.",

      "Marco abbassa lo sguardo\nAspetta\nCome ha sempre fatto.",

      "Antonio invece cresce\nNella sicurezza\nNella convinzione",

      "Perché chi non trova resistenza…\nImpara a spingere più forte.",
    ];

    // Show each line for ~2.5s, blank lines = 0.8s pause
    for (let i = 0; i < allLines.length; i++) {
      if (skipNarrative) {
        // Remove any remaining confirm dialog
        const existingConfirm = document.getElementById("skipConfirmDialog");
        if (existingConfirm) existingConfirm.remove();
        break; 
      }
      const line = allLines[i];
      if (line === "") {
        narrativeBox.classList.remove("show");
        await waitMs(800);
        continue;
      }
      narrativeBox.textContent = line;
      narrativeBox.classList.add("show");
      await waitMs(4500);
      if (skipNarrative) {
        const existingConfirm = document.getElementById("skipConfirmDialog");
        if (existingConfirm) existingConfirm.remove();
        break;
      }
      narrativeBox.classList.remove("show");
      await waitMs(1000);
    }

    // Hide skip button
    skipBtn.style.opacity = "0";
    pauseBtn.style.opacity = "0";
    setTimeout(() => { skipBtn.remove(); pauseBtn.remove(); }, 500);
    
    // Save progress - completed narrative
    localStorage.setItem('eov_atto1_progress', 'narrative_complete');
    // Remove right-click listener
    scene.removeEventListener("contextmenu", handleRightClick);

    // Brief pause before school scene
    narrativeBox.classList.remove("show");
    await waitMs(1500);

    // ========================================
    // ATTO 1 - passività screen
    // ========================================
    const attoScreen = document.createElement("div");
    attoScreen.id = "attoScreen";
    attoScreen.innerHTML = `
      <div class="atto-title">ATTO 1</div>
      <div class="atto-subtitle">passività</div>
      <div class="atto-chapter">capitolo 1</div>
    `;
    scene.appendChild(attoScreen);

    // Add styles for ATTO screen
    if (!document.getElementById("attoScreenStyle")) {
      const style = document.createElement("style");
      style.id = "attoScreenStyle";
      style.textContent = `
        #attoScreen {
          position: absolute;
          top: 0; left: 0; right: 0; bottom: 0;
          background: #000;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          z-index: 100;
          animation: fadeInAtto 2s ease forwards;
        }
        @keyframes fadeInAtto {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        .atto-title {
          font-family: 'Times New Roman', serif;
          font-size: 4rem;
          color: #c9b896;
          letter-spacing: 0.5em;
          margin-bottom: 0.5rem;
          text-transform: uppercase;
          opacity: 0;
          animation: fadeInText 2s ease 0.5s forwards;
        }
        .atto-subtitle {
          font-family: 'Times New Roman', serif;
          font-size: 2rem;
          color: #8a7a5a;
          font-style: italic;
          letter-spacing: 0.3em;
          margin-bottom: 2rem;
          opacity: 0;
          animation: fadeInText 2s ease 1s forwards;
        }
        .atto-chapter {
          font-family: 'Courier New', monospace;
          font-size: 1rem;
          color: #5a5a5a;
          letter-spacing: 0.2em;
          opacity: 0;
          animation: fadeInText 2s ease 1.5s forwards;
        }
        @keyframes fadeInText {
          0% { opacity: 0; transform: translateY(10px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `;
      document.head.appendChild(style);
    }

    // Wait for the screen to display
    await waitMs(4000);

    // Fade out
    attoScreen.style.transition = "opacity 2s ease";
    attoScreen.style.opacity = "0";
    await waitMs(2500);
    attoScreen.remove();


    // ========================================
    // Create pause button for gameplay (after Atto 1 title)
    // ========================================
    window.isPaused = false;
    window.pauseMenu = null;

    const gamePauseBtn = document.createElement("button");
    gamePauseBtn.id = "gamePauseBtn";
    gamePauseBtn.textContent = "PAUSA";
    gamePauseBtn.style.cssText = "position: fixed; bottom: 30px; left: 30px; padding: 12px 24px; background: rgba(100,80,60,0.9) !important; border: 2px solid rgba(200,180,140,0.8) !important; color: #fff !important; font-family: 'Courier New', monospace; font-size: 16px; cursor: pointer; z-index: 999999 !important; border-radius: 4px; display: block !important; visibility: visible !important; opacity: 1 !important; pointer-events: auto;";
    gamePauseBtn.style.display = "block";
    gamePauseBtn.style.visibility = "visible";
    gamePauseBtn.style.opacity = "1";
    gamePauseBtn.style.pointerEvents = "auto";
    document.body.appendChild(gamePauseBtn);

    const gameTogglePause = () => {
      console.log("gameTogglePause called");
      // Remove any existing pause menus
      const existingPauseMenus = document.querySelectorAll('#pauseMenu');
      existingPauseMenus.forEach(menu => menu.remove());
      
      const existingMenu = document.getElementById("pauseMenu");
      console.log("Existing menu:", existingMenu);
      if (existingMenu) {
        existingMenu.remove();
        window.isPaused = false;
        return;
      }

      window.pauseMenu = document.createElement("div");
      window.pauseMenu.style.cssText = "position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.9) !important; z-index: 9999999 !important; display: flex !important; flex-direction: column; justify-content: center; align-items: center; cursor: default;";
      window.pauseMenu.innerHTML = `
        <div style="font-family: 'Times New Roman', serif; font-size: 2rem; color: #c9b896; margin-bottom: 40px; white-space: pre-line;">PAUSA</div>
        <button id="pauseResume" style="padding: 15px 40px; margin: 10px; background: rgba(100,80,60,0.9); border: 2px solid rgba(200,180,140,0.8); color: #fff; font-family: 'Courier New', monospace; font-size: 16px; cursor: pointer; border-radius: 4px; white-space: pre-line;">RIPRENDI</button>
        <button id="pauseAbandon" style="padding: 15px 40px; margin: 10px; background: rgba(150,60,60,0.9); border: 2px solid rgba(200,100,100,0.8); color: #fff; font-family: 'Courier New', monospace; font-size: 16px; cursor: pointer; border-radius: 4px; white-space: pre-line;">ABBANDONA</button>
        <button id="pauseLogout" style="padding: 15px 40px; margin: 10px; background: rgba(60,60,150,0.9); border: 2px solid rgba(100,100,200,0.8); color: #fff; font-family: 'Courier New', monospace; font-size: 16px; cursor: pointer; border-radius: 4px; white-space: pre-line;">LOGOUT</button>
      `;
      document.body.appendChild(window.pauseMenu);

      window.isPaused = true;

      // Use addEventListener instead of onclick
      const resumeBtn = document.getElementById("pauseResume");
      const abandonBtn = document.getElementById("pauseAbandon");
      const logoutBtn = document.getElementById("pauseLogout");
      
      if (resumeBtn) {
        resumeBtn.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          // Remove the entire menu (parent of the button)
          const menu = resumeBtn.parentElement;
          if (menu) menu.remove();
          window.isPaused = false;
        });
      }

      if (abandonBtn) {
        abandonBtn.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          // Redirect to index with cache-busting
          window.location.href = 'http://localhost:4000/index/index.html?t=' + Date.now();
        });
      }

      if (logoutBtn) {
        logoutBtn.addEventListener('click', async function(e) {
          e.preventDefault();
          e.stopPropagation();
          // First logout, then redirect to login
          try {
            await fetch('http://localhost:8000/api/logout.php', {
              method: 'POST',
              credentials: 'include'
            });
          } catch (err) {}
          // Redirect to login with cache-busting
          window.location.href = 'http://localhost:4000/login/login.html?t=' + Date.now();
        });
      }

      window.pauseMenu.addEventListener("click", (e) => {
        if (e.target === window.pauseMenu) {
          window.pauseMenu.remove();
          window.isPaused = false;
        }
      });
    };

    window.togglePause = gameTogglePause;
    gamePauseBtn.onclick = function() { gameTogglePause(); };

    window.addEventListener("keydown", function(e) { 
      if (e.key === "Escape") { 
        e.preventDefault(); 
        // Check if any pause menu exists
        const existingMenu = document.querySelector('#pauseMenu');
        if (existingMenu) {
          // Menu exists - close it
          existingMenu.remove();
          window.isPaused = false;
        } else {
          // No menu - open it
          gameTogglePause();
        }
      } 
    });

    // ========================================
    // PHASE 2: School corridor - ATMOSPHERIC
    // ========================================
    narrativeBox.remove();
    scene.className = "scene-school-atmosphere";
    
    // Ensure cursor is visible in corridor
    if (root) root.classList.remove("hide-cursor");

    // Add comprehensive atmospheric styles
    if (!document.getElementById("schoolAtmosphereStyle")) {
      const style = document.createElement("style");
      style.id = "schoolAtmosphereStyle";
      style.textContent = `
        /* Base atmosphere */
        #firstActScene.scene-school-atmosphere {
          background: linear-gradient(180deg, #0d0a08 0%, #1a1512 50%, #0d0a08 100%) !important;
          overflow: hidden !important;
          display: block !important;
          cursor: default !important;
        }
        /* Ceiling - lower visual effect */
        #schoolCeiling {
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 18%;
          background: linear-gradient(180deg, #0a0806 0%, #151210 100%);
          border-bottom: 2px solid rgba(40, 30, 20, 0.6);
          z-index: 1;
        }
        /* Breathing walls animation */
        @keyframes breatheWalls {
          0%, 100% { transform: scaleX(1) scaleY(1); }
          50% { transform: scaleX(1.008) scaleY(1.005); }
        }
        #schoolWalls {
          position: absolute;
          top: 18%; left: 0; right: 0; bottom: 25%;
          animation: breatheWalls 8s ease-in-out infinite;
          transform-origin: center;
        }
        /* Floor */
        #schoolFloorAtm {
          position: absolute;
          bottom: 0; left: 0; right: 0;
          height: 25%;
          background: linear-gradient(180deg, #1a1512 0%, #0d0a08 100%);
          border-top: 3px solid rgba(50, 35, 25, 0.5);
        }
        /* Pulsing light */
        @keyframes pulseLight {
          0%, 100% { opacity: 0.08; }
          50% { opacity: 0.12; }
        }
        #schoolLightsAtm {
          position: absolute;
          top: 18%; left: 0; right: 0;
          height: 15%;
          background: repeating-linear-gradient(
            90deg,
            transparent 0px, transparent 200px,
            rgba(255, 245, 220, 0.08) 200px, rgba(255, 245, 220, 0.08) 220px
          );
          animation: pulseLight 6s ease-in-out infinite;
        }
        /* Lockers */
        #schoolLockersAtm {
          position: absolute;
          top: 33%; left: 0; right: 0;
          height: 42%;
          background: repeating-linear-gradient(
            90deg,
            rgba(35, 28, 22, 0.7) 0px, rgba(35, 28, 22, 0.7) 55px,
            rgba(25, 20, 15, 0.9) 55px, rgba(25, 20, 15, 0.9) 58px
          );
          border-bottom: 4px solid rgba(60, 45, 30, 0.4);
        }
        /* Floating words */
        .floating-word {
          position: absolute;
          font-family: 'Courier New', monospace;
          font-weight: bold;
          font-size: 1.2rem;
          color: rgba(120, 100, 80, 0.5);
          pointer-events: none;
          white-space: nowrap;
          animation: floatWord 12s linear infinite;
          z-index: 2;
        }
        @keyframes floatWord {
          0% { opacity: 0; transform: translateY(20px); }
          20% { opacity: 0.4; }
          80% { opacity: 0.3; }
          100% { opacity: 0; transform: translateY(-30px); }
        }
        /* Blurred secondary characters */
        .bg-character {
          position: absolute;
          bottom: 25%;
          opacity: 0.15;
          filter: blur(3px);
          z-index: 1;
        }
        /* Antonio silhouette */
        #antonioSilhouette {
          position: absolute;
          bottom: 25%;
          right: 12%;
          width: 60px;
          height: 110px;
          background: linear-gradient(180deg, #0a0a0a 0%, #151515 100%);
          clip-path: polygon(30% 0%, 70% 0%, 85% 20%, 90% 100%, 10% 100%, 15% 20%);
          opacity: 0;
          transition: opacity 2s ease, transform 0.5s ease;
          z-index: 3;
        }
        #antonioSilhouette.visible {
          opacity: 0.7;
        }
        #antonioSilhouette.closer {
          transform: scale(1.15);
        }
        /* Vignette overlay */
        #vignetteOverlay {
          position: absolute;
          top: 0; left: 0; right: 0; bottom: 0;
          background: radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.6) 100%);
          pointer-events: none;
          z-index: 10;
          opacity: 0;
          transition: opacity 1.5s ease;
        }
        #vignetteOverlay.active {
          opacity: 1;
        }
        /* Darkening filter */
        #darkeningOverlay {
          position: absolute;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0, 0, 0, 0);
          pointer-events: none;
          z-index: 9;
          transition: background 2s ease;
        }
        #darkeningOverlay.active {
          background: rgba(0, 0, 0, 0.25);
        }
        /* Hero */
        #atmHero {
          position: absolute;
          bottom: 25%;
          left: 8%;
          z-index: 5;
          image-rendering: pixelated;
          transition: left 0.08s linear, transform 0.3s ease;
        }
        #atmHero.stepBack {
          transform: translateX(-15px);
        }
        /* Hint */
        #atmHint {
          position: absolute;
          bottom: 10px;
          left: 50%;
          transform: translateX(-50%);
          color: rgba(100, 90, 80, 0.4);
          font-size: 0.75rem;
          font-family: 'Courier New', monospace;
          z-index: 15;
        }
        /* Final phrase */
        #finalPhrase {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          color: rgba(150, 140, 130, 0.8);
          font-size: 1.1rem;
          font-family: 'Courier New', monospace;
          text-align: center;
          opacity: 0;
          transition: opacity 3s ease;
          z-index: 20;
        }
        #finalPhrase.show {
          opacity: 1;
        }
      `;
      document.head.appendChild(style);
    }

    // Build atmospheric corridor
    scene.innerHTML = `
      <div id="schoolCeiling"></div>
      <div id="schoolWalls">
        <div id="schoolLightsAtm"></div>
        <div id="schoolLockersAtm"></div>
      </div>
      <div id="schoolFloorAtm"></div>
      <div id="vignetteOverlay"></div>
      <div id="darkeningOverlay"></div>
      <div id="atmHero"></div>
      <div id="antonioSilhouette"></div>
      <div id="atmHint">sinistra / destra</div>
      <div id="finalPhrase"></div>
    `;

    const atmHero = document.getElementById("atmHero");
    const antonioSil = document.getElementById("antonioSilhouette");
    const vignette = document.getElementById("vignetteOverlay");
    const darkening = document.getElementById("darkeningOverlay");
    const finalPhrase = document.getElementById("finalPhrase");
    const atmHint = document.getElementById("atmHint");

    // Floating words array
    const floatingWords = ["SPAZIO", "TEMPO", "CONFINE", "SBAGLIATO", "SOLO", "PERCHE'", "ANCORA", "SEMPRE", "DI NUOVO", "OGNI VOLTA", "RICORDA", "DIMENTICA", "TORNA", "VA'", "RESTA", "FERMO", "CAMMINA", "CORRI", "FERMATI"];
    const schoolWalls = document.getElementById("schoolWalls");

    // Create floating words periodically
    const wordInterval = setInterval(() => {
      if (document.getElementById("atmHero") === null) { clearInterval(wordInterval); return; }
      const word = document.createElement("div");
      word.className = "floating-word";
      word.textContent = floatingWords[Math.floor(Math.random() * floatingWords.length)];
      word.style.left = (15 + Math.random() * 70) + "%";
      word.style.top = (30 + Math.random() * 40) + "%";
      word.style.animationDuration = (10 + Math.random() * 8) + "s";
      schoolWalls.appendChild(word);
      setTimeout(() => word.remove(), 18000);
    }, 2000);

    // Blurred secondary characters (random silhouettes)
    const charPositions = [20, 35, 50, 65];
    const charColors = ["#1a1512", "#151210", "#1c1815"];
    charPositions.forEach((pos, idx) => {
      const charEl = document.createElement("div");
      charEl.className = "bg-character";
      charEl.style.left = pos + "%";
      charEl.style.width = (30 + Math.random() * 20) + "px";
      charEl.style.height = (80 + Math.random() * 40) + "px";
      charEl.style.background = charColors[idx % charColors.length];
      charEl.style.borderRadius = "30% 30% 10% 10%";
      scene.appendChild(charEl);
    });

    // Hero sprites
    const heroAtmAnim = {
      scale: 0.85,
      current: null,
      frame: 0,
      tick: 0,
      frameRate: 7,
      idle: { src: "/game/Personaggi_Gioco/Idle.png", frames: 1, w: 129, h: 128 },
      run: { src: "/game/Personaggi_Gioco/Run.png", frames: 8, w: 128, h: 128 },
      runBack: { src: "/game/Personaggi_Gioco/RunBack.png", frames: 8, w: 128, h: 128 }
    };

    const loadSheet = (sheet) => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        if (img.naturalWidth > 0 && img.naturalHeight > 0) {
          sheet.h = img.naturalHeight;
          sheet.w = Math.max(1, Math.floor(img.naturalWidth / sheet.frames));
        }
        resolve();
      };
      img.onerror = () => resolve();
      img.src = sheet.src;
    });

    await Promise.all([
      loadSheet(heroAtmAnim.idle),
      loadSheet(heroAtmAnim.run),
      loadSheet(heroAtmAnim.runBack)
    ]);

    const applyAtmHeroAnim = (mode) => {
      const sheet = heroAtmAnim[mode] || heroAtmAnim.idle;
      if (heroAtmAnim.current === mode) return;
      heroAtmAnim.current = mode;
      heroAtmAnim.frame = 0;
      heroAtmAnim.tick = 0;
      const dw = Math.round(sheet.w * heroAtmAnim.scale);
      const dh = Math.round(sheet.h * heroAtmAnim.scale);
      const sw = dw * sheet.frames;
      atmHero.style.width = dw + "px";
      atmHero.style.height = dh + "px";
      atmHero.style.backgroundImage = 'url("' + sheet.src + '")';
      atmHero.style.backgroundSize = sw + "px " + dh + "px";
      atmHero.style.backgroundPosition = "0px 0px";
      atmHero.style.backgroundRepeat = "no-repeat";
    };

    applyAtmHeroAnim("idle");

    // Audio system
    let audioCtx = null;
    let footstepBuffer = null;
    let breathingBuffer = null;
    let ambientOsc = null;

    const initAudio = async () => {
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        // Create synthetic footstep sound
        const footLength = audioCtx.sampleRate * 0.08;
        footstepBuffer = audioCtx.createBuffer(1, footLength, audioCtx.sampleRate);
        const footData = footstepBuffer.getChannelData(0);
        for (let i = 0; i < footLength; i++) {
          const env = Math.exp(-i / (footLength * 0.15));
          footData[i] = (Math.random() * 2 - 1) * env * 0.3;
        }
      } catch (e) { console.log("Audio init failed:", e); }
    };
    await initAudio();

    const playFootstep = (delay = 0) => {
      // Use the same footstep sound as the prologue
      if (!firstActSound) return;
      setTimeout(() => {
        if (firstActSound && firstActSound.footstep) {
          firstActSound.footstep(1);
        }
      }, delay);
    };

    // State
    let heroAtmPos = 8; // percentage from left
    const heroAtmMin = 5;
    const heroAtmMax = 90; // where Antonio stands, allow going further
    let stepCount = 0;
    let footstepDelay = 0;
    let antonioVisible = false;
    let antonioPhase = "far"; // far, approaching, close, retreating, gone
    let autoStepBackTriggered = false;
    let finalPhraseShown = false;

    // Controls
    const atmKeys = { left: false, right: false };
    const onAtmKeyDown = (e) => {
      if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a") atmKeys.left = true;
      if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") atmKeys.right = true;
    };
    const onAtmKeyUp = (e) => {
      if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a") atmKeys.left = false;
      if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") atmKeys.right = false;
    };
    window.addEventListener("keydown", onAtmKeyDown);
    window.addEventListener("keyup", onAtmKeyUp);

    // Main animation loop
    let lastFrameTime = 0;
    const atmAnimate = (timestamp) => {
      // Skip animation if paused
      if (window.isPaused) {
        requestAnimationFrame(atmAnimate);
        return;
      }
      if (!lastFrameTime) lastFrameTime = timestamp;
      const delta = timestamp - lastFrameTime;
      lastFrameTime = timestamp;

      const speed = 0.08;
      const dir = (atmKeys.right ? 1 : 0) - (atmKeys.left ? 1 : 0);

      // Store previous position
      const prevPos = heroAtmPos;

      if (dir > 0) {
        // Allow going past Antonio after he's gone
        const maxPos = (antonioPhase === "gone") ? heroAtmMax : (heroAtmMax - 15);
        heroAtmPos = Math.min(maxPos, heroAtmPos + speed);
        applyAtmHeroAnim("run");
      } else if (dir < 0) {
        heroAtmPos = Math.max(heroAtmMin, heroAtmPos - speed);
        applyAtmHeroAnim("runBack");
      } else {
        applyAtmHeroAnim("idle");
      }

      atmHero.style.left = heroAtmPos + "%";

      // Update animation frames
      heroAtmAnim.tick++;
      if (heroAtmAnim.tick >= heroAtmAnim.frameRate) {
        heroAtmAnim.tick = 0;
        const sheet = heroAtmAnim[heroAtmAnim.current] || heroAtmAnim.idle;
        heroAtmAnim.frame = (heroAtmAnim.frame + 1) % Math.max(1, sheet.frames);
        const fw = Math.round(sheet.w * heroAtmAnim.scale);
        atmHero.style.backgroundPosition = "-" + (heroAtmAnim.frame * fw) + "px 0px";
      }

      // Footstep sounds - play when moving
      if (dir !== 0 && Math.abs(heroAtmPos - prevPos) > 0.02) {
        stepCount++;
        if (stepCount >= 5) {
          footstepDelay = 80; // half frame delay after 5-6 steps
          if (stepCount >= 6) footstepDelay = 150; // more delay
        }
        playFootstep(footstepDelay);
      }

      // Distance to Antonio
      const distToAntonio = heroAtmMax - heroAtmPos;
      const approachRatio = Math.max(0, Math.min(1, 1 - distToAntonio / 50));

      // Antonio appearance
      if (approachRatio > 0.15 && !antonioVisible) {
        antonioVisible = true;
        antonioSil.classList.add("visible");
      }

      // Antonio approaches as you get closer
      if (antonioVisible) {
        if (approachRatio > 0.3) {
          antonioSil.classList.add("closer");
          antonioPhase = "approaching";
        }
        // Vignette effect
        if (approachRatio > 0.4) {
          vignette.classList.add("active");
        }
        // Darkening
        if (approachRatio > 0.55) {
          darkening.classList.add("active");
        }
        // Screen tilt
        if (approachRatio > 0.65) {
          scene.style.transform = "rotate(-0.5deg)";
        }
        // Slow down hero automatically
        if (approachRatio > 0.7 && !autoStepBackTriggered) {
          autoStepBackTriggered = true;
          // Auto step back after delay
          setTimeout(() => {
            atmHero.classList.add("stepBack");
            // Animate back
            const stepBack = () => {
              if (heroAtmPos > 20) {
                heroAtmPos -= 0.15;
                atmHero.style.left = heroAtmPos + "%";
                requestAnimationFrame(stepBack);
              } else {
                // Reset after step back
                setTimeout(() => {
                  atmHero.classList.remove("stepBack");
                  scene.style.transform = "";
                  vignette.classList.remove("active");
                  darkening.classList.remove("active");
                  antonioSil.classList.remove("visible", "closer");
                  antonioPhase = "gone";
                  atmHint.textContent = "";
                  // Show final phrase
                  if (!finalPhraseShown) {
                    finalPhraseShown = true;
                    setTimeout(() => {
                      finalPhrase.textContent = "Lo hai giÃ  fatto molte volte.";
                      finalPhrase.classList.add("show");
                    }, 1500);
                  }
                }, 800);
              }
            };
            stepBack();
          }, 1200);
        }
      }

      requestAnimationFrame(atmAnimate);
    };

    requestAnimationFrame(atmAnimate);

    // Hint fades out after first movement
    setTimeout(() => {
      if (atmHint) atmHint.style.transition = "opacity 2s", atmHint.style.opacity = "0";
    }, 4000);

    console.log("Atmospheric school corridor with Antonio started!");
  } catch (e) {
    console.error("Error in startDemoGameplay:", e);
  }
}

// =========================
// SALVATAGGIO (throttled) invia solo inventario al server
// =========================
async function saveProgress(payload = null) {

  // Se non viene passato payload, usa lo stato attuale del giocatore
  const data = payload ? payload : {
    inventory: []   // OBBLIGATORIO PER IL SERVER
  };

  // throttle salvataggi
  if (_saveTimeout) clearTimeout(_saveTimeout);

  _saveTimeout = setTimeout(async () => {
    _saveTimeout = null;

    try {
      const csrf = getCookie('csrf_token') || '';

      const res = await fetch('http://localhost:8000/api/save_progress.php', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrf
        },
        body: JSON.stringify(data)
      });

      // Se non autenticato --> login
      if (res.status === 401) {
        redirectToOfflineMode();
        return;
      }

      const j = await res.json().catch(() => null);

      console.log('save_progress response:', j, 'status', res.status);

      if (!res.ok) {
        console.warn('Errore salvataggio progressi:', j);
      }

    } catch (e) {
      console.error('Errore fetch save_progress:', e);
    }

  }, SAVE_THROTTLE_MS);
}

// =========================
// GESTIONE XP / LIVELLO / COIN
// Server-authoritative: il client invia solo l'evento di gioco.
// =========================
async function giveXP(action = 'monster_kill', options = {}) {
  const opts = options || {};
  if (typeof action !== 'string' || action.length === 0) return;

  try {
    const csrf = getCookie('csrf_token') || '';
    const prevLevel = playerProgress.level;
    const prevCoins = playerProgress.coins;

    const res = await fetch('http://localhost:8000/api/user/gain_xp.php', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrf
      },
      body: JSON.stringify({
        action,
        stage: 0,
        run_token: RUN_TOKEN
      })
    });

    if (res.status === 401) {
      redirectToOfflineMode();
      return;
    }

    const data = await res.json().catch(() => null);
    if (!res.ok || !data || !data.ok) {
      console.warn('Errore gain_xp:', data);
      if (res.status === 429) {
        floatingText('Attendi un attimo...', 200, 140, '#ffb347');
      }
      return;
    }

    if (data.run_token && typeof data.run_token === 'string') {
      RUN_TOKEN = data.run_token;
    }

    playerProgress.level = Number(data.new_level || 1);
    playerProgress.exp = Number(data.new_experience || 0);
    playerProgress.coins = Number(data.coins_now || 0);
    playerProgress.expToNext = xpNeededForLevel(playerProgress.level);

    if (!opts.silent) {
      try {
        const px = 100;
        const py = 100;
        const xpDelta = Number(data.xpEarned || 0);
        if (xpDelta > 0) {
          floatingText('+' + xpDelta + ' XP', px, py - 50, '#00d4ff');
        }
        if (playerProgress.level > prevLevel) {
          floatingText('LEVEL UP! (Lv ' + playerProgress.level + ')', px, py - 90, '#ffe380');
        }
        const coinDelta = playerProgress.coins - prevCoins;
        if (coinDelta > 0) {
          floatingText('+' + coinDelta + ' COINS', px + 30, py - 130, '#ffd166');
        }
      } catch (e) { /* ignore UI issues */ }
    }

    updateHUD();
  } catch (e) {
    console.error('Errore fetch gain_xp:', e);
  }
}

// =========================
// LAUNCH
// =========================
(async () => {
  console.log("Starting experience...");
  try {
    const user = await requireLoggedAccount();
    console.log("User:", user);
    if (!user) {
      console.log("No user, redirecting to login...");
      window.location.href = 'http://localhost:4000/login/login.html';
      return;
    }
    ensureFullscreenKick();
    if (user) {
      CURRENT_ACCOUNT = user;
      unlockPlayableLevel(1);
      await loadProgressFromServer();
    }
    console.log("Running prologue...");
    await runFirstActPrologue();
    console.log("Prologue done, narrative experience active.");
  } catch (e) {
    console.error("Error:", e);
  }
})();
