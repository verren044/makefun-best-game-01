// All canvas drawing: the arena, every entity, the HUD, and every screen
// (title, upgrade cards, pause, game over, victory). The world never draws.
import { VIEW_W, VIEW_H, ARENA, COLORS, FINAL_WAVE, BOSS_WAVE } from './config.js';
import { PHASE } from './world.js';

const TITLE_FONT = 'Georgia, "Times New Roman", serif';
const UI_FONT = '"Segoe UI", system-ui, sans-serif';

export function draw(ctx, world, input) {
  ctx.save();
  drawBackground(ctx, world);
  if (world.phase === PHASE.TITLE) {
    drawAttractWorld(ctx, world);
    drawTitle(ctx, world);
  } else {
    drawPickups(ctx, world);
    drawEnemies(ctx, world);
    drawPlayer(ctx, world);
    drawBullets(ctx, world);
    world.fx.draw(ctx);
    drawLanternLight(ctx, world);
    drawHUD(ctx, world);
    if (world.phase === PHASE.UPGRADE) drawUpgrade(ctx, world);
    else if (world.phase === PHASE.PAUSE) drawPause(ctx, world);
    else if (world.phase === PHASE.OVER) drawOver(ctx, world);
    else if (world.phase === PHASE.VICTORY) drawVictory(ctx, world);
    drawBanner(ctx, world);
    if (world.phase === PHASE.PLAY) drawCrosshair(ctx, input);
  }
  if (world.flashTimer > 0) {
    ctx.fillStyle = `rgba(255, 40, 60, ${world.flashTimer * 0.9})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  ctx.restore();
}

function drawBackground(ctx, world) {
  ctx.fillStyle = COLORS.night;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  // Arena floor: dark tiles with a faint grid.
  ctx.fillStyle = COLORS.floor;
  ctx.fillRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h);
  ctx.strokeStyle = COLORS.floorLine;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = ARENA.x + 74; x < ARENA.x + ARENA.w; x += 74) {
    ctx.moveTo(x, ARENA.y);
    ctx.lineTo(x, ARENA.y + ARENA.h);
  }
  for (let y = ARENA.y + 72; y < ARENA.y + ARENA.h; y += 72) {
    ctx.moveTo(ARENA.x, y);
    ctx.lineTo(ARENA.x + ARENA.w, y);
  }
  ctx.stroke();
  // The beacon at the arena's heart: the thing the warden defends.
  const cx = VIEW_W / 2;
  const cy = ARENA.y + ARENA.h / 2;
  const pulse = 1 + Math.sin(world.time * 1.6) * 0.08;
  const glow = ctx.createRadialGradient(cx, cy, 4, cx, cy, 120 * pulse);
  glow.addColorStop(0, 'rgba(255, 190, 90, 0.30)');
  glow.addColorStop(1, 'rgba(255, 190, 90, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(cx - 130, cy - 130, 260, 260);
  ctx.fillStyle = '#3a2c14';
  ctx.beginPath();
  ctx.arc(cx, cy, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffb347';
  ctx.beginPath();
  ctx.arc(cx, cy, 14 * pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff3c4';
  ctx.beginPath();
  ctx.arc(cx, cy, 6, 0, Math.PI * 2);
  ctx.fill();
  // Walls.
  ctx.strokeStyle = COLORS.wall;
  ctx.lineWidth = 10;
  ctx.strokeRect(ARENA.x - 5, ARENA.y - 5, ARENA.w + 10, ARENA.h + 10);
  ctx.strokeStyle = COLORS.wallTop;
  ctx.lineWidth = 2;
  ctx.strokeRect(ARENA.x - 5, ARENA.y - 5, ARENA.w + 10, ARENA.h + 10);
}

function drawAttractWorld(ctx, world) {
  drawEnemies(ctx, world);
  drawPlayer(ctx, world);
  world.fx.draw(ctx);
  drawLanternLight(ctx, world);
}

function drawLanternLight(ctx, world) {
  const p = world.player;
  const g = ctx.createRadialGradient(p.x, p.y, 60, p.x, p.y, 460);
  g.addColorStop(0, 'rgba(5, 6, 16, 0)');
  g.addColorStop(0.75, 'rgba(5, 6, 16, 0.18)');
  g.addColorStop(1, 'rgba(5, 6, 16, 0.55)');
  ctx.fillStyle = g;
  ctx.fillRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h);
}

function drawPlayer(ctx, world) {
  const p = world.player;
  if (world.phase === PHASE.OVER) return;
  // Lantern glow.
  const glow = ctx.createRadialGradient(p.x, p.y, 6, p.x, p.y, 90);
  glow.addColorStop(0, 'rgba(255, 179, 71, 0.5)');
  glow.addColorStop(1, 'rgba(255, 179, 71, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(p.x - 95, p.y - 95, 190, 190);
  ctx.save();
  ctx.translate(p.x, p.y);
  if (p.invuln > 0 && Math.floor(world.time * 16) % 2 === 0) ctx.globalAlpha = 0.45;
  // Cloak: a teal triangle pointing where the warden faces.
  ctx.rotate(p.aimAngle);
  ctx.fillStyle = COLORS.wardenDark;
  ctx.beginPath();
  ctx.moveTo(18, 0);
  ctx.lineTo(-12, -13);
  ctx.lineTo(-16, 0);
  ctx.lineTo(-12, 13);
  ctx.closePath();
  ctx.fill();
  // Body and hood.
  ctx.fillStyle = COLORS.warden;
  ctx.beginPath();
  ctx.arc(0, 0, p.radius - 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0b0e1a';
  ctx.beginPath();
  ctx.arc(4, 0, 7, 0, Math.PI * 2);
  ctx.fill();
  // The lantern, held ahead.
  ctx.fillStyle = '#3a2c14';
  ctx.fillRect(14, -5, 8, 10);
  ctx.fillStyle = COLORS.gold;
  ctx.beginPath();
  ctx.arc(18, 0, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawEnemies(ctx, world) {
  for (const e of world.enemies) {
    ctx.save();
    ctx.translate(e.x, e.y);
    const flash = e.hitFlash > 0;
    const body = flash ? '#ffffff' : e.color;
    if (e.kind === 'wisp') {
      // A drifting ghost: wobbly circle with a tail and two eyes.
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-e.radius * 0.7, 4);
      ctx.quadraticCurveTo(-e.radius, e.radius + 8 + Math.sin(e.wobble) * 4, -e.radius * 0.2, e.radius * 0.8);
      ctx.quadraticCurveTo(0, e.radius + 4, e.radius * 0.6, e.radius * 0.6);
      ctx.closePath();
      ctx.fill();
      drawEyes(ctx, e, -5, -3, 5, -3);
    } else if (e.kind === 'mote') {
      ctx.rotate(e.wobble * 0.5);
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.moveTo(0, -e.radius);
      ctx.lineTo(e.radius, 0);
      ctx.lineTo(0, e.radius);
      ctx.lineTo(-e.radius, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = e.eye;
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (e.kind === 'spitter') {
      ctx.rotate(e.angle);
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.moveTo(e.radius + 6, 0);
      ctx.lineTo(-e.radius * 0.7, -e.radius * 0.8);
      ctx.lineTo(-e.radius * 0.7, e.radius * 0.8);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#0b0e1a';
      ctx.beginPath();
      ctx.arc(e.radius - 2, 0, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = e.eye;
      ctx.beginPath();
      ctx.arc(2, -6, 3, 0, Math.PI * 2);
      ctx.arc(2, 6, 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (e.kind === 'brute') {
      ctx.rotate(e.angle * 0.2);
      ctx.fillStyle = body;
      ctx.beginPath();
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * Math.PI * 2;
        const px = Math.cos(a) * e.radius;
        const py = Math.sin(a) * e.radius;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#ff8fb0';
      ctx.lineWidth = 3;
      ctx.stroke();
      drawEyes(ctx, e, -8, -6, 8, -6, 5);
    } else if (e.kind === 'splitter') {
      ctx.fillStyle = body;
      for (const [ox, oy, r] of [[-8, -6, 11], [9, -5, 10], [0, 9, 11]]) {
        ctx.beginPath();
        ctx.arc(ox, oy, r, 0, Math.PI * 2);
        ctx.fill();
      }
      drawEyes(ctx, e, -8, -8, 9, -7, 3);
    } else if (e.kind === 'boss') {
      // The Gloomlord: a huge crowned shade, glowing cracks when enraged.
      const enraged = e.hp / e.maxHp < 0.4;
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = enraged ? '#ff5d73' : COLORS.ember;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius - 6, 0, Math.PI * 2);
      ctx.stroke();
      // Crown spikes.
      ctx.fillStyle = enraged ? '#ff5d73' : COLORS.ember;
      for (let i = -2; i <= 2; i += 1) {
        const bx = i * 16;
        ctx.beginPath();
        ctx.moveTo(bx - 7, -e.radius + 8);
        ctx.lineTo(bx, -e.radius - 16 - Math.abs(i) * -4);
        ctx.lineTo(bx + 7, -e.radius + 8);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = e.eye;
      ctx.beginPath();
      ctx.arc(-14, -6, 7, 0, Math.PI * 2);
      ctx.arc(14, -6, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0b0e1a';
      ctx.beginPath();
      ctx.arc(-14, -6, 3, 0, Math.PI * 2);
      ctx.arc(14, -6, 3, 0, Math.PI * 2);
      ctx.fill();
      if (e.charging) {
        ctx.strokeStyle = '#ff5d73';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(e.angle) * 120, Math.sin(e.angle) * 120);
        ctx.stroke();
      }
    }
    // Health bar for anything hurt (not for motes: too small to read).
    if (e.kind !== 'mote' && e.hp < e.maxHp) {
      ctx.restore();
      ctx.save();
      ctx.translate(e.x, e.y);
      const w = e.radius * 2;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(-w / 2, -e.radius - 12, w, 5);
      ctx.fillStyle = '#ff5d73';
      ctx.fillRect(-w / 2, -e.radius - 12, w * Math.max(0, e.hp / e.maxHp), 5);
    }
    ctx.restore();
  }
}

function drawEyes(ctx, e, x1, y1, x2, y2, r = 3.5) {
  ctx.fillStyle = e.eye;
  ctx.beginPath();
  ctx.arc(x1, y1, r, 0, Math.PI * 2);
  ctx.arc(x2, y2, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0b0e1a';
  ctx.beginPath();
  ctx.arc(x1, y1, r * 0.45, 0, Math.PI * 2);
  ctx.arc(x2, y2, r * 0.45, 0, Math.PI * 2);
  ctx.fill();
}

function drawPickups(ctx, world) {
  for (const pk of world.pickups) {
    const blink = pk.life < 3 && Math.floor(world.time * 8) % 2 === 0;
    if (blink) continue;
    ctx.save();
    ctx.translate(pk.x, pk.y);
    const bob = Math.sin(world.time * 4 + pk.x) * 2;
    ctx.translate(0, bob);
    if (pk.kind === 'heart') {
      ctx.fillStyle = '#ff5d73';
      ctx.beginPath();
      ctx.moveTo(0, 6);
      ctx.bezierCurveTo(-11, -4, -6, -12, 0, -5);
      ctx.bezierCurveTo(6, -12, 11, -4, 0, 6);
      ctx.fill();
    } else if (pk.kind === 'flare') {
      ctx.fillStyle = COLORS.gold;
      ctx.beginPath();
      ctx.arc(0, 0, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff3c4';
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = COLORS.ember;
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-5, -5, 10, 10);
    }
    ctx.restore();
  }
}

function drawBullets(ctx, world) {
  for (const b of world.bullets) {
    ctx.fillStyle = '#ffd97a';
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.radius + 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff3c4';
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const b of world.ebullets) {
    ctx.fillStyle = '#b06cff';
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.radius + 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e6dcff';
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.radius - 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCrosshair(ctx, input) {
  const { x, y } = input.mouse;
  ctx.strokeStyle = 'rgba(242, 234, 216, 0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 10, 0, Math.PI * 2);
  ctx.moveTo(x - 15, y); ctx.lineTo(x - 6, y);
  ctx.moveTo(x + 6, y); ctx.lineTo(x + 15, y);
  ctx.moveTo(x, y - 15); ctx.lineTo(x, y - 6);
  ctx.moveTo(x, y + 6); ctx.lineTo(x, y + 15);
  ctx.stroke();
}

// --- HUD -----------------------------------------------------------------

function drawHUD(ctx, world) {
  const p = world.player;
  ctx.textBaseline = 'alphabetic';
  // Top-left: health.
  ctx.fillStyle = COLORS.text;
  ctx.font = `bold 15px ${UI_FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText('HP', 56, 40);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(88, 26, 220, 16);
  ctx.fillStyle = p.hp / p.maxHp < 0.3 ? '#ff2d4d' : COLORS.hp;
  ctx.fillRect(88, 26, 220 * Math.max(0, p.hp / p.maxHp), 16);
  ctx.strokeStyle = COLORS.dim;
  ctx.lineWidth = 1;
  ctx.strokeRect(88, 26, 220, 16);
  ctx.fillStyle = COLORS.text;
  ctx.font = `13px ${UI_FONT}`;
  ctx.fillText(`${Math.ceil(p.hp)} / ${p.maxHp}`, 316, 40);
  // Flares.
  ctx.font = `bold 15px ${UI_FONT}`;
  ctx.fillText('FLARES', 56, 68);
  for (let i = 0; i < p.flareMax; i += 1) {
    ctx.fillStyle = i < p.flares ? COLORS.gold : 'rgba(154,163,199,0.35)';
    ctx.beginPath();
    ctx.arc(128 + i * 24, 62, 7, 0, Math.PI * 2);
    ctx.fill();
  }
  // Dash cooldown.
  const dashFrac = 1 - Math.max(0, p.dashCooldown) / (p.dashCooldownMax ?? 1.4);
  ctx.fillStyle = COLORS.text;
  ctx.fillText('DASH', 220, 68);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(272, 58, 90, 9);
  ctx.fillStyle = dashFrac >= 1 ? COLORS.warden : '#3a6f66';
  ctx.fillRect(272, 58, 90 * dashFrac, 9);

  // Top-centre: wave and foes left.
  ctx.textAlign = 'center';
  ctx.fillStyle = COLORS.text;
  ctx.font = `bold 22px ${TITLE_FONT}`;
  const waveLabel = world.wave === 0 ? '—' : world.wave % BOSS_WAVE === 0 ? `WAVE ${world.wave} · BOSS` : `WAVE ${world.wave} / ${FINAL_WAVE}`;
  ctx.fillText(waveLabel, VIEW_W / 2, 38);
  ctx.font = `14px ${UI_FONT}`;
  ctx.fillStyle = COLORS.dim;
  ctx.fillText(world.phase === PHASE.PLAY ? `${world.enemiesLeft} shadows remain` : '', VIEW_W / 2, 62);

  // Top-right: score, combo, best.
  ctx.textAlign = 'right';
  ctx.fillStyle = COLORS.text;
  ctx.font = `bold 22px ${UI_FONT}`;
  ctx.fillText(`${world.score.toLocaleString('en-US')}`, VIEW_W - 56, 38);
  ctx.font = `13px ${UI_FONT}`;
  ctx.fillStyle = world.combo >= 3 ? COLORS.ember : COLORS.dim;
  ctx.fillText(world.combo >= 2 ? `COMBO x${world.comboMult.toFixed(2)} (${world.combo})` : 'SCORE', VIEW_W - 56, 60);
  ctx.fillStyle = COLORS.dim;
  ctx.fillText(`BEST ${world.best.score.toLocaleString('en-US')}`, VIEW_W - 56, 80);

  // Boss bar.
  if (world.boss && !world.boss.dead) {
    const b = world.boss;
    const barY = ARENA.y + ARENA.h + 28;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffb347';
    ctx.font = `bold 15px ${TITLE_FONT}`;
    ctx.fillText('THE GLOOMLORD', VIEW_W / 2, barY);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(VIEW_W / 2 - 260, barY + 6, 520, 12);
    ctx.fillStyle = '#8f7bff';
    ctx.fillRect(VIEW_W / 2 - 260, barY + 6, 520 * Math.max(0, b.hp / b.maxHp), 12);
    ctx.strokeStyle = COLORS.dim;
    ctx.strokeRect(VIEW_W / 2 - 260, barY + 6, 520, 12);
  }
}

function drawBanner(ctx, world) {
  if (world.bannerTimer <= 0 || !world.banner) return;
  const a = Math.min(1, world.bannerTimer / 0.5);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.textAlign = 'center';
  ctx.fillStyle = COLORS.gold;
  ctx.font = `bold 44px ${TITLE_FONT}`;
  ctx.fillText(world.banner, VIEW_W / 2, 300);
  ctx.restore();
}

// --- Screens ---------------------------------------------------------------

function dimScreen(ctx) {
  ctx.fillStyle = 'rgba(5, 6, 16, 0.72)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

function screenTitle(ctx, text, y, size = 64) {
  ctx.textAlign = 'center';
  ctx.fillStyle = COLORS.gold;
  ctx.font = `bold ${size}px ${TITLE_FONT}`;
  ctx.fillText(text, VIEW_W / 2, y);
}

function drawTitle(ctx, world) {
  dimScreen(ctx);
  screenTitle(ctx, 'EMBERWARDEN', 190, 72);
  ctx.fillStyle = COLORS.ember;
  ctx.font = `italic 24px ${TITLE_FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('Keeper of the Last Lantern', VIEW_W / 2, 232);
  ctx.fillStyle = COLORS.text;
  ctx.font = `17px ${UI_FONT}`;
  ctx.fillText('The dark is coming for the beacon. Hold the light through 10 waves.', VIEW_W / 2, 288);
  ctx.fillText('Slay the Gloomlord on wave 10 to win.', VIEW_W / 2, 314);
  ctx.fillStyle = COLORS.dim;
  ctx.font = `15px ${UI_FONT}`;
  const lines = [
    'WASD / Arrows — move      Mouse — aim      Hold Click / Space — fire embers',
    'SHIFT — dash      E / Right-click — flare burst      P — pause      M — mute',
    'Clear a wave, then pick 1 of 3 upgrades. Hearts and flares drop from the fallen.',
  ];
  lines.forEach((line, i) => ctx.fillText(line, VIEW_W / 2, 372 + i * 26));
  if (world.best.score > 0) {
    ctx.fillStyle = COLORS.gold;
    ctx.font = `bold 17px ${UI_FONT}`;
    ctx.fillText(`BEST  ${world.best.score.toLocaleString('en-US')} pts  ·  Wave ${world.best.wave}`, VIEW_W / 2, 472);
  }
  const blink = Math.floor(world.time * 2) % 2 === 0;
  if (blink) {
    ctx.fillStyle = COLORS.text;
    ctx.font = `bold 22px ${UI_FONT}`;
    ctx.fillText('CLICK OR PRESS ENTER TO BEGIN', VIEW_W / 2, 540);
  }
}

function drawUpgrade(ctx, world) {
  dimScreen(ctx);
  screenTitle(ctx, 'WAVE CLEARED', 130, 48);
  ctx.fillStyle = COLORS.text;
  ctx.font = `18px ${UI_FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('The lantern burns brighter. Choose one blessing:', VIEW_W / 2, 176);
  const cards = world.upgradeChoices;
  const cardW = 300;
  const cardH = 220;
  const gap = 36;
  const totalW = cards.length * cardW + (cards.length - 1) * gap;
  const startX = (VIEW_W - totalW) / 2;
  cards.forEach((up, i) => {
    const x = startX + i * (cardW + gap);
    const y = 230;
    ctx.fillStyle = '#1a2142';
    ctx.fillRect(x, y, cardW, cardH);
    ctx.strokeStyle = COLORS.ember;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, cardW, cardH);
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.gold;
    ctx.font = '44px Georgia, serif';
    ctx.fillText(up.icon, x + cardW / 2, y + 62);
    ctx.fillStyle = COLORS.text;
    ctx.font = `bold 20px ${UI_FONT}`;
    ctx.fillText(up.name, x + cardW / 2, y + 104);
    ctx.fillStyle = COLORS.dim;
    ctx.font = `15px ${UI_FONT}`;
    wrapText(ctx, up.desc, x + cardW / 2, y + 134, cardW - 36, 22);
    ctx.fillStyle = COLORS.ember;
    ctx.font = `bold 15px ${UI_FONT}`;
    ctx.fillText(`PRESS ${i + 1}  ·  OR CLICK`, x + cardW / 2, y + cardH - 18);
  });
  ctx.fillStyle = COLORS.dim;
  ctx.font = `15px ${UI_FONT}`;
  ctx.fillText(`Score ${world.score.toLocaleString('en-US')}  ·  Next: wave ${world.wave + 1}`, VIEW_W / 2, 500);
}

function wrapText(ctx, text, cx, y, maxW, lineH) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; }
    else line = test;
  }
  if (line) lines.push(line);
  lines.forEach((l, i) => ctx.fillText(l, cx, y + i * lineH));
}

