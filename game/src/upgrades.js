// The upgrade pool: after every cleared wave the player picks one of three
// cards. Each upgrade is a small, named effect with its own apply() so the
// dossier outline reads like a design document.
import { shuffle } from './random.js';

export const UPGRADES = [
  {
    id: 'ember-rapid', name: 'Rapid Embers', icon: '»',
    desc: '+22% fire rate. Your lantern spits embers faster.',
    max: 4, apply: (p) => { p.fireInterval *= 0.82; },
  },
  {
    id: 'ember-heavy', name: 'Heavy Embers', icon: '◆',
    desc: '+35% bullet damage. Each ember hits like a hammer.',
    max: 4, apply: (p) => { p.bulletDamage *= 1.35; },
  },
  {
    id: 'multishot', name: 'Twin Flames', icon: '✦',
    desc: '+1 ember per shot, fanned out. Crowds melt.',
    max: 3, apply: (p) => { p.multishot += 1; },
  },
  {
    id: 'pierce', name: 'Piercing Light', icon: '→',
    desc: 'Embers pass through +1 enemy before fading.',
    max: 2, apply: (p) => { p.pierce += 1; },
  },
  {
    id: 'swift-boots', name: 'Swift Boots', icon: '›',
    desc: '+12% move speed. Outrun the dark.',
    max: 3, apply: (p) => { p.speed *= 1.12; },
  },
  {
    id: 'lantern-heart', name: 'Lantern Heart', icon: '♥',
    desc: '+25 max health and heal 25 now.',
    max: 4, apply: (p) => { p.maxHp += 25; p.hp = Math.min(p.maxHp, p.hp + 25); },
  },
  {
    id: 'dash-mastery', name: 'Dash Mastery', icon: '↯',
    desc: 'Dash recharges 30% faster.',
    max: 3, apply: (p) => { p.dashCooldown *= 0.7; },
  },
  {
    id: 'flare-cache', name: 'Flare Cache', icon: '☀',
    desc: '+1 flare charge and +20% flare damage.',
    max: 3, apply: (p) => { p.flareMax += 1; p.flares = Math.min(p.flareMax, p.flares + 1); p.flareDamage *= 1.2; },
  },
  {
    id: 'ember-magnet', name: 'Ember Magnet', icon: '◎',
    desc: 'Pickups fly to you from twice as far.',
    max: 2, apply: (p) => { p.magnetRadius *= 2; },
  },
  {
    id: 'lantern-reach', name: "Lantern's Reach", icon: '◉',
    desc: '+60 lantern light. More of the arena burns for you.',
    max: 3, apply: (p) => { p.lightRadius += 60; },
  },
  {
    id: 'adrenaline', name: 'Adrenaline', icon: '!',
    desc: 'Kills briefly speed up your fire by 15% (stacks to 3).',
    max: 1, apply: (p) => { p.adrenaline = true; },
  },
];

// Roll three distinct upgrades the player has not maxed out yet.
export function rollUpgrades(rng, taken) {
  const available = UPGRADES.filter((u) => (taken[u.id] ?? 0) < u.max);
  const pool = available.length >= 3 ? available : UPGRADES;
  return shuffle(rng, [...pool]).slice(0, 3);
}
