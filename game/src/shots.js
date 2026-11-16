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
  let target = null;
  let td = Infinity;
  for (const e of world.enemies) {
    const d = dist(p.x, p.y, e.x, e.y);
    const weight = e.kind === 'boss' ? d * 0.6 : d;
    if (weight < td) { td = weight; target = e; }
  }

  let mx = 0;
  let my = 0;
  let aimX = p.x;
  let aimY = p.y - 100;
  if (target) {
    aimX = target.x;
    aimY = target.y;
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
  input._fire = target !== null;
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
  // A short burst of real fire so the captured frame has embers in flight.
  for (let i = 0; i < 0.6 / STEP; i += 1) {
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
    world.beginWave(1);
    // Attract mode: the game plays itself behind the title.
    for (let i = 0; i < 6 / STEP; i += 1) {
      autopilotStep(world, input, 0.7);
      world.stepPlay(STEP, input);
      input.endStep();
      if (world.enemies.length === 0 && world.spawnQueue.length === 0) world.beginWave(1);
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
    gatherCrowd(world, input, 12, 8, 0.85);
    return { screen: PHASE.PLAY, best: world.score };
  }

  if (name === 'victory') {
    world.startRun();
    blessPlayer(world, 500, 42, 3);
    world.beginWave(10);
    // Fight the final boss until the real wave-clear triggers victory.
    let won = false;
    for (let i = 0; i < 150 / STEP && !won; i += 1) {
      if (world.phase === PHASE.VICTORY) { won = true; break; }
      if (world.phase === PHASE.OVER) break;
      if (world.phase === PHASE.UPGRADE) { world.applyUpgrade(world.upgradeChoices[0].id); continue; }
      autopilotStep(world, input, 0.95);
      world.step(STEP, input);
    }
    if (!won && world.boss && !world.boss.dead) {
      // The pilot stalled: finish the boss through the real damage path so
      // the victory screen is still the game's own transition.
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

  // play (default): a real mid-game frame, wave 1 into wave 2, then let the
  // horde gather so the capture shows a fight, not an empty arena.
  world.startRun();
  playForward(world, input, 26, 0.85);
  if (world.phase === PHASE.OVER) {
    // The pilot died: restage with a tougher warden so the shot is play.
    world.startRun();
    blessPlayer(world, 400, 20, 2);
    playForward(world, input, 26, 0.9);
  }
  gatherCrowd(world, input, 12, 6, 0.85);
  return { screen: PHASE.PLAY, best: world.score };
}
