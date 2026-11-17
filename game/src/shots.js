// Deterministic screenshot scenes (?shot=start|play|boss|victory|end) and the
// autopilot that plays them. Every scene runs the real rules forward from a
// fresh world with a fixed seed and fixed steps, so the same seed always
// gives the same frame — the frame is what a short game really looks like.
// The autopilot also drives the attract mode behind the title screen.
import { ARENA, STEP } from './config.js';
import { PHASE } from './world.js';

// A stand-in for Input with the same interface world.stepPlay reads.
export class FakeInput {
  constructor() {
    this.mouse = { x: 640, y: 360, down: false, rightDown: false };
    this._move = { x: 0, y: 0 };
    this._fire = false;
    this._press = new Set();
    // Last seen position of each enemy, for leading the target.
    this._track = new Map();
  }

  moveVector() { return this._move; }

  get firing() { return this._fire; }

  wasPressed(code) { return this._press.has(code); }

  endStep() { this._press.clear(); }
}

function dist(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay);
}

/**
 * Steer the fake input for one step: aim at the nearest enemy, keep a
 * fighting distance from it, and run from anything that gets too close.
 * `skill` 0..1: how well it dodges and how close it dares to stand.
 */
export function autopilotStep(world, input, skill = 0.8) {
  const p = world.player;
  // Track every enemy's position each step, so the velocity estimate for
  // the target is always one step old. Tracking only the current target
  // goes stale the moment the pilot switches targets, and stale velocity
  // is worse than none.
  const seen = new Set();
  for (const e of world.enemies) {
    const prev = input._track.get(e.id);
    if (prev) {
      const dt = world.time - prev.t;
      if (dt > 0) {
        prev.vx = (e.x - prev.x) / dt;
        prev.vy = (e.y - prev.y) / dt;
      }
      prev.x = e.x;
      prev.y = e.y;
      prev.t = world.time;
    } else {
      input._track.set(e.id, { x: e.x, y: e.y, t: world.time, vx: 0, vy: 0 });
    }
    seen.add(e.id);
  }
  for (const id of [...input._track.keys()]) if (!seen.has(id)) input._track.delete(id);

  // Stick to a target until it dies or leaves range: re-picking the nearest
  // enemy every step sprays bullets at a rotating cast, and every bullet
  // in flight chases a target the pilot has already abandoned.
  let target = null;
  const prevTarget = input._targetId !== undefined
    ? world.enemies.find((e) => e.id === input._targetId) : null;
  if (prevTarget && dist(p.x, p.y, prevTarget.x, prevTarget.y) < 450) {
    target = prevTarget;
  } else {
    let td = Infinity;
    for (const e of world.enemies) {
      const d = dist(p.x, p.y, e.x, e.y);
      const weight = e.kind === 'boss' ? d * 0.6 : d;
      if (weight < td) { td = weight; target = e; }
    }
  }
  input._targetId = target ? target.id : undefined;

  let mx = 0;
  let my = 0;
  let aimX = p.x;
  let aimY = p.y - 100;
  if (target) {
    aimX = target.x;
    aimY = target.y;
    // Lead the target: aim where it will be when the ember arrives, from
    // its velocity over the last step. A pilot that shoots at where a
    // shadow was never hits a moving one.
    const prev = input._track.get(target.id);
    if (prev && (prev.vx || prev.vy)) {
      const flight = dist(p.x, p.y, target.x, target.y) / p.bulletSpeed;
      aimX = target.x + prev.vx * flight;
      aimY = target.y + prev.vy * flight;
    }
    const d = dist(p.x, p.y, target.x, target.y);
    // Flee anything inside the danger radius.
    let threat = null;
    let threatD = Infinity;
    for (const e of world.enemies) {
      const ed = dist(p.x, p.y, e.x, e.y);
      if (ed < threatD) { threatD = ed; threat = e; }
    }
    const danger = 110 + (1 - skill) * 60;
    if (threat && threatD < danger) {
      const a = Math.atan2(p.y - threat.y, p.x - threat.x);
      mx = Math.cos(a);
      my = Math.sin(a);
      // Dash out of a tight spot when the cooldown allows.
      if (threatD < 80 && p.dashCooldown <= 0) input._press.add('ShiftLeft');
    } else if (d > 320) {
      const a = Math.atan2(target.y - p.y, target.x - p.x);
      mx = Math.cos(a);
      my = Math.sin(a);
    } else if (d < 200) {
      const a = Math.atan2(target.y - p.y, target.x - p.x);
      mx = -Math.cos(a) * 0.7;
      my = -Math.sin(a) * 0.7;
    }
    // Strafe: circle the target slowly so the shot is never head-on static.
    const strafe = Math.sin(world.time * 0.7) * 0.5;
    const px = -(target.y - p.y) / (d || 1);
    const py = (target.x - p.x) / (d || 1);
    mx += px * strafe;
    my += py * strafe;
    // Dodge incoming enemy bullets: step sideways from the nearest one.
    for (const b of world.ebullets) {
      const bd = dist(p.x, p.y, b.x, b.y);
      if (bd < 90) {
        const a = Math.atan2(b.vy, b.vx);
        mx += Math.cos(a + Math.PI / 2) * 0.8;
        my += Math.sin(a + Math.PI / 2) * 0.8;
      }
    }
    // Flare when crowded.
    if (threat && threatD < 150 && p.flares > 0) input._press.add('KeyE');
  } else {
    // Nothing to fight: drift back to the beacon.
    const cx = ARENA.x + ARENA.w / 2;
    const cy = ARENA.y + ARENA.h / 2;
    const d = dist(p.x, p.y, cx, cy);
    if (d > 60) {
      mx = (cx - p.x) / d;
      my = (cy - p.y) / d;
    }
  }
  const len = Math.hypot(mx, my);
  if (len > 1) { mx /= len; my /= len; }
  input._move = { x: mx, y: my };
  input.mouse.x = aimX;
  input.mouse.y = aimY;
  // Fire only in close: at long range the wobble defeats the lead and the
  // embers spray past. Close in, then shoot — a pilot that fires at 350px
  // lands one bullet in ten, but one that waits for 220px never kills
  // fast enough to survive. 300px is the working band.
  input._fire = target !== null && dist(p.x, p.y, target.x, target.y) < 300;
}

