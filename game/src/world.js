// The game itself: state, the fixed-step simulation, waves, combat, scoring
// and pickups. Rendering lives in render.js, enemy behaviour in enemies.js.
import {
  VIEW_W, VIEW_H, ARENA, PLAYER, STEP, BOSS_WAVE, FINAL_WAVE,
  PICKUP_HEAL, COMBO_WINDOW, COMBO_STEP, LIGHT_BASE_RADIUS,
  BEACON_LIGHT_RADIUS, FLARE_LIGHT_RADIUS, FLARE_LIGHT_TIME,
  SHADOW_DAMAGE_TAKEN, waveBudget, waveSpawnInterval,
} from './config.js';
import { mulberry32, rand, chance, pick } from './random.js';
import { createEnemy, updateEnemy, spawnPoint, splitChildren } from './enemies.js';
import { rollUpgrades, UPGRADES } from './upgrades.js';

export const PHASE = {
  TITLE: 'title',
  PLAY: 'play',
  UPGRADE: 'upgrade',
  PAUSE: 'pause',
  OVER: 'over',
  VICTORY: 'victory',
};

const BEST_KEY = 'emberwarden-best';
const BEST_WAVE_KEY = 'emberwarden-best-wave';

export function loadBest() {
  try {
    return {
      score: Number(localStorage.getItem(BEST_KEY) ?? 0) || 0,
      wave: Number(localStorage.getItem(BEST_WAVE_KEY) ?? 0) || 0,
    };
  } catch { return { score: 0, wave: 0 }; }
}

function saveBest(score, wave) {
  try {
    const best = loadBest();
    if (score > best.score) localStorage.setItem(BEST_KEY, String(score));
    if (wave > best.wave) localStorage.setItem(BEST_WAVE_KEY, String(wave));
  } catch { /* storage unavailable: best score just does not persist */ }
}

function freshPlayer() {
  return {
    x: VIEW_W / 2, y: ARENA.y + ARENA.h / 2,
    radius: PLAYER.radius,
    hp: PLAYER.maxHp, maxHp: PLAYER.maxHp,
    speed: PLAYER.speed,
    fireInterval: PLAYER.fireInterval,
    bulletDamage: PLAYER.bulletDamage,
    bulletSpeed: PLAYER.bulletSpeed,
    multishot: 1, pierce: 0,
    flares: PLAYER.flareMax, flareMax: PLAYER.flareMax,
    flareDamage: PLAYER.flareDamage, flareRadius: PLAYER.flareRadius,
    lightRadius: LIGHT_BASE_RADIUS, flareLightTimer: 0,
    magnetRadius: 90, adrenaline: false,
    fireTimer: 0, dashTimer: 0, dashCooldown: 0, dashX: 0, dashY: 1,
    invuln: 0, aimAngle: -Math.PI / 2,
    adrenalineStacks: 0, adrenalineTimer: 0,
    moving: false,
  };
}

export class World {
  constructor(seed, sound, particles) {
    this.rng = mulberry32(seed);
    this.sound = sound;
    this.fx = particles;
    this.best = loadBest();
    this.reset();
  }

  reset() {
    this.phase = PHASE.TITLE;
    this.player = freshPlayer();
    this.enemies = [];
    this.bullets = [];
    this.ebullets = [];
    this.pickups = [];
    this.wave = 0;
    this.score = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.kills = 0;
    this.time = 0;
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.boss = null;
    this.upgradeChoices = [];
    this.takenUpgrades = {};
    this.banner = '';
    this.bannerTimer = 0;
    this.flashTimer = 0;
    this.stats = { shots: 0, hits: 0, damage: 0 };
    this.attract = false;
    this.fx.list.length = 0;
    this.fx.texts.length = 0;
  }

  startRun() {
    this.reset();
    this.phase = PHASE.PLAY;
    this.beginWave(1);
  }

  // The lantern's light, and the beacon's: a point is lit if it falls
  // inside either pool. Shadows outside the light are armoured.
  get lightRadiusNow() {
    return this.player.flareLightTimer > 0 ? FLARE_LIGHT_RADIUS : this.player.lightRadius;
  }

  inLight(x, y) {
    const p = this.player;
    const dx = x - p.x;
    const dy = y - p.y;
    if (dx * dx + dy * dy < this.lightRadiusNow * this.lightRadiusNow) return true;
    const bx = x - VIEW_W / 2;
    const by = y - (ARENA.y + ARENA.h / 2);
    return bx * bx + by * by < BEACON_LIGHT_RADIUS * BEACON_LIGHT_RADIUS;
  }

