function Player(
  spriteIdle, spriteRun, spriteRunBack, spriteJump, spriteJumpBack,
  spriteAttack1, spriteAttack2, spriteAttack3,
  spriteAttackBack1, spriteAttackBack2, spriteAttackBack3,
  spriteHurt, spriteDead
) {
  this.x = 100;
  this.y = window.innerHeight - 400;

  this.spriteIdle = spriteIdle;
  this.spriteRun = spriteRun;
  this.spriteRunBack = spriteRunBack;
  this.spriteJump = spriteJump;
  this.spriteJumpBack = spriteJumpBack;
  this.spriteAttack1 = spriteAttack1;
  this.spriteAttack2 = spriteAttack2;
  this.spriteAttack3 = spriteAttack3;
  this.spriteAttackBack1 = spriteAttackBack1;
  this.spriteAttackBack2 = spriteAttackBack2;
  this.spriteAttackBack3 = spriteAttackBack3;
  this.spriteHurt = spriteHurt;
  this.spriteDead = spriteDead;

  this.sprite = this.spriteIdle;

  this.velocityY = 0;
  this.isJumping = false;
  this.isInAir = false;
  this.isMovingRight = false;
  this.isMovingLeft = false;
  this.lastDirection = "right";
  this.speed = 5;

  this.jumpForce = -9;
  this.runFrames = 8;
  this.jumpFrames = 12;
  this.attackFrames = [6, 4, 3];

  this.frameX = 0;
  this.frameCount = 0;
  this.frameRate = 10;

  this.scaleFactor = 2;

  this.attackCounter = -1;
  this.isAttacking = false;
  this.attackReversed = false;

  this.health = 3;
  this.isDead = false;
  this.isHurt = false;
  this.hurtFrames = 2;
  this.deadFrames = 3;

  this.handleMouseClick = (counter) => {
  if (this.isAttacking || this.isDead || this.isHurt) return;

  this.attackCounter = counter;
  const facingLeft = this.lastDirection === "left";
  this.attackReversed = facingLeft;
  this.isAttacking = true;
  this.frameX = 0;

  if (this.attackCounter === 0)
    this.sprite = facingLeft ? this.spriteAttackBack1 : this.spriteAttack1;
  else if (this.attackCounter === 1)
    this.sprite = facingLeft ? this.spriteAttackBack2 : this.spriteAttack2;
  else if (this.attackCounter === 2)
    this.sprite = facingLeft ? this.spriteAttackBack3 : this.spriteAttack3;

  //  Modifica: colpisce entrambi i mostri
  const px = this.x;
  const pw = this.width;

  const monsters = [game.monster, game.secondMonster];
  for (const m of monsters) {
    if (m && !m.isDead) {
      const mx = m.x;
      const mw = m.frameWidth * m.scale;

      const collision = px + pw > mx && px < mx + mw;
      if (collision) {
        m.takeHit();
      }
    }
  }
};


  this.takeHit = () => {
    if (this.isDead || this.isHurt) return;
    if (this.isInAir == true) return;

    this.health--;
    if (this.health <= 0) {
      this.isDead = true;
      this.sprite = this.spriteDead;
      this.frameX = 0;
      return;
    }

    this.isHurt = true;
    this.frameX = 0;
    this.sprite = this.spriteHurt;
  };

  this.Update = function () {
    const onGround = this.y >= window.innerHeight - 400;

    if (this.isDead) {
      this.frameCount++;
      if (this.frameCount >= this.frameRate) {
        this.frameCount = 0;
        this.frameX++;
        if (this.frameX >= this.deadFrames) {
          this.frameX = this.deadFrames - 1;
        }
      }
      return;
    }

    if (this.isHurt) {
      this.frameCount++;
      if (this.frameCount >= this.frameRate) {
        this.frameCount = 0;
        this.frameX++;
        if (this.frameX >= this.hurtFrames) {
          this.isHurt = false;
          this.sprite = this.spriteIdle;
          this.frameX = 0;
        }
      }
      return;
    }

    if ((game.keys[" "] || game.keys["ArrowUp"]) && !this.isJumping && onGround) {
      this.velocityY = this.jumpForce;
      this.isJumping = true;
      this.isInAir = true;

      this.sprite = this.lastDirection === "left" ? this.spriteJumpBack : this.spriteJump;
      this.frameX = 0;
    }

    if (!onGround || this.velocityY < 0) {
      this.velocityY += game.gravity;
    } else {
      this.velocityY = 0;
      this.y = window.innerHeight - 400;
      this.isJumping = false;
      this.isInAir = false;
    }

    this.y += this.velocityY;

    if (this.y < 0) this.y = 0;
    if (this.x < 0) this.x = 0;
    if (this.x + this.width > window.innerWidth) {
      this.x = window.innerWidth - this.width;
    }

    if (this.isAttacking) {
      this.frameCount++;
      const frames = this.attackFrames[this.attackCounter];
      if (this.frameCount >= this.frameRate) {
        this.frameCount = 0;
        this.frameX++;
        if (this.frameX >= frames) {
          this.frameX = 0;
          this.isAttacking = false;
          this.attackReversed = false;
        }
      }
      return;
    }

    // Logica di movimento
    if (game.keys["d"] || game.keys["ArrowRight"]) {
      this.x += this.speed;
      this.isMovingRight = true;
      this.isMovingLeft = false;
      if (!this.isJumping) this.sprite = this.spriteRun;
      this.lastDirection = "right";
    } else if (game.keys["a"] || game.keys["ArrowLeft"]) {
      this.x -= this.speed;
      this.isMovingLeft = true;
      this.isMovingRight = false;
      if (!this.isJumping) this.sprite = this.spriteRunBack;
      this.lastDirection = "left";
    } else {
      this.isMovingLeft = false;
      this.isMovingRight = false;
      if (!this.isJumping && !this.isAttacking) {
        this.sprite = this.spriteIdle; // Animazione idle solo quando il personaggio è fermo
        this.frameX = 0;
      }
    }

    if (
      this.sprite === this.spriteRun || this.sprite === this.spriteRunBack ||
      this.sprite === this.spriteJump || this.sprite === this.spriteJumpBack
    ) {
      this.frameCount++;
      if (this.frameCount >= this.frameRate) {
        this.frameCount = 0;
        this.frameX++;
        const max = (this.sprite === this.spriteJump || this.sprite === this.spriteJumpBack)
          ? this.jumpFrames : this.runFrames;
        if (this.frameX >= max) this.frameX = 0;
      }
    }
  };

  this.Draw = function (ctx) {
    let totalFrames = 1;

    if (this.sprite === this.spriteRun || this.sprite === this.spriteRunBack) {
      totalFrames = this.runFrames;
    } else if (this.sprite === this.spriteJump || this.sprite === this.spriteJumpBack) {
      totalFrames = this.jumpFrames;
    } else if (this.sprite === this.spriteAttack1 || this.sprite === this.spriteAttackBack1) {
      totalFrames = this.attackFrames[0];
    } else if (this.sprite === this.spriteAttack2 || this.sprite === this.spriteAttackBack2) {
      totalFrames = this.attackFrames[1];
      this.frameRate=5;
    } else if (this.sprite === this.spriteAttack3 || this.sprite === this.spriteAttackBack3) {
      totalFrames = this.attackFrames[2];
    } else if (this.sprite === this.spriteHurt) {
      totalFrames = this.hurtFrames;
    } else if (this.sprite === this.spriteDead) {
      totalFrames = this.deadFrames;
    }

    const frameW = this.sprite.width / totalFrames;
    const frameH = this.sprite.height;
    const drawW = frameW * this.scaleFactor;
    const drawH = frameH * this.scaleFactor;

    this.width = drawW;
    this.height = drawH;

    const frameIndex = this.attackReversed ? totalFrames - 1 - this.frameX : this.frameX;
    ctx.drawImage(
      this.sprite,
      frameIndex * frameW,
      0,
      frameW,
      frameH,
      this.x,
      this.y,
      drawW,
      drawH
    );
  };
}