function drawPause(ctx, world) {
  dimScreen(ctx);
  screenTitle(ctx, 'PAUSED', 300, 56);
  ctx.fillStyle = COLORS.text;
  ctx.font = `18px ${UI_FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('The shadows wait. Press P or ESC to keep fighting.', VIEW_W / 2, 360);
  ctx.fillStyle = COLORS.dim;
  ctx.fillText(`Wave ${world.wave}  ·  Score ${world.score.toLocaleString('en-US')}`, VIEW_W / 2, 392);
}

function statLines(world) {
  return [
    ['SCORE', world.score.toLocaleString('en-US')],
    ['WAVE REACHED', String(world.wave)],
    ['SHADOWS SLAIN', String(world.kills)],
    ['ACCURACY', `${world.accuracy}%`],
    ['TIME', formatTime(world.time)],
    ['BEST', world.best.score.toLocaleString('en-US')],
  ];
}

function drawStats(ctx, world, y0) {
  ctx.textAlign = 'center';
  for (const [label, value] of statLines(world)) {
    ctx.fillStyle = COLORS.dim;
    ctx.font = `15px ${UI_FONT}`;
    ctx.fillText(label, VIEW_W / 2 - 130, y0);
    ctx.fillStyle = COLORS.text;
    ctx.font = `bold 17px ${UI_FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(value, VIEW_W / 2 + 40, y0);
    ctx.textAlign = 'center';
    y0 += 30;
  }
  return y0;
}

