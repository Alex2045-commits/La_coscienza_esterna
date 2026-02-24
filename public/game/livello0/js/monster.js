class Mostro {
  constructor(spriteIdle, spriteWalk, spriteRun, attack1, attack2, attack3, spriteDead) {
    this.x = window.innerWidth - 250;
    this.y = window.innerHeight - 400;

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

    this.attackFrames = [7, 4, 7];
    this.walkFrames = 8;
    this.runFrames = 7;
    this.deadFrames = 3;
    this.idleFrames = 1;

    this.attackIndex = 0;
    this.isAttacking = false;

    this.frame = 0;
    this.frameCounter = 0;
    this.frameRate = 15;

    this.scale = 2;

    this.minX = 100;
    this.maxX = window.innerWidth - 100;

    this.health = 3;
    this.isDead = false;
    this.hasDiedAnimationPlayed = false;

    this.deathTime = 0;
    this.shouldRemove = false;

    // Gravità
    this.velocityY = 0;
    this.gravity = 0.5;
    this.isInAir = false;

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

      // ⭐ Premi XP SOLO se la funzione è definita
      if (typeof giveXP === "function") giveXP("l0_monster_kill");

      return;
    }
  }

  startAttack() {
    if (this.isDead) return;

    this.isAttacking = true;

    if (this.attackIndex === 0) {
      this.setSprite(this.spriteAttack1, this.attackFrames[0]);
    } else if (this.attackIndex === 1) {
      this.setSprite(this.spriteAttack2, this.attackFrames[1]);
    } else {
      this.setSprite(this.spriteAttack3, this.attackFrames[2]);
    }
  }

  Update() {
    // Morte
    if (this.isDead) {
      if (!this.hasDiedAnimationPlayed) {
        this.frameCounter++;
        if (this.frameCounter >= this.frameRate) {
          this.frameCounter = 0;
          this.frame++;
          if (this.frame >= this.totalFrames) {
            this.frame = this.totalFrames - 1;
            this.hasDiedAnimationPlayed = true;
          }
        }
      }

      if (Date.now() - this.deathTime >= 3000) {
        this.shouldRemove = true;
      }
      return;
    }

    // Gravità
    const onGround = this.y >= window.innerHeight - 400;

    if (!onGround || this.velocityY < 0) {
      this.velocityY += this.gravity;
    } else {
      this.velocityY = 0;
      this.y = window.innerHeight - 400;
      this.isInAir = false;
    }

    this.y += this.velocityY;

    if (this.y < 0) this.y = 0;

    // Movimento verso player
    const player = game.player;
    const distance = Math.abs(this.x - player.x);

    this.direction = this.x > player.x ? -1 : 1;

    // Attacco
    if (this.isAttacking) {
      this.frameCounter++;
      if (this.frameCounter >= this.frameRate) {
        this.frameCounter = 0;
        this.frame++;

        // Danno a metà animazione
        if (this.frame === Math.floor(this.totalFrames / 2)) {
          if (!player.isDead) {
            const px = player.x, pw = player.width;
            const mx = this.x, mw = this.frameWidth * this.scale;

            const collision = px + pw > mx && px < mx + mw;
            if (collision) player.takeHit();
          }
        }

        if (this.frame >= this.totalFrames) {
          this.isAttacking = false;
          this.attackIndex = (this.attackIndex + 1) % 3;
        }
      }
      return;
    }

    // Inseguimento
    if (distance < 100) {
      this.startAttack();
      return;
    }

    if (distance < 250) {
      this.speed = this.runSpeed;
      this.setSprite(this.spriteRun, this.runFrames);
    } else {
      this.speed = this.baseSpeed;
      this.setSprite(this.spriteWalk, this.walkFrames);
    }

    this.x += this.direction * this.speed;

    if (this.x < this.minX) this.x = this.minX;
    if (this.x > this.maxX - this.frameWidth * this.scale) {
      this.x = this.maxX - this.frameWidth * this.scale;
    }

    // Animazione
    this.frameCounter++;
    if (this.frameCounter >= this.frameRate) {
      this.frameCounter = 0;
      this.frame = (this.frame + 1) % this.totalFrames;
    }
  }

  Draw(ctx) {
    if (this.shouldRemove) return;

    const w = this.frameWidth * this.scale;
    const h = this.frameHeight * this.scale;

    ctx.save();

    if (this.direction === -1) {
      ctx.translate(this.x + w, this.y);
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
      w,
      h
    );

    ctx.restore();
  }

  getHitbox() {
    return {
      x: this.x,
      y: this.y,
      width: this.frameWidth * this.scale,
      height: this.frameHeight * this.scale
    };
  }
}
