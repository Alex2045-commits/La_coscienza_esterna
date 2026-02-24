class Mostro {
  constructor(spriteIdle, spriteWalk, spriteRun, attack1, attack2, attack3, spriteDead) {
    this.x = window.innerWidth - 250;
    this.y = window.innerHeight - 400;  // Allineamento con il player

    this.direction = -1;
    this.baseSpeed = 2;
    this.runSpeed = 4;
    this.speed = this.baseSpeed;

    this.spriteIdle = spriteIdle;
    this.spriteWalk = spriteWalk;
    this.spriteRun = spriteRun;

    this.spriteAttack1 = attack1;
    this.spriteAttack2 = attack2;
    this.spriteAttack3 = attack3;

    this.spriteDead = spriteDead;

    this.attackFrames = [5, 4, 4];
    this.walkFrames = 7;
    this.runFrames = 7;
    this.deadFrames = 6;
    this.idleFrames = 6;

    this.attackIndex = 0;
    this.isAttacking = false;

    this.frame = 0;
    this.frameCounter = 0;
    this.frameRate = 15;

    this.scale = 2;

    this.minX = 100;
    this.maxX = window.innerWidth - 100;

    this.health = 4;
    this.isDead = false;
    this.hasDiedAnimationPlayed = false;

    this.deathTime = 0;
    this.shouldRemove = false;

    // Variabili per la gravità e il movimento verticale
    this.velocityY = 0; // Velocità verticale
    this.gravity = 0.5; // Gravità
    this.isInAir = false; // Indica se il mostro è in aria

    this.setSprite(this.spriteWalk, this.walkFrames);
  }

  setSprite(sprite, totalFrames) {
    if (this.sprite !== sprite) {
      this.sprite = sprite;
      this.totalFrames = totalFrames;
      this.frameWidth = sprite.width / totalFrames;
      this.frameHeight = sprite.height;
      this.frame = 0;
      this.frameCounter = 0;
    }
  }

  takeHit() {
    if (this.isDead) return;

    this.health--;
    if (this.health <= 0) {
      this.isDead = true;
      this.setSprite(this.spriteDead, this.deadFrames);
      this.deathTime = Date.now();
      if (typeof giveXP === "function") giveXP("l2_monster_kill");
    }
  }

  startAttack() {
    if (this.isDead) return;

    this.isAttacking = true;

    if (this.attackIndex === 0) {
      this.setSprite(this.spriteAttack1, this.attackFrames[0]);
    } else if (this.attackIndex === 1) {
      this.setSprite(this.spriteAttack2, this.attackFrames[1]);
    } else if (this.attackIndex === 2) {
      this.setSprite(this.spriteAttack3, this.attackFrames[2]);
    }
  }

  Update() {
  if (this.isDead) {
    if (!this.hasDiedAnimationPlayed) {
      this.frameCounter++;
      if (this.frameCounter >= this.frameRate) {
        this.frameCounter = 0;
        this.frame++;

        // Se i frame sono finiti, fermiamo l'animazione di morte
        if (this.frame >= this.totalFrames) {
          this.frame = this.totalFrames - 1;
          this.hasDiedAnimationPlayed = true;

          // Rimuoviamo il mostro dopo un breve intervallo
          setTimeout(() => {
            this.shouldRemove = true;
          }, 500); // Aggiungi un piccolo ritardo prima della rimozione
        }
      }
    }
    return;
  }

  // Gestione del movimento verticale (gravità)
  const onGround = this.y >= window.innerHeight - 350; // Verifica se il mostro è a terra

  if (!onGround || this.velocityY < 0) {
    this.velocityY += this.gravity; // Se non è a terra, applica la gravità
  } else {
    this.velocityY = 0; // Se è a terra, fermiamo la velocità verticale
    this.y = window.innerHeight - 350; // Posiziona il mostro a terra
    this.isInAir = false;
  }

  this.y += this.velocityY; // Aggiorna la posizione verticale

  // Limita i movimenti per evitare che il mostro esca dallo schermo
  if (this.y < 0) this.y = 0;

  const player = game.player;
  const distanceToPlayer = Math.abs(this.x - player.x);

  this.direction = this.x > player.x ? -1 : 1;

  if (this.isAttacking) {
    this.frameCounter++;
    if (this.frameCounter >= this.frameRate) {
      this.frameCounter = 0;
      this.frame++;

      if (this.frame === Math.floor(this.totalFrames / 2)) {
        if (!player.isDead) {
          const px = player.x;
          const pw = player.width;
          const mx = this.x;
          const mw = this.frameWidth * this.scale;

          const collision = px + pw > mx && px < mx + mw;
          if (collision) {
            player.takeHit();
          }
        }
      }

      if (this.frame >= this.totalFrames) {
        this.isAttacking = false;
        this.attackIndex = (this.attackIndex + 1) % 3;
      }
    }
    return;
  }

  if (distanceToPlayer < 100) {
    this.startAttack();
    return;
  }

  if (distanceToPlayer < 250) {
    this.speed = this.runSpeed;
    this.setSprite(this.spriteRun, this.runFrames);
  } else {
    this.speed = this.baseSpeed;
    if (this.speed === 0) {
      this.setSprite(this.spriteIdle, this.idleFrames);
    } else {
      this.setSprite(this.spriteWalk, this.walkFrames);
    }
  }

  this.x += this.direction * this.speed;

  if (this.x < this.minX) this.x = this.minX;
  if (this.x > this.maxX - this.frameWidth * this.scale) {
    this.x = this.maxX - this.frameWidth * this.scale;
  }

  this.frameCounter++;
  if (this.frameCounter >= this.frameRate) {
    this.frameCounter = 0;
    this.frame = (this.frame + 1) % this.totalFrames;
  }
}


  Draw(ctx) {
    if (this.shouldRemove) return;

    const drawWidth = this.frameWidth * this.scale;
    const drawHeight = this.frameHeight * this.scale;

    ctx.save();

    if (this.direction === -1) {
      ctx.translate(this.x + drawWidth, this.y);
      ctx.scale(-1, 1);
    } else {
      ctx.translate(this.x, this.y);
    }

    ctx.drawImage(
      this.sprite,
      this.frame * this.frameWidth,
      0,
      this.frameWidth,
      this.frameHeight,
      0,
      0,
      drawWidth,
      drawHeight
    );

    ctx.restore();
  }

  getHitbox() {
    return {
      x: this.x,
      y: this.y,
      width: this.frameWidth * this.scale,
      height: this.frameHeight * this.scale,
    };
  }
}