  isShadowed(e) {
    return !this.inLight(e.x, e.y);
  }

  beginWave(n) {
    this.wave = n;
    const budget = waveBudget(n);
    this.spawnQueue = [];
    for (const [kind, count] of Object.entries(budget)) {
      for (let i = 0; i < count; i += 1) this.spawnQueue.push(kind);
    }
    // Shuffle the trickle, but keep the boss first so its bar appears at once.
    const bossIdx = this.spawnQueue.indexOf('boss');
    if (bossIdx > 0) this.spawnQueue.splice(bossIdx, 1);
    for (let i = this.spawnQueue.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.rng() * (i + 1));
      [this.spawnQueue[i], this.spawnQueue[j]] = [this.spawnQueue[j], this.spawnQueue[i]];
    }
    if (bossIdx >= 0) this.spawnQueue.unshift('boss');
    this.spawnTimer = 0.6;
    this.banner = n % BOSS_WAVE === 0 ? `WAVE ${n} — THE GLOOMLORD` : `WAVE ${n}`;
    this.bannerTimer = 2.2;
    if (n % BOSS_WAVE === 0) this.sound.bossRoar();
    else this.sound.waveHorn();
  }

  // One fixed step. Input is read only while playing; menus handle their own keys.
  step(dt, input) {
    this.time += dt;
    this.fx.update(dt);
    this.bannerTimer = Math.max(0, this.bannerTimer - dt);
    this.flashTimer = Math.max(0, this.flashTimer - dt);

    if (this.phase === PHASE.PLAY) this.stepPlay(dt, input);
    else if (this.phase === PHASE.TITLE || this.phase === PHASE.VICTORY || this.phase === PHASE.OVER) {
      // Ambient embers drift behind the end screens.
      if (chance(this.rng, dt * 6)) {
        this.fx.burst(rand(this.rng, ARENA.x, ARENA.x + ARENA.w), ARENA.y + ARENA.h - 10, '#ffb347', 1, 24, 1.6, 2);
      }
    }
    if (input) input.endStep();
  }

  stepPlay(dt, input) {
    const p = this.player;
    p.invuln = Math.max(0, p.invuln - dt);
    p.flareLightTimer = Math.max(0, p.flareLightTimer - dt);
    p.dashCooldown = Math.max(0, p.dashCooldown - dt);
    p.fireTimer -= dt;
    if (p.adrenalineTimer > 0) {
      p.adrenalineTimer -= dt;
      if (p.adrenalineTimer <= 0) p.adrenalineStacks = 0;
    }
    this.comboTimer -= dt;
    if (this.comboTimer <= 0) this.combo = 0;

    // --- movement & dash ---
    const mv = input.moveVector();
    p.moving = mv.x !== 0 || mv.y !== 0;
    if (p.dashTimer > 0) {
      p.dashTimer -= dt;
      p.x += p.dashX * PLAYER.dashSpeed * dt;
      p.y += p.dashY * PLAYER.dashSpeed * dt;
    } else {
      p.x += mv.x * p.speed * dt;
      p.y += mv.y * p.speed * dt;
      if (input.wasPressed('ShiftLeft') || input.wasPressed('ShiftRight')) {
        if (p.dashCooldown <= 0 && p.moving) {
          p.dashTimer = PLAYER.dashTime;
          p.dashCooldown = p.dashCooldownMax ?? PLAYER.dashCooldown;
          p.dashX = mv.x;
          p.dashY = mv.y;
          p.invuln = Math.max(p.invuln, PLAYER.dashTime + 0.08);
          this.sound.dash();
          this.fx.burst(p.x, p.y, '#59e3c8', 8, 120, 0.4, 3);
        }
      }
    }
    p.x = Math.min(ARENA.x + ARENA.w - p.radius, Math.max(ARENA.x + p.radius, p.x));
    p.y = Math.min(ARENA.y + ARENA.h - p.radius, Math.max(ARENA.y + p.radius, p.y));

    // --- aim & fire ---
    const aim = Math.atan2(input.mouse.y - p.y, input.mouse.x - p.x);
    p.aimAngle = aim;
    if (input.firing && p.fireTimer <= 0) this.fireBullet();

    // --- flare ---
    if ((input.wasPressed('KeyE') || input.mouseRightPressed) && p.flares > 0) this.useFlare();

    // --- pause / mute ---
    if (input.wasPressed('Escape') || input.wasPressed('KeyP')) this.phase = PHASE.PAUSE;
    if (input.wasPressed('KeyM')) this.sound.toggleMute();

    // --- spawning ---
    if (this.spawnQueue.length > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = waveSpawnInterval(this.wave);
        const kind = this.spawnQueue.shift();
        const at = spawnPoint(this.rng, p);
        const e = createEnemy(kind, at.x, at.y, this.wave, this.rng);
        this.enemies.push(e);
        if (kind === 'boss') this.boss = e;
        this.fx.burst(at.x, at.y, '#8f7bff', 10, 90, 0.5, 3);
      }
    }

    this.stepBullets(dt);
    this.stepEnemies(dt);
    this.stepPickups(dt);
    this.separateEnemies();

    // --- wave clear ---
    if (this.spawnQueue.length === 0 && this.enemies.length === 0 && this.phase === PHASE.PLAY) {
      if (this.wave >= FINAL_WAVE) {
        this.winRun();
      } else {
        this.phase = PHASE.UPGRADE;
        this.upgradeChoices = rollUpgrades(this.rng, this.takenUpgrades);
        this.sound.upgrade();
      }
    }
  }

  fireBullet() {
    const p = this.player;
    const interval = p.fireInterval * (p.adrenaline && p.adrenalineStacks > 0 ? Math.pow(0.85, p.adrenalineStacks) : 1);
    p.fireTimer = interval;
    const n = p.multishot;
    const spread = 0.09;
    for (let i = 0; i < n; i += 1) {
      const off = (i - (n - 1) / 2) * spread;
      const a = p.aimAngle + off;
      this.bullets.push({
        x: p.x + Math.cos(a) * (p.radius + 6),
        y: p.y + Math.sin(a) * (p.radius + 6),
        vx: Math.cos(a) * p.bulletSpeed,
        vy: Math.sin(a) * p.bulletSpeed,
        damage: p.bulletDamage,
        pierce: p.pierce,
        radius: PLAYER.bulletRadius,
        life: 1.1,
      });
    }
    this.stats.shots += n;
    this.sound.shoot();
    this.fx.burst(
      p.x + Math.cos(p.aimAngle) * (p.radius + 8),
      p.y + Math.sin(p.aimAngle) * (p.radius + 8),
      '#ffb347', 2, 60, 0.15, 2,
    );
  }

  useFlare() {
    const p = this.player;
    p.flares -= 1;
    // A flare is a burst of light: it surges the lantern's radius as well
    // as burning and pushing the horde back.
    p.flareLightTimer = FLARE_LIGHT_TIME;
    this.sound.flare();
    this.fx.ring(p.x, p.y, '#ffd97a', 30, 420);
    this.fx.shake(7, 0.3);
    for (const e of [...this.enemies]) {
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d < p.flareRadius + e.radius) {
        const push = 260 * (1 - d / (p.flareRadius + e.radius));
        e.x += (dx / (d || 1)) * push * 0.12;
        e.y += (dy / (d || 1)) * push * 0.12;
        this.damageEnemy(e, p.flareDamage, true, true);
      }
    }
    this.enemies = this.enemies.filter((e) => !e.dead);
  }

  stepBullets(dt) {
    for (const b of this.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      for (const e of this.enemies) {
        if (e.dead) continue;
        const dx = e.x - b.x;
        const dy = e.y - b.y;
        const rr = e.radius + b.radius;
        if (dx * dx + dy * dy < rr * rr) {
          this.damageEnemy(e, b.damage, false);
          this.stats.hits += 1;
          b.pierce -= 1;
          if (b.pierce < 0) { b.life = 0; break; }
        }
      }
    }
    this.bullets = this.bullets.filter((b) =>
      b.life > 0 && b.x > ARENA.x - 20 && b.x < ARENA.x + ARENA.w + 20 &&
      b.y > ARENA.y - 20 && b.y < ARENA.y + ARENA.h + 20);
    this.enemies = this.enemies.filter((e) => !e.dead);

    for (const b of this.ebullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      const p = this.player;
      const dx = p.x - b.x;
      const dy = p.y - b.y;
      const rr = p.radius + b.radius;
      if (dx * dx + dy * dy < rr * rr) {
        this.damagePlayer(b.damage, b.x, b.y);
        b.life = 0;
      }
    }
    this.ebullets = this.ebullets.filter((b) => b.life > 0 &&
      b.x > ARENA.x - 20 && b.x < ARENA.x + ARENA.w + 20 &&
      b.y > ARENA.y - 20 && b.y < ARENA.y + ARENA.h + 20);
  }

  stepEnemies(dt) {
    const p = this.player;
    for (const e of this.enemies) {
      const events = updateEnemy(e, this, dt);
      for (const ev of events) {
        if (ev.shoot) {
          this.ebullets.push({
            x: ev.shoot.x, y: ev.shoot.y,
            vx: Math.cos(ev.shoot.angle) * ev.shoot.speed,
            vy: Math.sin(ev.shoot.angle) * ev.shoot.speed,
            radius: 7, damage: ENEMY_DAMAGE('spitter'), life: 4,
          });
        }
        if (ev.burst) {
          const n = 10;
          for (let i = 0; i < n; i += 1) {
            const a = (i / n) * Math.PI * 2 + this.time * 0.3;
            this.ebullets.push({
              x: e.x, y: e.y,
              vx: Math.cos(a) * 190, vy: Math.sin(a) * 190,
              radius: 7, damage: 10, life: 4,
            });
          }
          this.sound.bossRoar();
          this.fx.ring(e.x, e.y, '#b06cff', 20, 260);
        }
        if (ev.summon) {
          for (let i = 0; i < ev.summon; i += 1) {
            const at = spawnPoint(this.rng, p);
            this.enemies.push(createEnemy('wisp', at.x, at.y, this.wave, this.rng));
          }
        }
        if (ev.telegraph) this.fx.ring(e.x, e.y, '#ff5d73', 16, 180);
      }
      // Contact damage.
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const rr = p.radius + e.radius - 2;
      if (dx * dx + dy * dy < rr * rr) this.damagePlayer(e.damage, e.x, e.y);
    }
    this.enemies = this.enemies.filter((e) => !e.dead);
    if (this.boss && this.boss.dead) this.boss = null;
  }

  // Keep enemies from stacking exactly on top of each other.
  separateEnemies() {
    const list = this.enemies;
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const a = list[i];
        const b = list[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const rr = a.radius + b.radius;
        const d2 = dx * dx + dy * dy;
        if (d2 > 0.01 && d2 < rr * rr) {
          const d = Math.sqrt(d2);
          const push = (rr - d) / 2;
          const nx = dx / d;
          const ny = dy / d;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
        }
      }
    }
  }

  damageEnemy(e, amount, silent, ignoreShadow = false) {
    // Shadowed enemies — standing outside the lantern's light and the
    // beacon's — are armoured and take less damage. Flare light ignores it.
    const dealt = !ignoreShadow && this.isShadowed(e)
      ? Math.max(1, Math.round(amount * SHADOW_DAMAGE_TAKEN)) : amount;
    e.hp -= dealt;
    e.hitFlash = 0.12;
    this.stats.damage += dealt;
    if (!silent) this.sound.hit();
    if (e.hp <= 0 && !e.dead) this.killEnemy(e);
  }

  killEnemy(e) {
    e.dead = true;
    this.kills += 1;
    this.combo += 1;
    this.comboTimer = COMBO_WINDOW;
    const mult = 1 + Math.min(this.combo - 1, 12) * COMBO_STEP;
    const gained = Math.round(e.score * mult);
    this.score += gained;
    this.fx.burst(e.x, e.y, e.color, e.kind === 'boss' ? 60 : 14, 200, 0.7, 4);
    this.fx.text(e.x, e.y - e.radius, `+${gained}`, '#ffd97a', e.kind === 'boss' ? 26 : 15);
    if (e.kind === 'boss') {
      this.fx.shake(12, 0.5);
      this.sound.enemyDie();
      this.dropPickup(e.x, e.y, 'heart');
      this.dropPickup(e.x, e.y, 'flare');
    } else {
      this.sound.enemyDie();
    }
    if (e.kind === 'splitter') {
      this.sound.split();
      for (const child of splitChildren(e, this.wave, this.rng)) this.enemies.push(child);
    }
    if (this.player.adrenaline) {
      this.player.adrenalineStacks = Math.min(3, this.player.adrenalineStacks + 1);
      this.player.adrenalineTimer = 2.5;
    }
    // Drops: shards are score, hearts are rare, flares rarer still.
    const roll = this.rng();
    if (roll < 0.22) this.dropPickup(e.x, e.y, 'shard');
    else if (roll < 0.28) this.dropPickup(e.x, e.y, 'heart');
    else if (roll < 0.31) this.dropPickup(e.x, e.y, 'flare');
  }

  dropPickup(x, y, kind) {
    this.pickups.push({
      kind, x, y,
      vx: rand(this.rng, -40, 40), vy: rand(this.rng, -40, 40),
      life: 12, age: 0,
    });
  }

  stepPickups(dt) {
    const p = this.player;
    for (const pk of this.pickups) {
      pk.age += dt;
      pk.life -= dt;
      const dx = p.x - pk.x;
      const dy = p.y - pk.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < p.magnetRadius) {
        pk.x += (dx / d) * 260 * dt;
        pk.y += (dy / d) * 260 * dt;
      } else {
        pk.x += pk.vx * dt;
        pk.y += pk.vy * dt;
        pk.vx *= 0.98;
        pk.vy *= 0.98;
      }
      if (d < p.radius + 14) {
        pk.life = 0;
        if (pk.kind === 'heart') {
          p.hp = Math.min(p.maxHp, p.hp + PICKUP_HEAL);
          this.sound.heal();
          this.fx.text(p.x, p.y - 28, `+${PICKUP_HEAL} HP`, '#7dff9e', 16);
        } else if (pk.kind === 'flare') {
          p.flares = Math.min(p.flareMax, p.flares + 1);
          this.sound.pickup();
          this.fx.text(p.x, p.y - 28, '+1 FLARE', '#ffd97a', 16);
        } else {
          this.score += 25;
          this.sound.pickup();
          this.fx.text(p.x, p.y - 28, '+25', '#ffd97a', 14);
        }
      }
    }
    this.pickups = this.pickups.filter((pk) => pk.life > 0);
  }

  damagePlayer(amount, sx, sy) {
    const p = this.player;
    if (p.invuln > 0 || this.phase !== PHASE.PLAY) return;
    p.hp -= amount;
    p.invuln = PLAYER.invulnTime;
    this.flashTimer = 0.25;
    this.fx.shake(9, 0.3);
    this.fx.burst(p.x, p.y, '#ff5d73', 12, 160, 0.5, 3);
    this.sound.hurt();
    // Knock the player away from the hit.
    const dx = p.x - sx;
    const dy = p.y - sy;
    const d = Math.hypot(dx, dy) || 1;
    p.x += (dx / d) * 18;
    p.y += (dy / d) * 18;
    this.combo = 0;
    if (p.hp <= 0) {
      p.hp = 0;
      this.phase = PHASE.OVER;
      this.fx.burst(p.x, p.y, '#59e3c8', 50, 260, 1.0, 4);
      this.sound.gameOver();
      saveBest(this.score, this.wave);
      this.best = loadBest();
    }
  }

  applyUpgrade(id) {
    const up = UPGRADES.find((u) => u.id === id);
    if (!up) return;
    this.takenUpgrades[id] = (this.takenUpgrades[id] ?? 0) + 1;
    up.apply(this.player);
    // Dash cooldown is a derived value: the mastery upgrade rewrites the base.
    this.player.dashCooldownMax = PLAYER.dashCooldown * Math.pow(0.7, this.takenUpgrades['dash-mastery'] ?? 0);
    this.upgradeChoices = [];
    this.phase = PHASE.PLAY;
    this.beginWave(this.wave + 1);
  }

  winRun() {
    this.phase = PHASE.VICTORY;
    this.sound.victory();
    saveBest(this.score, this.wave);
    this.best = loadBest();
  }

  get enemiesLeft() {
    return this.spawnQueue.length + this.enemies.length;
  }

  get comboMult() {
    return 1 + Math.min(Math.max(this.combo - 1, 0), 12) * COMBO_STEP;
  }

  get accuracy() {
    return this.stats.shots === 0 ? 0 : Math.round((this.stats.hits / this.stats.shots) * 100);
  }
}

function ENEMY_DAMAGE(kind) {
  return kind === 'spitter' ? 8 : 10;
}
