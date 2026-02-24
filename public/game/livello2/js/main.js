function getCookie(name) {
  const m = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[2]) : null;
}

const LOGIN_PAGE_URL = '/login/login.html';
const CHAPTER_THREE_LINES = (window.EOV_STORY_BIBLE?.chapters || [])
  .find((c) => c.id === 3)?.beats || [
    "Austin sembra dominio. In realta e controllo subito.",
    "Specchi, doppi, stanze vuote: sapere non basta ad agire.",
    "Marco vede se stesso nell'altro: coscienza senza decisione."
  ];

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

async function giveXP(action, options = {}) {
  if (!action) return;
  try {
    if (!window.__EOV_RUN_TOKEN) window.__EOV_RUN_TOKEN = null;
    const csrf = getCookie('csrf_token') || '';
    const res = await fetch('/api/user/gain_xp.php', {
      method: 'POST',
      credentials: 'include',
      keepalive: Boolean(options.keepalive),
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrf
      },
      body: JSON.stringify({
        action,
        stage: 2,
        run_token: window.__EOV_RUN_TOKEN
      })
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || !data.ok) {
      console.warn('gain_xp failed', action, data);
      return null;
    }
    if (data.run_token && typeof data.run_token === 'string') {
      window.__EOV_RUN_TOKEN = data.run_token;
    }
    if (!options.silent) {
      console.log('Reward', action, data.xpEarned, data.coinsEarned);
    }
    return data;
  } catch (e) {
    console.warn('gain_xp error', e);
    return null;
  }
}

let __unlockKeyCache = null;
async function getUnlockedLevelStorageKey() {
  if (__unlockKeyCache) return __unlockKeyCache;
  try {
    const res = await fetch('/api/me.php', {
      method: 'GET',
      credentials: 'include'
    });
    const user = await res.json().catch(() => null);
    if (res.ok && user && user.id) {
      __unlockKeyCache = `eov_unlocked_level_u${user.id}`;
      return __unlockKeyCache;
    }
  } catch (e) {
    console.warn('unlock key fallback', e);
  }
  __unlockKeyCache = 'eov_unlocked_level_guest';
  return __unlockKeyCache;
}

async function unlockPlayableLevel(level) {
  const safe = Math.max(1, Math.min(4, Number(level) || 1));
  const key = await getUnlockedLevelStorageKey();
  const current = Number(localStorage.getItem(key) || 1);
  if (!Number.isFinite(current) || safe > current) {
    localStorage.setItem(key, String(safe));
  }
}

function setCurrentStoryLevel(level) {
  const safe = Math.max(1, Math.min(4, Number(level) || 1));
  const uid = CURRENT_ACCOUNT && CURRENT_ACCOUNT.id ? CURRENT_ACCOUNT.id : "guest";
  localStorage.setItem(`eov_current_level_u${uid}`, String(safe));
}

function updateLevel2Hud(health, score) {
  const lvlEl = document.getElementById("levelDisplay");
  const coinEl = document.getElementById("coinAmount");
  const heartsImg = document.getElementById("heartsHudImage");

  if (lvlEl) lvlEl.textContent = "Stage 2 | Player Lv 1";
  if (coinEl) coinEl.textContent = String(Math.max(0, Number(score) || 0));
  if (!heartsImg) return;

  const h = Number(health);
  if (h >= 3) heartsImg.src = "CuoriGioco/3cuori.png";
  else if (h === 2) heartsImg.src = "CuoriGioco/2cuori.png";
  else if (h === 1) heartsImg.src = "CuoriGioco/1cuore.png";
  else heartsImg.src = "CuoriGioco/0cuori.png";
}

function drawScrollableBackground(game) {
  if (!game.background1) return;

  const canvasW = game.canvas.width;
  const canvasH = game.canvas.height;
  const player = game.player;

  // Mappa visuale più ampia del canvas per effetto camera.
  const worldW = Math.round(canvasW * 1.55);
  const worldH = canvasH;
  const maxOffsetX = Math.max(0, worldW - canvasW);

  let offsetX = 0;
  if (player && player.width) {
    const maxPlayerX = Math.max(1, canvasW - player.width);
    const p = Math.max(0, Math.min(1, player.x / maxPlayerX));
    offsetX = -Math.round(maxOffsetX * p);
  }

  game.ctx.drawImage(game.background1, offsetX, 0, worldW, worldH);
}

