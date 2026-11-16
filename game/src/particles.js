// Particles, floating score text and screen shake. Purely cosmetic: nothing
// here touches game state, so it can be reset or skipped freely.
export class Particles {
  constructor() {
    this.list = [];
    this.texts = [];
    this.shakeTime = 0;
    this.shakeMag = 0;
  }

  burst(x, y, color, count, speed, life = 0.6, size = 3) {
    for (let i = 0; i < count; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.7);
      this.list.push({
        x, y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: life * (0.6 + Math.random() * 0.6), age: 0,
        size: size * (0.6 + Math.random() * 0.8),
        color,
      });
    }
  }

  ring(x, y, color, count = 26, speed = 320) {
    for (let i = 0; i < count; i += 1) {
      const a = (i / count) * Math.PI * 2;
      this.list.push({
        x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
        life: 0.5, age: 0, size: 4, color,
      });
    }
  }

  text(x, y, str, color = '#ffd97a', size = 16) {
    this.texts.push({ x, y, str, color, size, age: 0, life: 0.9 });
  }

  shake(mag, time = 0.25) {
    this.shakeMag = Math.max(this.shakeMag, mag);
    this.shakeTime = Math.max(this.shakeTime, time);
  }

  update(dt) {
    for (const p of this.list) {
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy *= 0.96;
    }
    this.list = this.list.filter((p) => p.age < p.life);
    for (const t of this.texts) { t.age += dt; t.y -= 34 * dt; }
    this.texts = this.texts.filter((t) => t.age < t.life);
    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      if (this.shakeTime <= 0) this.shakeMag = 0;
    }
  }

  offset() {
    if (this.shakeTime <= 0) return { x: 0, y: 0 };
    const m = this.shakeMag * (this.shakeTime / 0.25);
    return { x: (Math.random() * 2 - 1) * m, y: (Math.random() * 2 - 1) * m };
  }

  draw(ctx) {
    for (const p of this.list) {
      ctx.globalAlpha = Math.max(0, 1 - p.age / p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    for (const t of this.texts) {
      ctx.globalAlpha = Math.max(0, 1 - t.age / t.life);
      ctx.font = `bold ${t.size}px Georgia, serif`;
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }
}
