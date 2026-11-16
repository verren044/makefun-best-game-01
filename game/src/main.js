// EMBERWARDEN — boot, the fixed-step loop, screen wiring and shot mode.
// The simulation lives in world.js; this file only runs it and draws it.
import { VIEW_W, VIEW_H, STEP } from './config.js';
import { World, PHASE } from './world.js';
import { SoundBank } from './audio.js';
import { Input } from './input.js';
import { Particles } from './particles.js';
import { draw } from './render.js';
import { stageShot, autopilotStep, FakeInput } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
canvas.width = VIEW_W;
canvas.height = VIEW_H;

const params = new URLSearchParams(location.search);
const shotName = params.get('shot');
const seed = Number(params.get('seed') ?? 7) || 7;
const SHOT_MODE = shotName !== null;

const sound = new SoundBank();
const particles = new Particles();
const world = new World(seed, sound, particles);
const input = new Input(canvas);
const attractInput = new FakeInput();

// Errors the page hit, surfaced for headless smoke tests.
window.__game = { phase: world.phase, score: 0, wave: 0, hp: 100, errors: [] };
window.addEventListener('error', (e) => window.__game.errors.push(String(e.message)));
window.addEventListener('unhandledrejection', (e) => window.__game.errors.push(String(e.reason)));

function fitCanvas() {
  const scale = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H);
  canvas.style.width = `${Math.floor(VIEW_W * scale)}px`;
  canvas.style.height = `${Math.floor(VIEW_H * scale)}px`;
}
window.addEventListener('resize', fitCanvas);
fitCanvas();

function announce(text) {
  statusEl.textContent = text;
}

// --- menu wiring -----------------------------------------------------------

let clickQueued = false;
canvas.addEventListener('pointerdown', () => {
  sound.unlock();
  clickQueued = true;
});
window.addEventListener('keydown', () => sound.unlock(), { once: true });

function upgradeCardAt(x, y) {
  if (world.phase !== PHASE.UPGRADE) return -1;
  const cards = world.upgradeChoices;
  const cardW = 300;
  const cardH = 220;
  const gap = 36;
  const totalW = cards.length * cardW + (cards.length - 1) * gap;
  const startX = (VIEW_W - totalW) / 2;
  for (let i = 0; i < cards.length; i += 1) {
    const cx = startX + i * (cardW + gap);
    if (x >= cx && x <= cx + cardW && y >= 230 && y <= 230 + cardH) return i;
  }
  return -1;
}

function handleMenus() {
  const phase = world.phase;
  if (phase === PHASE.TITLE) {
    if (clickQueued || input.wasPressed('Enter') || input.wasPressed('Space')) {
      sound.click();
      world.startRun();
      announce('Wave 1. Defend the beacon.');
    }
  } else if (phase === PHASE.UPGRADE) {
    let pick = -1;
    if (input.wasPressed('Digit1')) pick = 0;
    else if (input.wasPressed('Digit2')) pick = 1;
    else if (input.wasPressed('Digit3')) pick = 2;
    else if (clickQueued) pick = upgradeCardAt(input.mouse.x, input.mouse.y);
    if (pick >= 0 && pick < world.upgradeChoices.length) {
      sound.click();
      world.applyUpgrade(world.upgradeChoices[pick].id);
      announce(`Wave ${world.wave}.`);
    }
  } else if (phase === PHASE.PAUSE) {
    if (input.wasPressed('Escape') || input.wasPressed('KeyP') || clickQueued) {
      input.consume('Escape');
      input.consume('KeyP');
      world.phase = PHASE.PLAY;
      announce('Resumed.');
    }
  } else if (phase === PHASE.OVER || phase === PHASE.VICTORY) {
    if (input.wasPressed('KeyR') || clickQueued) {
      sound.click();
      world.startRun();
      announce('Wave 1. Defend the beacon.');
    }
  }
  clickQueued = false;
}

// --- main loop ---------------------------------------------------------------

let last = performance.now();
let acc = 0;
let lastAnnouncedPhase = world.phase;

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  acc += dt;
  let steps = 0;
  while (acc >= STEP && steps < 5) {
    handleMenus();
    if (world.phase === PHASE.TITLE) {
      // The attract demo plays itself behind the title screen.
      autopilotStep(world, attractInput, 0.7);
      world.stepPlay(STEP, attractInput);
      attractInput.endStep();
      if (world.enemies.length === 0 && world.spawnQueue.length === 0) world.beginWave(1);
      input.endStep();
    } else {
      world.step(STEP, input);
    }
    acc -= STEP;
    steps += 1;
  }
  if (steps === 5) acc = 0;
  draw(ctx, world, input);
  if (world.phase !== lastAnnouncedPhase) {
    lastAnnouncedPhase = world.phase;
    if (world.phase === PHASE.OVER) announce(`Game over. Score ${world.score}. Press R to try again.`);
    if (world.phase === PHASE.VICTORY) announce(`Victory! Score ${world.score}. Press R to play again.`);
    if (world.phase === PHASE.UPGRADE) announce('Wave cleared. Choose an upgrade.');
  }
  window.__game = {
    phase: world.phase,
    score: world.score,
    wave: world.wave,
    hp: world.player.hp,
    enemies: world.enemies.length,
    errors: window.__game.errors,
  };
  requestAnimationFrame(frame);
}

if (SHOT_MODE) {
  // Deterministic scenes: stage the world, draw one frame, signal readiness.
  // No audio, no animation loop, no wall clock — the same seed, same frame.
  // Round the clock up to a whole second so the screens' blinking prompts
  // ("CLICK OR PRESS ENTER…") are always in their visible half.
  stageShot(shotName, world);
  world.time = Math.ceil(world.time);
  // A damage flash is a quarter-second transient; clear it so the still shows
  // the game's own palette rather than the moment a hit landed.
  world.flashTimer = 0;
  draw(ctx, world, input);
  window.__shotReady = true;
  window.__game = {
    phase: world.phase,
    score: world.score,
    wave: world.wave,
    hp: world.player.hp,
    enemies: world.enemies.length,
    errors: window.__game.errors,
  };
} else {
  world.beginWave(1);
  requestAnimationFrame(frame);
}