function startStoryRotation(lines) {
  const storyEl = document.querySelector("#storyHint p");
  if (!storyEl || !Array.isArray(lines) || lines.length === 0) return;
  const resolveNarrativeColor = window.EOV_getNarrativeColor || ((_, fallback) => fallback || "#d7dbe8");

  let idx = 0;
  let timer = null;
  let paused = false;
  let destroyed = false;
  const cleanLines = lines.map((s) => String(s || "").trim()).filter(Boolean);
  if (cleanLines.length === 0) return;

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
    storyEl.style.color = resolveNarrativeColor(text, "#d7dbe8");
    const readMs = Math.max(5200, Math.min(12000, 1900 + text.length * 55));
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

function ensureGlobalGameActions(onLeaveLevel) {
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
  homeBtn.onclick = async () => {
    if (typeof onLeaveLevel === "function") {
      await onLeaveLevel({ keepalive: true });
    }
    window.location.href = '/index/index.html';
  };

  const logoutBtn = mkBtn('Logout');
  logoutBtn.onclick = async () => {
    if (typeof onLeaveLevel === "function") {
      await onLeaveLevel({ keepalive: true });
    }
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

function Game() {
  this.cellSize = 32;
  this.viewX = 0;
  this.viewY = 0;
  this.canvas = document.getElementById("GameCanvas");
  this.ctx = this.canvas.getContext("2d");
  this.tiles = [];
  this.blocks = [];
  this.player = null;
  this.monster = null;
  this.secondMonster = null; // nuovo mostro
  this.gravity = 0.4;
  
  // Percorso corretto per la musica di sottofondo
  this.backgroundMusic = new Audio("/game/livello2/sounds/musica_sfondo.mp3");
  this.backgroundMusic.loop = true;
  this.backgroundMusic.volume = 0.5; // Opzionale: regola il volume (da 0 a 1)
  this.backgroundMusic.preload = "auto";
  this.backgroundMusic.setAttribute("playsinline", "true");
  this.storyController = null;
  this.musicAutoRetryBound = false;
  this.wasMusicPlayingBeforePause = false;
  this.musicRetryTimer = null;
  this.musicRetryUntil = 0;
  this.isAudioUnlocked = function () {
    try { return localStorage.getItem("eov_audio_unlocked") === "1" || sessionStorage.getItem("eov_audio_unlocked") === "1"; } catch (_) { return false; }
  };
  this.markAudioUnlocked = function () {
    try { localStorage.setItem("eov_audio_unlocked", "1"); } catch (_) {}
    try { sessionStorage.setItem("eov_audio_unlocked", "1"); } catch (_) {}
  };
  this.stopMusicRetryLoop = function () {
    if (this.musicRetryTimer) {
      clearInterval(this.musicRetryTimer);
      this.musicRetryTimer = null;
    }
  };
  this.startMusicRetryLoop = function () {
    this.musicRetryUntil = Date.now() + 20000;
    this.stopMusicRetryLoop();
    this.musicRetryTimer = setInterval(() => {
      if (!this.backgroundMusic.paused) {
        this.stopMusicRetryLoop();
        return;
      }
      if (Date.now() > this.musicRetryUntil) {
        this.stopMusicRetryLoop();
        return;
      }
      this.startBackgroundMusic(false);
    }, 800);
  };
  this.startBackgroundMusic = function (preferAudible = true) {
    const attempt = this.backgroundMusic.play();
    if (!attempt || typeof attempt.then !== "function") return;
    attempt.then(() => {
      this.markAudioUnlocked();
      if (preferAudible && this.backgroundMusic.muted) {
        this.backgroundMusic.muted = false;
        this.backgroundMusic.play().catch(() => {});
      }
      this.stopMusicRetryLoop();
    }).catch(err => {
      console.warn("Autoplay musica bloccato dal browser:", err);
    });
  };
  this.bootstrapBackgroundMusic = function () {
    const unlocked = this.isAudioUnlocked();
    this.backgroundMusic.muted = !unlocked;
    this.startBackgroundMusic(unlocked);
    this.startMusicRetryLoop();
  };
  this.enableMusicAutoRetry = function () {
    if (this.musicAutoRetryBound) return;
    this.musicAutoRetryBound = true;

    const retry = () => this.startBackgroundMusic(true);
    ["click", "keydown", "pointerdown", "touchstart", "mousemove"].forEach((ev) => {
      window.addEventListener(ev, retry, { passive: true });
    });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) retry();
    });
    window.addEventListener("focus", retry);
    window.addEventListener("pageshow", retry);
    this.backgroundMusic.addEventListener("canplaythrough", retry);
  };
  
  this.keys = {};
  this.levelCompleted = false;
  this.runRollbackSent = false;
  this.exitGuardsBound = false;
  this.monsterSpawnCount = 1; // Primo mostro già presente
  this.maxMonsters = 3;       // Totale mostri da far apparire
  this.nextMonsterSpawnTime = null;
  this.secondMonsterSpawned = false;
  
  this.startTime = Date.now();

  // Nuove immagini dei cuori
  this.heart3 = new Image();
  this.heart2 = new Image();
  this.heart1 = new Image();
  this.heart0 = new Image();

  // Immagine per Game Over
  this.gameOverImage = new Image();

  // **Punteggio**
  this.score = 0;

  this.customCursor = new Image();
  this.customCursor.src = "/game/livello2/img/cursore.png";  // Percorso dell'immagine del cursore

  const cursorElement = document.createElement('img');
  cursorElement.classList.add('custom-cursor');
  cursorElement.src = this.customCursor.src;
  document.body.appendChild(cursorElement);

  // Funzione per aggiornare la posizione del cursore
  this.updateCursorPosition = (e) => {
    const mouseX = e.clientX;
    const mouseY = e.clientY;

    cursorElement.style.left = `${mouseX - cursorElement.width / 2}px`;
    cursorElement.style.top = `${mouseY - cursorElement.height / 2}px`;
    cursorElement.style.display = 'block';  // Mostra il cursore
  };

  window.addEventListener('mousemove', this.updateCursorPosition);

  // Funzione per nascondere il cursore quando il gioco è in pausa
  this.togglePause = function() {
    this.paused = !this.paused;
    if (!this.paused) {
      this.startTime = Date.now() - (this.startTime - this.nextMonsterSpawnTime); // Riavvia il cronometro
      this.GameLoop();  // Riprendi il ciclo di gioco
    }
  };

  this.resizeCanvas = function () {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  };

  this.resizeCanvas();
  window.addEventListener('resize', this.resizeCanvas.bind(this));

  const loadImage = (src) => {
    const img = new Image();
    img.src = src;
    return new Promise((resolve, reject) => {
      img.onload = () => resolve(img);
      img.onerror = reject;
    });
  };

  this.loadAssets = async function (callback) {
    try {
      await Promise.all([
        loadImage("/game/Personaggi_Gioco/Idle.png"),
        loadImage("/game/Personaggi_Gioco/Run.png"),
        loadImage("/game/Personaggi_Gioco/RunBack.png"),
        loadImage("/game/Personaggi_Gioco/Jump.png"),
        loadImage("/game/Personaggi_Gioco/JumpBack.png"),
        loadImage("/game/Personaggi_Gioco/Attack_1.png"),
        loadImage("/game/Personaggi_Gioco/Attack_2.png"),
        loadImage("/game/Personaggi_Gioco/Attack_3.png"),
        loadImage("/game/Personaggi_Gioco/AttackBack_1.png"),
        loadImage("/game/Personaggi_Gioco/AttackBack_2.png"),
        loadImage("/game/Personaggi_Gioco/AttackBack_3.png"),
        loadImage("/game/Personaggi_Gioco/Hurt.png"),
        loadImage("/game/Personaggi_Gioco/Dead.png"),
        loadImage("/game/livello2/img/livello2.png"),
        loadImage("/game/livello2/Primo_Mostro/Idle.png"),
        loadImage("/game/livello2/Primo_Mostro/Walk.png"),
        loadImage("/game/livello2/Primo_Mostro/Run.png"),
        loadImage("/game/livello2/Primo_Mostro/Attack_1.png"),
        loadImage("/game/livello2/Primo_Mostro/Attack_2.png"),
        loadImage("/game/livello2/Primo_Mostro/Attack_3.png"),
        loadImage("/game/livello2/Primo_Mostro/Dead.png"),
        // Immagini Secondo Mostro
        loadImage("/game/livello2/Secondo_Mostro/Idle.png"),
        loadImage("/game/livello2/Secondo_Mostro/Walk.png"),
        loadImage("/game/livello2/Secondo_Mostro/Run.png"),
        loadImage("/game/livello2/Secondo_Mostro/Attack_1.png"),
        loadImage("/game/livello2/Secondo_Mostro/Attack_2.png"),
        loadImage("/game/livello2/Secondo_Mostro/Attack_3.png"),
        loadImage("/game/livello2/Secondo_Mostro/Dead.png"),
        // Cuor
        loadImage("/game/livello2/CuoriGioco/3cuori.png"),
        loadImage("/game/livello2/CuoriGioco/2cuori.png"),
        loadImage("/game/livello2/CuoriGioco/1cuore.png"),
        loadImage("/game/livello2/CuoriGioco/0cuori.png"),
        // Game Over
        loadImage("/game/livello2/img/gameOver.png"),
      ]);

      // Assegnazione immagini cuori e game over
      this.heart3.src = "/game/livello2/CuoriGioco/3cuori.png";
      this.heart2.src = "/game/livello2/CuoriGioco/2cuori.png";
      this.heart1.src = "/game/livello2/CuoriGioco/1cuore.png";
      this.heart0.src = "/game/livello2/CuoriGioco/0cuori.png";

      this.gameOverImage.src = "/game/livello2/img/gameOver.png";

      // Immagini player
      this.sprPlayerIdle = new Image(); this.sprPlayerIdle.src = "/game/Personaggi_Gioco/Idle.png";
      this.sprPlayerRun = new Image(); this.sprPlayerRun.src = "/game/Personaggi_Gioco/Run.png";
      this.sprPlayerRunBack = new Image(); this.sprPlayerRunBack.src = "/game/Personaggi_Gioco/RunBack.png";
      this.sprPlayerJump = new Image(); this.sprPlayerJump.src = "/game/Personaggi_Gioco/Jump.png";
      this.sprPlayerJumpBack = new Image(); this.sprPlayerJumpBack.src = "/game/Personaggi_Gioco/JumpBack.png";
      this.sprAttack1 = new Image(); this.sprAttack1.src = "/game/Personaggi_Gioco/Attack_1.png";
      this.sprAttack2 = new Image(); this.sprAttack2.src = "/game/Personaggi_Gioco/Attack_2.png";
      this.sprAttack3 = new Image(); this.sprAttack3.src = "/game/Personaggi_Gioco/Attack_3.png";
      this.sprAttackBack1 = new Image(); this.sprAttackBack1.src = "/game/Personaggi_Gioco/AttackBack_1.png";
      this.sprAttackBack2 = new Image(); this.sprAttackBack2.src = "/game/Personaggi_Gioco/AttackBack_2.png";
      this.sprAttackBack3 = new Image(); this.sprAttackBack3.src = "/game/Personaggi_Gioco/AttackBack_3.png";
      this.sprPlayerHurt = new Image(); this.sprPlayerHurt.src = "/game/Personaggi_Gioco/Hurt.png";
      this.sprPlayerDead = new Image(); this.sprPlayerDead.src = "/game/Personaggi_Gioco/Dead.png";
      this.background1 = new Image(); this.background1.src = "/game/livello2/img/livello2.png";

      // Primo mostro
      this.sprMonsterIdle = new Image(); this.sprMonsterIdle.src = "/game/livello2/Primo_Mostro/Idle.png";
      this.sprMonsterWalk = new Image(); this.sprMonsterWalk.src = "/game/livello2/Primo_Mostro/Walk.png";
      this.sprMonsterRun = new Image(); this.sprMonsterRun.src = "/game/livello2/Primo_Mostro/Run.png";
      this.sprMonsterAttack1 = new Image(); this.sprMonsterAttack1.src = "/game/livello2/Primo_Mostro/Attack_1.png";
      this.sprMonsterAttack2 = new Image(); this.sprMonsterAttack2.src = "/game/livello2/Primo_Mostro/Attack_2.png";
      this.sprMonsterAttack3 = new Image(); this.sprMonsterAttack3.src = "/game/livello2/Primo_Mostro/Attack_3.png";
      this.sprMonsterDead = new Image(); this.sprMonsterDead.src = "/game/livello2/Primo_Mostro/Dead.png";

      // Secondo mostro
      this.sprSecondMonsterIdle = new Image(); this.sprSecondMonsterIdle.src = "/game/livello2/Secondo_Mostro/Idle.png";
      this.sprSecondMonsterWalk = new Image(); this.sprSecondMonsterWalk.src = "/game/livello2/Secondo_Mostro/Walk.png";
      this.sprSecondMonsterRun = new Image(); this.sprSecondMonsterRun.src = "/game/livello2/Secondo_Mostro/Run.png";
      this.sprSecondMonsterAttack1 = new Image(); this.sprSecondMonsterAttack1.src = "/game/livello2/Secondo_Mostro/Attack_1.png";
      this.sprSecondMonsterAttack2 = new Image(); this.sprSecondMonsterAttack2.src = "/game/livello2/Secondo_Mostro/Attack_2.png";
      this.sprSecondMonsterAttack3 = new Image(); this.sprSecondMonsterAttack3.src = "/game/livello2/Secondo_Mostro/Attack_3.png";
      this.sprSecondMonsterDead = new Image(); this.sprSecondMonsterDead.src = "/game/livello2/Secondo_Mostro/Dead.png";

      // Inizializza player e primo mostro
      this.player = new Player(
        this.sprPlayerIdle,
        this.sprPlayerRun,
        this.sprPlayerRunBack,
        this.sprPlayerJump,
        this.sprPlayerJumpBack,
        this.sprAttack1,
        this.sprAttack2,
        this.sprAttack3,
        this.sprAttackBack1,
        this.sprAttackBack2,
        this.sprAttackBack3,
        this.sprPlayerHurt,
        this.sprPlayerDead
      );

      this.monster = new Mostro(
        this.sprMonsterIdle,
        this.sprMonsterWalk,
        this.sprMonsterRun,
        this.sprMonsterAttack1,
        this.sprMonsterAttack2,
        this.sprMonsterAttack3,
        this.sprMonsterDead
      );
      this.monster.hasBeenScored = false;

      callback();
    } catch (error) {
      console.error("Error loading images:", error);
    }
  };

  // Funzione per spawnare il secondo mostro
  this.spawnSecondMonster = function () {
    this.secondMonster = new SecondoMostro(
      this.sprSecondMonsterIdle,
      this.sprSecondMonsterWalk,
      this.sprSecondMonsterRun,
      this.sprSecondMonsterAttack1,
      this.sprSecondMonsterAttack2,
      this.sprSecondMonsterAttack3,
      this.sprSecondMonsterDead
    );
    this.secondMonsterSpawned = true;
  };

  //per far spawnar il mostro di nuovo (primo mostro)
  this.spawnNewMonster = function () {
    this.monster = new Mostro(
      this.sprMonsterIdle,
      this.sprMonsterWalk,
      this.sprMonsterRun,
      this.sprMonsterAttack1,
      this.sprMonsterAttack2,
      this.sprMonsterAttack3,
      this.sprMonsterDead
    );
    this.monster.hasBeenScored = false; // Aggiunto flag per lo scored
    this.monsterSpawnCount++;
  };

  // Funzione per applicare la sfocatura al background
  this.applyBlur = () => {
    this.ctx.filter = 'blur(10px)'; // Aggiungi sfocatura
    this.ctx.drawImage(this.background1, 0, 0, this.canvas.width, this.canvas.height);
    this.ctx.filter = 'none'; // Ripristina il filtro
  };

  this.togglePause = function() {
    this.paused = !this.paused;
  };

  this.showPauseMenu = function() {
    this.applyBlur();
    this.ctx.fillStyle = "white";
    this.ctx.font = "60px Arial";
    this.ctx.textAlign = "center";
    this.ctx.fillText("PAUSA", this.canvas.width / 2, this.canvas.height / 2 - 100);

    // Bottone per "Riprendi gioco"
    this.ctx.font = "30px Arial";
    this.ctx.fillText("Riprendi gioco", this.canvas.width / 2, this.canvas.height / 2 + 40);

    // Bottone per "Torna alla schermata Home"
    this.ctx.fillText("Torna alla schermata Home", this.canvas.width / 2, this.canvas.height / 2 + 100);
  };

  let isPaused = false; // Stato globale di pausa

// Pausa con UI dedicata (più leggibile del testo su canvas)
this.ensurePauseMenu = () => {
  let menu = document.getElementById("gamePauseMenu");
  if (menu) return menu;

  menu = document.createElement("div");
  menu.id = "gamePauseMenu";
  menu.innerHTML = `
    <div class="pause-card">
      <h2 class="pause-title">PAUSA</h2>
      <p class="pause-subtitle">Gioco in pausa</p>
      <div class="pause-actions">
        <button id="resumeGameBtn" type="button">Riprendi</button>
        <button id="leaveGameBtn" type="button">Torna alla Home</button>
      </div>
    </div>
  `;

  const card = menu.querySelector(".pause-card");
  const resumeBtn = menu.querySelector("#resumeGameBtn");
  const leaveBtn = menu.querySelector("#leaveGameBtn");

  card?.addEventListener("click", (e) => e.stopPropagation());
  menu.addEventListener("click", () => {
    this.paused = false;
    this.resumeEverything();
    this.hidePauseMenu();
    this.GameLoop();
  });

  resumeBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    this.paused = false;
    this.resumeEverything();
    this.hidePauseMenu();
    this.GameLoop();
  });

  leaveBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    this.leaveLevelToHome();
  });

  document.body.appendChild(menu);
  return menu;
};