function drawOver(ctx, world) {
  dimScreen(ctx);
  screenTitle(ctx, 'THE LIGHT GOES OUT', 180, 52);
  ctx.fillStyle = COLORS.text;
  ctx.font = `italic 20px ${TITLE_FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('The beacon fades… but a warden always returns.', VIEW_W / 2, 226);
  const y = drawStats(ctx, world, 280);
  const blink = Math.floor(world.time * 2) % 2 === 0;
  if (blink) {
    ctx.fillStyle = COLORS.text;
    ctx.font = `bold 22px ${UI_FONT}`;
    ctx.fillText('PRESS R OR CLICK TO TRY AGAIN', VIEW_W / 2, y + 40);
  }
}

function drawVictory(ctx, world) {
  dimScreen(ctx);
  screenTitle(ctx, 'DAWN BREAKS', 170, 60);
  ctx.fillStyle = COLORS.gold;
  ctx.font = `italic 22px ${TITLE_FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('The Gloomlord is ash. The beacon burns on — because of you.', VIEW_W / 2, 220);
  const y = drawStats(ctx, world, 272);
  const blink = Math.floor(world.time * 2) % 2 === 0;
  if (blink) {
    ctx.fillStyle = COLORS.text;
    ctx.font = `bold 22px ${UI_FONT}`;
    ctx.fillText('PRESS R OR CLICK TO PLAY AGAIN', VIEW_W / 2, y + 40);
  }
}

function formatTime(t) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
