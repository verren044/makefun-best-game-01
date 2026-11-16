// Enemy kinds, the boss, and how each one moves and fights. The world owns
// positions and health; this module owns per-kind behaviour.
import { ENEMIES, ARENA } from './config.js';
import { rand } from './random.js';

let nextId = 1;

export function createEnemy(kind, x, y, wave, rng) {
  const base = ENEMIES[kind];
  const hpScale = 1 + (wave - 1) * 0.16;
  const speedScale = 1 + Math.min(0.45, (wave - 1) * 0.03);
  const enemy = {
    id: nextId,
    kind,
    x, y,
    radius: base.radius,
    hp: kind === 'boss' ? bossHp(wave) : Math.round(base.hp * hpScale),
    maxHp: 0,
    speed: base.speed * speedScale,
    damage: base.damage,
    score: base.score,
    color: base.color,
    eye: base.eye,
    vx: 0, vy: 0,
    angle: 0,
    hitFlash: 0,
    shootTimer: rand(rng, 1, 2),
    burstTimer: 0,
    chargeTimer: 0,
    charging: false,
    spawnTimer: 0,
    wobble: rand(rng, 0, Math.PI * 2),
    dead: false,
  };
  enemy.maxHp = enemy.hp;
  nextId += 1;
  return enemy;
}

// Bosses get a steeper health curve so the wave-10 final boss is a real fight.
export function bossHp(wave) {
  return Math.round(ENEMIES.boss.hp * (1 + (wave / 5 - 1) * 0.9));
}

// Pick a spawn point on the arena edge, away from the player.
export function spawnPoint(rng, player) {
  const m = 30;
  let x;
  let y;
  for (let tries = 0; tries < 12; tries += 1) {
    const side = Math.floor(rng() * 4);
    if (side === 0) { x = rand(rng, ARENA.x, ARENA.x + ARENA.w); y = ARENA.y + m; }
    else if (side === 1) { x = rand(rng, ARENA.x, ARENA.x + ARENA.w); y = ARENA.y + ARENA.h - m; }
    else if (side === 2) { x = ARENA.x + m; y = rand(rng, ARENA.y, ARENA.y + ARENA.h); }
    else { x = ARENA.x + ARENA.w - m; y = rand(rng, ARENA.y, ARENA.y + ARENA.h); }
    const dx = x - player.x;
    const dy = y - player.y;
    if (dx * dx + dy * dy > 320 * 320) return { x, y };
  }
  return { x, y };
}

function steerToward(e, tx, ty, dt, speed) {
  const dx = tx - e.x;
  const dy = ty - e.y;
  const d = Math.hypot(dx, dy) || 1;
  e.x += (dx / d) * speed * dt;
  e.y += (dy / d) * speed * dt;
  e.angle = Math.atan2(dy, dx);
}

function clampArena(e) {
  e.x = Math.min(ARENA.x + ARENA.w - e.radius, Math.max(ARENA.x + e.radius, e.x));
  e.y = Math.min(ARENA.y + ARENA.h - e.radius, Math.max(ARENA.y + e.radius, e.y));
}

/**
 * Step one enemy. Returns events for the world to act on:
 *   { shoot: {x,y,angle,speed} } — a spitter / boss projectile
 *   { burst: true } — a boss radial burst
 *   { summon: n } — the boss calls wisps
 */
export function updateEnemy(e, world, dt) {
  const p = world.player;
  const events = [];
  e.hitFlash = Math.max(0, e.hitFlash - dt);
  e.wobble += dt * 3;

  if (e.kind === 'wisp') {
    // Drifts at the player with a sinusoidal wobble so the swarm never moves
    // in a straight, predictable line.
    const wob = Math.sin(e.wobble) * 0.5;
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const px = -dy / d;
    const py = dx / d;
    e.x += ((dx / d) + px * wob) * e.speed * dt;
    e.y += ((dy / d) + py * wob) * e.speed * dt;
    e.angle = Math.atan2(dy, dx);
  } else if (e.kind === 'mote') {
    steerToward(e, p.x, p.y, dt, e.speed);
  } else if (e.kind === 'spitter') {
    // Keeps a firing distance: closes in when far, backs off when crowded.
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const want = 300;
    const dir = d > want + 40 ? 1 : d < want - 60 ? -1 : 0;
    e.x += (dx / d) * e.speed * dir * dt;
    e.y += (dy / d) * e.speed * dir * dt;
    e.angle = Math.atan2(dy, dx);
    e.shootTimer -= dt;
    if (e.shootTimer <= 0 && d < 560) {
      e.shootTimer = rand(world.rng, 1.6, 2.4);
      events.push({ shoot: { x: e.x, y: e.y, angle: e.angle, speed: 240 } });
    }
  } else if (e.kind === 'brute') {
    steerToward(e, p.x, p.y, dt, e.speed);
  } else if (e.kind === 'splitter') {
    steerToward(e, p.x, p.y, dt, e.speed * (1 + 0.15 * Math.sin(e.wobble)));
  } else if (e.kind === 'boss') {
    updateBoss(e, world, dt, events);
  }

  clampArena(e);
  return events;
}

function updateBoss(e, world, dt, events) {
  const p = world.player;
  const hpFrac = e.hp / e.maxHp;
  const enraged = hpFrac < 0.4;
  const speed = e.speed * (enraged ? 1.6 : 1);
  e.burstTimer -= dt;
  e.chargeTimer -= dt;
  e.spawnTimer -= dt;

  if (e.charging) {
    // A telegraphed charge: fast, straight, then a pause.
    e.x += Math.cos(e.angle) * 520 * dt;
    e.y += Math.sin(e.angle) * 520 * dt;
    if (e.chargeTimer <= 0) {
      e.charging = false;
      e.chargeTimer = rand(world.rng, 2.5, 4);
    }
    return;
  }

  steerToward(e, p.x, p.y, dt, speed);
  const d = Math.hypot(p.x - e.x, p.y - e.y);

  if (e.burstTimer <= 0 && d < 620) {
    e.burstTimer = enraged ? 2.2 : 3.2;
    events.push({ burst: true });
  }
  if (e.spawnTimer <= 0 && world.enemies.length < 14) {
    e.spawnTimer = 6;
    events.push({ summon: enraged ? 3 : 2 });
  }
  if (e.chargeTimer <= 0 && d > 260 && d < 700) {
    e.charging = true;
    e.chargeTimer = 0.7;
    e.angle = Math.atan2(p.y - e.y, p.x - e.x);
    events.push({ telegraph: true });
  }
}

// What a splitter leaves behind when it dies.
export function splitChildren(e, wave, rng) {
  const out = [];
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * Math.PI * 2 + rand(rng, -0.3, 0.3);
    out.push(createEnemy('mote', e.x + Math.cos(a) * 24, e.y + Math.sin(a) * 24, wave, rng));
  }
  return out;
}