this.showPauseMenu = function() {
  this.ensurePauseMenu().classList.add("show");
};

this.hidePauseMenu = function() {
  const menu = document.getElementById("gamePauseMenu");
  if (menu) menu.classList.remove("show");
};

this.pauseEverything = () => {
  if (this.storyController && typeof this.storyController.pause === "function") {
    this.storyController.pause();
  }
  if (this.backgroundMusic && !this.backgroundMusic.paused) {
    this.wasMusicPlayingBeforePause = true;
    this.backgroundMusic.pause();
  } else {
    this.wasMusicPlayingBeforePause = false;
  }
};

this.resumeEverything = () => {
  if (this.storyController && typeof this.storyController.resume === "function") {
    this.storyController.resume();
  }
  if (this.wasMusicPlayingBeforePause) {
    this.startBackgroundMusic(true);
  }
  this.wasMusicPlayingBeforePause = false;
};

this.togglePause = function() {
  if (this.levelCompleted) return;
  this.paused = !this.paused;
  if (!this.paused) {
    this.resumeEverything();
    this.hidePauseMenu();
    this.GameLoop();
  } else {
    this.pauseEverything();
    this.showPauseMenu();
  }
};

this.rollbackRunProgress = async (options = {}) => {
  if (this.levelCompleted || this.runRollbackSent) return;
  if (!window.__EOV_RUN_TOKEN) return;
  this.runRollbackSent = true;
  await giveXP("level_failed", { silent: true, keepalive: Boolean(options.keepalive) });
  window.__EOV_RUN_TOKEN = null;
};

