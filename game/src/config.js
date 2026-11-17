// EMBERWARDEN — tuning and constants. One file, one job: every number the
// game balances on lives here so the other modules stay logic-only.
export const VIEW_W = 1280;
export const VIEW_H = 720;
export const STEP = 1 / 60;

export const ARENA = { x: 48, y: 96, w: 1184, h: 576 };

// Palette: a cold indigo night, warm ember gold for the player, violet for
// the shadow horde. The whole game is drawn from these values.
export const COLORS = {
  night: '#0b0e1a',
  night2: '#10142a',
  floor: '#141a33',
  floorLine: '#1d2547',
  wall: '#2a3468',
  wallTop: '#3b4a8f',
  ember: '#ffb347',
  emberHot: '#ff7a18',
  gold: '#ffd97a',
  warden: '#59e3c8',
  wardenDark: '#1f8f7d',
  hp: '#ff5d73',
  shade: '#8f7bff',
  shadeDark: '#5a3fd4',
  brute: '#c94f7c',
  spitter: '#b06cff',
  mote: '#e08cff',
  text: '#f2ead8',
  dim: '#9aa3c7',
};

export const PLAYER = {
  radius: 16,
  speed: 265,
  maxHp: 100,
  fireInterval: 0.16,
  bulletSpeed: 640,
  bulletDamage: 12,
  bulletRadius: 5,
  dashSpeed: 780,
  dashTime: 0.16,
  dashCooldown: 1.4,
  flareDamage: 55,
  flareRadius: 230,
  flareMax: 2,
  invulnTime: 0.9,
};

// The lantern's light is the warden's only safe ground: enemies standing
// outside it are shadowed — armoured and quicker. The beacon at the
// arena's heart carries its own smaller pool of light.
export const LIGHT_BASE_RADIUS = 340; // around the player
export const BEACON_LIGHT_RADIUS = 230; // around the beacon
export const FLARE_LIGHT_RADIUS = 580; // while a flare surge burns
export const FLARE_LIGHT_TIME = 4.0;
export const SHADOW_DAMAGE_TAKEN = 0.6; // a shadowed enemy takes 60% damage
export const SHADOW_SPEED = 1.12; // and moves 12% faster
export const LIGHT_UPGRADE_RADIUS = 60; // per Lantern's Reach level
export const ENEMIES = {
  wisp: { radius: 15, hp: 18, speed: 95, damage: 10, score: 50, color: '#8f7bff', eye: '#e6dcff' },
  mote: { radius: 9, hp: 8, speed: 165, damage: 6, score: 30, color: '#e08cff', eye: '#fff0ff' },
  spitter: { radius: 17, hp: 30, speed: 62, damage: 8, score: 90, color: '#b06cff', eye: '#ffe9a8' },
  brute: { radius: 30, hp: 120, speed: 48, damage: 22, score: 200, color: '#c94f7c', eye: '#ffd0dd' },
  splitter: { radius: 20, hp: 36, speed: 78, damage: 12, score: 120, color: '#7a5cff', eye: '#d8ccff' },
  stalker: { radius: 14, hp: 26, speed: 120, damage: 14, score: 150, color: '#ff9d5c', eye: '#fff3c4' },
  boss: { radius: 52, hp: 900, speed: 55, damage: 30, score: 2000, color: '#4a2a8f', eye: '#ffb347' },
};

export const BOSS_WAVE = 5; // a boss anchors every 5th wave
export const FINAL_WAVE = 10; // clearing wave 10 wins the run
export const PICKUP_HEAL = 25;
export const COMBO_WINDOW = 3.0;
export const COMBO_STEP = 0.25; // +25% score per combo tier, capped below

// How many of each kind a wave may field, by wave number. The spawn director
// in world.js turns this budget into a timed trickle.
export function waveBudget(wave) {
  const budget = {
    wisp: 4 + wave * 2,
    mote: wave >= 2 ? 3 + wave : 0,
    spitter: wave >= 3 ? 1 + Math.floor(wave / 2) : 0,
    splitter: wave >= 4 ? 1 + Math.floor((wave - 2) / 2) : 0,
    stalker: wave >= 3 ? 1 + Math.floor(wave / 3) : 0,
    brute: wave >= 4 ? Math.floor((wave - 1) / 2) : 0,
  };
  if (wave % BOSS_WAVE === 0) budget.boss = 1;
  return budget;
}

export function waveSpawnInterval(wave) {
  return Math.max(0.35, 1.15 - wave * 0.07);
}