// Run the world forward for `seconds` of fixed steps under the autopilot,
// picking upgrades when offered. Returns false if the run ended.
function playForward(world, input, seconds, skill) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    if (world.phase === PHASE.UPGRADE) {
      world.applyUpgrade(world.upgradeChoices[0].id);
      continue;
    }
    if (world.phase === PHASE.OVER || world.phase === PHASE.VICTORY) return false;
    autopilotStep(world, input, skill);
    world.step(STEP, input);
  }
  return world.phase === PHASE.PLAY;
}

// Step the world with the autopilot dodging but holding fire, so enemies
// gather on screen, then let it fire briefly so bullets are in flight.
// Stops early once `minEnemies` are alive, or after `seconds`.
function gatherCrowd(world, input, seconds, minEnemies, skill) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    if (world.phase === PHASE.UPGRADE) { world.applyUpgrade(world.upgradeChoices[0].id); continue; }
    if (world.phase === PHASE.OVER || world.phase === PHASE.VICTORY) return;
    if (world.phase === PHASE.PLAY && world.enemies.length >= minEnemies) break;
    autopilotStep(world, input, skill);
    input._fire = false;
    world.step(STEP, input);
  }
  // A burst of real fire so the captured frame catches an active firefight,
  // embers in flight — short enough that the pilot has not already cleared
  // the crowd it gathered.
  for (let i = 0; i < 1.5 / STEP; i += 1) {
    if (world.phase !== PHASE.PLAY) break;
    autopilotStep(world, input, skill);
    world.step(STEP, input);
  }
}

