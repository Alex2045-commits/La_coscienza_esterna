let game = null;

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
        cursor: pointer;
      }
    `;
    document.head.appendChild(style);
  }

  if (document.getElementById('globalGameActions')) return;

  const wrap = document.createElement('div');
  wrap.id = 'globalGameActions';

  const homeBtn = document.createElement('button');
  homeBtn.type = 'button';
  homeBtn.className = 'game-action-btn';
  homeBtn.textContent = 'Home';
  homeBtn.onclick = () => {
    window.location.href = 'http://localhost:4000/index/index.html';
  };

  const loginBtn = document.createElement('button');
  loginBtn.type = 'button';
  loginBtn.className = 'game-action-btn';
  loginBtn.textContent = 'Login';
  loginBtn.onclick = () => {
    window.location.href = 'http://localhost:4000/login/login.html';
  };

  wrap.appendChild(homeBtn);
  wrap.appendChild(loginBtn);
  document.body.appendChild(wrap);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

function updateXpBar(value) {
  const bar = document.getElementById('xpBar');
  if (bar) bar.style.width = `${Math.max(0, Math.min(100, value))}%`;
}

function GameOffline() {
  this.canvas = document.getElementById('GameCanvas');
  this.ctx = this.canvas.getContext('2d');
  this.keys = {};
  this.gravity = 0.4;
  this.player = null;
  this.background = null;
  this.customCursor = null;
  this.attackCounter = 0;
  this.loopStartedAt = Date.now();

  this.resize = () => {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  };

  this.hidePreLoader = () => {
    const preLoader = document.getElementById('preLoader');
    if (preLoader) preLoader.classList.add('hidden');
  };

  this.loadAssets = async () => {
    const [
      sprIdle, sprRun, sprRunBack, sprJump, sprJumpBack,
      sprAttack1, sprAttack2, sprAttack3,
      sprAttackBack1, sprAttackBack2, sprAttackBack3,
      sprHurt, sprDead, bg, cursor
    ] = await Promise.all([
      loadImage('/game/Personaggi_Gioco/Idle.png'),
      loadImage('/game/Personaggi_Gioco/Run.png'),
      loadImage('/game/Personaggi_Gioco/RunBack.png'),
      loadImage('/game/Personaggi_Gioco/Jump.png'),
      loadImage('/game/Personaggi_Gioco/JumpBack.png'),
      loadImage('/game/Personaggi_Gioco/Attack_1.png'),
      loadImage('/game/Personaggi_Gioco/Attack_2.png'),
      loadImage('/game/Personaggi_Gioco/Attack_3.png'),
      loadImage('/game/Personaggi_Gioco/AttackBack_1.png'),
      loadImage('/game/Personaggi_Gioco/AttackBack_2.png'),
      loadImage('/game/Personaggi_Gioco/AttackBack_3.png'),
      loadImage('/game/Personaggi_Gioco/Hurt.png'),
      loadImage('/game/Personaggi_Gioco/Dead.png'),
      loadImage('/game/livello1/img/livello1.png'),
      loadImage('/game/livello1/img/cursore.png')
    ]);

    this.player = new Player(
      sprIdle, sprRun, sprRunBack, sprJump, sprJumpBack,
      sprAttack1, sprAttack2, sprAttack3,
      sprAttackBack1, sprAttackBack2, sprAttackBack3,
      sprHurt, sprDead
    );
    this.background = bg;
    this.customCursor = cursor;
  };

  this.drawCursor = () => {
    if (!this.customCursor || this.mouseX == null || this.mouseY == null) return;
    this.ctx.drawImage(this.customCursor, this.mouseX - 18, this.mouseY - 18, 40, 40);
  };

  this.update = () => {
    if (!this.player) return;
    this.player.Update();
    const elapsed = (Date.now() - this.loopStartedAt) / 1000;
    updateXpBar((elapsed * 4) % 100);
  };

  this.render = () => {
    if (this.background) {
      this.ctx.drawImage(this.background, 0, 0, this.canvas.width, this.canvas.height);
    } else {
      this.ctx.fillStyle = '#0e1a2a';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    if (this.player) this.player.Draw(this.ctx);

    this.ctx.fillStyle = '#e5f1ff';
    this.ctx.font = 'bold 24px Trebuchet MS';
    this.ctx.fillText('Offline Training', 18, this.canvas.height - 24);

    this.drawCursor();
  };

  this.gameLoop = () => {
    this.update();
    this.render();
    requestAnimationFrame(this.gameLoop);
  };

  this.bindEvents = () => {
    window.addEventListener('resize', this.resize);
    window.addEventListener('keydown', (e) => {
      this.keys[e.key] = true;
    });
    window.addEventListener('keyup', (e) => {
      this.keys[e.key] = false;
    });
    window.addEventListener('mousemove', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
    });
    window.addEventListener('click', () => {
      if (!this.player) return;
      this.attackCounter = (this.attackCounter + 1) % 3;
      this.player.handleMouseClick(this.attackCounter);
    });
  };

  this.start = async () => {
    ensureGlobalGameActions();
    this.resize();
    this.bindEvents();
    await this.loadAssets();
    this.hidePreLoader();
    this.gameLoop();
  };
}

window.addEventListener('load', async () => {
  try {
    game = new GameOffline();
    await game.start();
  } catch (e) {
    console.error('Offline game failed:', e);
  }
});