this.bindExitGuards = function() {
  if (this.exitGuardsBound) return;
  this.exitGuardsBound = true;

  window.addEventListener("pagehide", () => {
    this.rollbackRunProgress({ keepalive: true });
  });

  window.addEventListener("beforeunload", () => {
    this.rollbackRunProgress({ keepalive: true });
  });
};

this.leaveLevelToHome = async () => {
  await this.rollbackRunProgress({ keepalive: true });
  window.location.href = "/index/index.html";
};

// Ciclo di gioco principale
this.GameLoop = () => {
  if (this.paused) {
    this.showPauseMenu(); // Mostra il menu di pausa
    return; // Interrompe il ciclo, non aggiorna il gioco
  }

  if (this.player) this.player.Update(); // Aggiorna il gioco se non è in pausa
    // Gestione primo mostro
    if (this.monster) {
      this.monster.Update();

      if (this.monster.shouldRemove) {
        // Incrementa punteggio solo una volta
        if (!this.monster.hasBeenScored) {
          this.score += 10;
          this.monster.hasBeenScored = true;
        }

        // Gestione respawn se non ha raggiunto il massimo
        if (this.monsterSpawnCount < this.maxMonsters) {
          if (!this.nextMonsterSpawnTime) {
            this.nextMonsterSpawnTime = Date.now() + 3000; // aspetta 3 secondi
          } else if (Date.now() >= this.nextMonsterSpawnTime) {
            this.spawnNewMonster(); // Respawn del primo mostro
            this.nextMonsterSpawnTime = null;
          }
        } else {
          // Rimuovi mostro completamente se è l'ultimo
          this.monster = null;
        }
      }
    }

    // Spawn secondo mostro dopo 5 secondi o quando è sconfitto
    if (!this.secondMonsterSpawned && (Date.now() - this.startTime >= 15000)) {
      this.spawnSecondMonster(); // Respawn del secondo mostro se non è ancora apparso
    }

    // Update secondo mostro
    if (this.secondMonster) {
      this.secondMonster.Update();

      if (this.secondMonster.shouldRemove) {
        this.score += 20;
        this.secondMonster = null;

        // Respawn il secondo mostro se il numero massimo non è stato raggiunto
        if (this.monsterSpawnCount < 1) {
          this.spawnSecondMonster(); // Respawn del secondo mostro
        }
      }
    }

    // Fine gioco
    const noMoreFirstMonsters = this.monsterSpawnCount >= this.maxMonsters && !this.monster;
    const secondMonsterDefeated = this.secondMonsterSpawned && !this.secondMonster;

    if (noMoreFirstMonsters && secondMonsterDefeated) {
      this.completeLevel();
      return;
    }

    // Disegno
    this.Draw();

    window.requestAnimationFrame(this.GameLoop);
  };


  this.Draw = function () {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    if (this.player.isDead) {
      updateLevel2Hud(0, this.score);
      const heartsImg = document.getElementById("heartsHudImage");
      if (heartsImg) heartsImg.src = "CuoriGioco/0cuori.png";
      this.applyBlur();
      this.ctx.drawImage(this.gameOverImage, this.canvas.width / 2 - this.gameOverImage.width / 2, this.canvas.height / 2 - this.gameOverImage.height / 2);
      setTimeout(() => {
        this.leaveLevelToHome();
      }, 5000);
      return;
    }
    if (this.levelCompleted) {
      this.applyBlur();
      this.ctx.fillStyle = "white";
      this.ctx.font = "54px Arial";
      this.ctx.textAlign = "center";
      this.ctx.fillText("LEVEL COMPLETED", this.canvas.width / 2, this.canvas.height / 2);
      return;
    }
    
    // Controllo se il gioco è vinto
    const noMoreFirstMonsters = this.monsterSpawnCount >= this.maxMonsters && !this.monster;
    const secondMonsterDefeated = this.secondMonsterSpawned && !this.secondMonster;

    if (noMoreFirstMonsters && secondMonsterDefeated) {
      this.applyBlur();
      this.ctx.fillStyle = "white";
      this.ctx.font = "60px Arial";
      this.ctx.textAlign = "center";
      this.ctx.fillText("YOU WON!!", this.canvas.width / 2, this.canvas.height / 2 - 100);

      // Disegna il bottone per "Torna alla schermata Home"
      this.ctx.font = "30px Arial";
      this.ctx.fillText("Torna alla schermata Home", this.canvas.width / 2, this.canvas.height / 2 + 40);

      // Disegna il bottone per "Next Level"
      this.ctx.fillText("Next Level", this.canvas.width / 2, this.canvas.height / 2 + 100);

      // Aggiungi eventi per i click
      window.addEventListener('click', (e) => {
        const clickX = e.clientX;
        const clickY = e.clientY;

        // Verifica se l'utente ha cliccato sul bottone "Torna alla schermata Home"
        if (clickX >= this.canvas.width / 2 - 150 && clickX <= this.canvas.width / 2 + 150) {
          if (clickY >= this.canvas.height / 2 + 20 && clickY <= this.canvas.height / 2 + 50) {
            this.leaveLevelToHome();
          }
        }

        // Verifica se l'utente ha cliccato sul bottone "Next Level"
        if (clickX >= this.canvas.width / 2 - 150 && clickX <= this.canvas.width / 2 + 150) {
          if (clickY >= this.canvas.height / 2 + 80 && clickY <= this.canvas.height / 2 + 110) {
            window.location.href = "/game/livello3/livello3.html"; // Passa al prossimo livello
          }
        }
      });

      return;
    }

    // Disegna il background con effetto camera orizzontale.
    drawScrollableBackground(this);

    // Disegna il player
    if (this.player) {
      this.player.Draw(this.ctx);
      updateLevel2Hud(this.player.health, this.score);
    }

    // Allineamento mostro con il player: usa la stessa Y per il mostro
    if (this.monster) {
      const monsterYOffset = this.player.y; // Regola l'offset per abbassarlo un po'
      this.monster.Draw(this.ctx, monsterYOffset);
    }

    // Disegna il secondo mostro con lo stesso approccio
    if (this.secondMonster) {
      const secondMonsterYOffset = this.player.y; // Allineamento verticale anche per il secondo mostro
      this.secondMonster.Draw(this.ctx, secondMonsterYOffset);
    }

    // Disegna il punteggio
    this.ctx.fillStyle = "white";
    this.ctx.font = "30px Arial";
    this.ctx.fillText("Punteggio: " + this.score, 20, 40);
  };

  this.hidePreLoader = function () {
    const preLoader = document.getElementById('preLoader');
    if (preLoader) {
      setTimeout(() => {
        preLoader.classList.add('hidden');
      }, 500);
    }
  };

  this.StartGame = async function () {
    const user = await requireLoggedAccount();
    if (!user) return;
    CURRENT_ACCOUNT = user;
    setCurrentStoryLevel(3);
    ensureGlobalGameActions((opts) => this.rollbackRunProgress(opts));
    this.bindExitGuards();
    this.storyController = startStoryRotation(CHAPTER_THREE_LINES);
    this.enableMusicAutoRetry();
    this.bootstrapBackgroundMusic();
    this.loadAssets(() => {
      this.hidePreLoader();
      this.startBackgroundMusic(true);
      (async () => {
        const startRes = await giveXP("level_start", { silent: true });
        if (startRes && startRes.ok) {
          this.runRollbackSent = false;
        }
        unlockPlayableLevel(3);
        this.GameLoop();
      })();
    });
  };

  this.completeLevel = async () => {
    if (this.levelCompleted) return;
    this.levelCompleted = true;
    await giveXP("l2_level_complete");
    await unlockPlayableLevel(4);
    setCurrentStoryLevel(4);
    setTimeout(() => {
      window.location.href = "/game/livello3/livello3.html";
    }, 1400);
  };

  let attackCounter = 0;
  window.addEventListener('click', () => {
    if (this.paused || this.levelCompleted) return;
    if (this.player) {
      attackCounter = (attackCounter + 1) % 3;
      this.player.handleMouseClick(attackCounter);
    }
  });

  window.addEventListener("keydown", (e) => {
    this.keys[e.key] = true;

    // Se si preme uno dei tasti per mettere in pausa
    if (e.key === "Escape" || e.key === "p" || e.key === "Delete") {
      this.togglePause();
    }
  });

  window.addEventListener("keyup", (e) => {
    this.keys[e.key] = false;
  });
  this.canvas.addEventListener('click', () => {
    this.canvas.focus();
  });
}

let game = new Game();
game.StartGame();



