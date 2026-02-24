class SecondoMostro extends Mostro {
  constructor(
    spriteIdle,
    spriteWalk,
    spriteRun,
    attack1,
    attack2,
    attack3,
    spriteDead
  ) {
    super(
      spriteIdle,
      spriteWalk,
      spriteRun,
      attack1,
      attack2,
      attack3,
      spriteDead
    );

    this.y = window.innerHeight - 400; // Imposta la stessa altezza del player

    this.scale = 4;
    this.baseSpeed = 1; // più lento rispetto al mostro principale
    this.runSpeed = 5;  // più veloce nel run
    this.speed = this.baseSpeed;

    this.health = 7;    // più hp

    // Frame personalizzati per il secondo mostro
    this.attackFrames = [4, 4, 3];
    this.walkFrames = 7;
    this.runFrames = 6;
    this.deadFrames = 4;
    this.idleFrames = 5;

    this.setSprite(this.spriteIdle, this.idleFrames);

    this.isAttacking = false;
    this.hasDiedAnimationPlayed = false;

    // Variabili per la gravità e il movimento verticale
    this.velocityY = 0; // Velocità verticale
    this.gravity = 0.5; // Gravità
    this.isInAir = false; // Indica se il mostro è in aria
  }

  takeHit(damage = 1) {
    if (this.isDead) return; // Ignora se già morto

    this.health -= damage;
    if (this.health <= 0) {
      this.health = 0;
      this.isDead = true;
      this.deathTime = Date.now();
      this.setSprite(this.spriteDead, this.deadFrames);
      this.frame = 0;
      this.frameCounter = 0;
      if (typeof giveXP === "function") giveXP("l2_elite_kill");
    } else {
      // Opzionale: animazione o effetto hit
    }
  }

  Update() {
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

      if (this.deathTime !== 0 && Date.now() - this.deathTime >= 3000) {
        this.shouldRemove = true;
      }
      return;
    }

    // Gestione del movimento verticale (gravità)
    const onGround = this.y >= window.innerHeight - 450; // Verifica se il mostro è a terra

    if (!onGround || this.velocityY < 0) {
      this.velocityY += this.gravity; // Se non è a terra, applica la gravità
    } else {
      this.velocityY = 0; // Se è a terra, fermiamo la velocità verticale
      this.y = window.innerHeight - 450; // Posiziona il mostro a terra
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

    // Limita il movimento orizzontale per evitare che il mostro esca dallo schermo
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
}