function blessPlayer(world, hp, damage, multishot) {
  const p = world.player;
  p.maxHp = hp;
  p.hp = hp;
  p.bulletDamage = damage;
  p.multishot = multishot;
  p.pierce = 2;
  p.fireInterval = 0.09;
}

/**
 * Stage the named scene and return the screen to draw over it.
 * Scenes: title, play, boss, victory, end (anything else is title).
 */
export function stageShot(name, world) {
  const input = new FakeInput();
  if (name === 'title' || name === 'start') {
    world.reset();
    world.beginWave(2);
    // Attract mode: the game plays itself behind the title, a wave in so
    // the backdrop shows a real fight, not an empty arena.
    for (let i = 0; i < 10 / STEP; i += 1) {
      autopilotStep(world, input, 0.7);
      world.stepPlay(STEP, input);
      input.endStep();
      if (world.enemies.length === 0 && world.spawnQueue.length === 0) world.beginWave(2);
    }
    return { screen: PHASE.TITLE, best: 0 };
  }

  if (name === 'boss') {
    // The boss walks in first: hold fire while it and its escort gather,
    // then fight — so the capture shows the Gloomlord alive with its bar.
    world.startRun();
    blessPlayer(world, 300, 12, 1);
    world.player.fireInterval = 0.16;
    world.beginWave(5);
    gatherCrowd(world, input, 12, 10, 0.85);
    return { screen: PHASE.PLAY, best: world.score };
  }

  if (name === 'victory') {
    // A real full run, waves 1 to 10, so the victory screen's stats are a
    // run the game actually played: a real time, a real accuracy.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      world.startRun();
      blessPlayer(world, 300 + attempt * 100, 25 + attempt * 10, 2);
      let won = false;
      for (let i = 0; i < 600 / STEP && !won; i += 1) {
        if (world.phase === PHASE.VICTORY) { won = true; break; }
        if (world.phase === PHASE.OVER) break;
        if (world.phase === PHASE.UPGRADE) { world.applyUpgrade(world.upgradeChoices[0].id); continue; }
        autopilotStep(world, input, 0.95);
        world.step(STEP, input);
      }
      if (won) return { screen: PHASE.VICTORY, best: world.score };
    }
    // The pilot stalled: finish the boss through the real damage path so
    // the victory screen is still the game's own transition.
    if (world.boss && !world.boss.dead) {
      world.damageEnemy(world.boss, 999999, true);
      for (let i = 0; i < 30; i += 1) world.step(STEP, input);
    }
    return { screen: PHASE.VICTORY, best: world.score };
  }

  if (name === 'end') {
    world.startRun();
    // A careless pilot: stands still and never shoots.
    const still = new FakeInput();
    still._fire = false;
    for (let i = 0; i < 90 / STEP; i += 1) {
      if (world.phase === PHASE.OVER) break;
      world.step(STEP, still);
    }
    return { screen: PHASE.OVER, best: world.score };
  }

  // play (default): a real mid-game frame — fight through to wave 4, where
  // spitters, splitters, brutes and stalkers all field, then let the horde
  // gather so the capture shows a fight, not an empty arena.
  world.startRun();
  playForward(world, input, 26, 0.85);
  if (world.phase === PHASE.OVER) {
    // The pilot died: restage with a tougher warden so the shot is play.
    world.startRun();
    blessPlayer(world, 400, 20, 2);
    playForward(world, input, 26, 0.9);
  }
  // Push on to wave 4 if the pilot is still early, so every kind is in play.
  let guard = 0;
  while (world.wave < 4 && guard < 120 / STEP) {
    if (world.phase === PHASE.UPGRADE) { world.applyUpgrade(world.upgradeChoices[0].id); continue; }
    if (world.phase !== PHASE.PLAY) break;
    autopilotStep(world, input, 0.85);
    world.step(STEP, input);
    guard += 1;
  }
  gatherCrowd(world, input, 12, 14, 0.85);
  return { screen: PHASE.PLAY, best: world.score };
}
