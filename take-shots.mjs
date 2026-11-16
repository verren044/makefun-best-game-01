// Headless screenshot + smoke driver for EMBERWARDEN (Node stdlib only).
//   node take-shots.mjs shot <title|play|boss|victory|end>  — one staged shot -> screenshots/
//   node take-shots.mjs shots                              — all four shots from shots.json
//   node take-shots.mjs smoke                              — interactive play test in headless Chrome
// Serves game/ over HTTP (like the finalist review does) and drives the
// system Chrome at /opt/meta-chromium/chrome over CDP.
import { spawn, execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve, normalize, sep } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const GAME_ROOT = join(HERE, 'game');
const SHOTS = JSON.parse(readFileSync(join(HERE, 'shots.json'), 'utf8'));
const CHROME = '/opt/meta-chromium/chrome';
const DEBUG_PORT = 9334;
const PORT = 8089; // kept for reference; shots use file:// (127.0.0.1 is blocked in this sandbox)
const POLICY_FILE = '/var/lib/hatch-browser/rootfs-base/usr/share/hatch/chromium/webgl-allowed-domains.txt';
const POLICY_SHA256 = '8097045f0459c96c4cdc76e3a1af4e0f43f640b4b59c43d6db35e3641c0264c6';

const mode = process.argv[2];
const shotName = process.argv[3];

function log(...args) { console.log('[shots]', ...args); }

async function waitFor(fn, timeoutMs, label) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await fn()) return true;
    await sleep(250);
  }
  throw new Error(`timeout waiting for ${label}`);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

function startServer() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      let pathname = decodeURIComponent(url.pathname);
      if (pathname.endsWith('/')) pathname += 'index.html';
      const file = resolve(join(GAME_ROOT, normalize(pathname)));
      if (file !== GAME_ROOT && !file.startsWith(GAME_ROOT + sep)) { res.writeHead(403); res.end('forbidden'); return; }
      const data = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream', 'content-length': data.length });
      res.end(data);
    } catch { res.writeHead(404); res.end('not found'); }
  });
  return new Promise((resolveServer) => server.listen(PORT, '127.0.0.1', () => resolveServer(server)));
}

class CDP {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    this.ready = new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });
    this.ws.onmessage = (msg) => {
      const data = JSON.parse(msg.data);
      if (data.id !== undefined && this.pending.has(data.id)) {
        const { resolve, reject } = this.pending.get(data.id);
        this.pending.delete(data.id);
        if (data.error) reject(new Error(JSON.stringify(data.error)));
        else resolve(data.result);
      } else if (data.method) {
        this.events.push(data);
      }
    };
  }

  async send(method, params = {}) {
    await this.ready;
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(`page eval failed: ${JSON.stringify(r.exceptionDetails)}`);
    return r.result?.value;
  }
}

async function launchChrome() {
  const chrome = spawn(CHROME, [
    '--headless=new', '--no-sandbox', '--disable-gpu-sandbox', '--disable-dev-shm-usage',
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--allow-file-access-from-files',
    `--hatch-webgl-allowed-domains-file=${POLICY_FILE}`,
    `--hatch-webgl-allowed-domains-sha256=${POLICY_SHA256}`,
    `--remote-debugging-port=${DEBUG_PORT}`, '--window-size=1280,720', '--hide-scrollbars',
    '--autoplay-policy=no-user-gesture-required', 'about:blank',
  ], { stdio: 'ignore' });
  await waitFor(async () => {
    try { const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`); return res.ok; }
    catch { return false; }
  }, 20000, 'chrome devtools');
  return chrome;
}

async function newPage(url) {
  const targets = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page');
  const cdp = new CDP(page.webSocketDebuggerUrl);
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Network.enable');
  await cdp.send('Log.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Page.navigate', { url });
  return cdp;
}

function toJpeg(pngPath, jpgPath) {
  execFileSync('python3', ['-c', `
from PIL import Image
im = Image.open(${JSON.stringify(pngPath)}).convert('RGB')
im.save(${JSON.stringify(jpgPath)}, 'JPEG', quality=82)
print(im.size)
`], { stdio: 'inherit' });
}

async function takeShot(cdp, query, outName) {
  await cdp.send('Page.navigate', { url: `file://${GAME_ROOT}/index.html${query}` });
  await waitFor(async () => {
    try { return await cdp.eval('window.__shotReady === true'); } catch { return false; }
  }, 60000, '__shotReady');
  await sleep(300);
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const pngPath = `/tmp/emberwarden-${outName.replace('.jpg', '')}.png`;
  const jpgPath = join(HERE, 'screenshots', outName);
  writeFileSync(pngPath, Buffer.from(shot.data, 'base64'));
  toJpeg(pngPath, jpgPath);
  const g = await cdp.eval('window.__game');
  log(outName, '->', jpgPath, 'game:', JSON.stringify(g));
  return g;
}

async function runShots() {
  const server = await startServer();
  const chrome = await launchChrome();
  try {
    const cdp = await newPage(`file://${GAME_ROOT}/index.html`);
    for (const s of SHOTS) await takeShot(cdp, s.query, s.name);
    const reqs = cdp.events.filter((e) => e.method === 'Network.requestWillBeSent').map((e) => e.params.request.url);
    const external = [...new Set(reqs)].filter((u) => !u.startsWith('file://') && !u.startsWith('data:'));
    log('requests:', [...new Set(reqs)].join('\n  '));
    log('external requests:', JSON.stringify(external));
    const errs = cdp.events.filter((e) => (e.method === 'Log.entryAdded' && e.params.entry.level === 'error') || e.method === 'Runtime.exceptionThrown');
    log('console errors:', errs.length, JSON.stringify(errs.slice(0, 3)));
  } finally {
    chrome.kill();
    server.close();
  }
}

async function runSmoke() {
  const server = await startServer();
  const chrome = await launchChrome();
  const failures = [];
  try {
    const cdp = await newPage(`file://${GAME_ROOT}/index.html`);
    await waitFor(async () => {
      try { return await cdp.eval('window.__game !== undefined'); } catch { return false; }
    }, 20000, '__game');
    await sleep(1500);
    let g = await cdp.eval('window.__game');
    log('boot:', JSON.stringify(g));
    if (g.phase !== 'title') failures.push(`phase at boot is ${g.phase}, want title`);
    if (g.errors.length > 0) failures.push(`page errors: ${JSON.stringify(g.errors)}`);

    // Start the game with Enter.
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Enter', key: 'Enter' });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Enter', key: 'Enter' });
    await sleep(500);
    g = await cdp.eval('window.__game');
    log('after Enter:', JSON.stringify(g));
    if (g.phase !== 'play') failures.push(`phase after Enter is ${g.phase}, want play`);

    // Move + fire for a few seconds.
    const p0 = await cdp.eval('window.__game');
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyD', key: 'd' });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 900, y: 300, button: 'left', clickCount: 1 });
    await sleep(3000);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 900, y: 300, button: 'left', clickCount: 1 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyD', key: 'd' });
    const p1 = await cdp.eval('window.__game');
    log('after move+fire:', JSON.stringify(p0), '->', JSON.stringify(p1));

    // Dash.
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'ShiftLeft', key: 'Shift' });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'ShiftLeft', key: 'Shift' });
    await sleep(300);

    // Pause and resume.
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyP', key: 'p' });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyP', key: 'p' });
    await sleep(300);
    g = await cdp.eval('window.__game');
    log('after P:', JSON.stringify(g));
    if (g.phase !== 'pause') failures.push(`phase after P is ${g.phase}, want pause`);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyP', key: 'p' });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyP', key: 'p' });
    await sleep(300);
    g = await cdp.eval('window.__game');
    if (g.phase !== 'play') failures.push(`phase after resume is ${g.phase}, want play`);

    // Let the game run: enemies should spawn and the player may score.
    await sleep(8000);
    g = await cdp.eval('window.__game');
    log('after 8s play:', JSON.stringify(g));
    if (g.enemies === 0 && g.wave === 1) failures.push('no enemies spawned in wave 1');

    // Console errors + network.
    const consoleErrors = cdp.events.filter((e) =>
      (e.method === 'Log.entryAdded' && e.params.entry.level === 'error') ||
      (e.method === 'Runtime.exceptionThrown'));
    if (consoleErrors.length > 0) failures.push(`console errors: ${JSON.stringify(consoleErrors.slice(0, 3))}`);
    const reqs = cdp.events.filter((e) => e.method === 'Network.requestWillBeSent').map((e) => e.params.request.url);
    const external = [...new Set(reqs)].filter((u) => !u.startsWith('file://') && !u.startsWith('data:'));
    const failed = cdp.events.filter((e) => e.method === 'Network.loadingFailed').map((e) => e.params.errorText);
    log('requests:', [...new Set(reqs)].join('\n  '));
    if (external.length > 0) failures.push(`external requests: ${JSON.stringify(external)}`);
    if (failed.length > 0) failures.push(`failed requests: ${JSON.stringify(failed)}`);

    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync('/tmp/emberwarden-smoke.png', Buffer.from(shot.data, 'base64'));
    const stats = execFileSync('python3', ['-c', `
from PIL import Image
import statistics
im = Image.open('/tmp/emberwarden-smoke.png').convert('L')
px = list(im.getdata())
print(f"mean={statistics.mean(px):.1f} stdev={statistics.pstdev(px):.1f} min={min(px)} max={max(px)}")
`], { encoding: 'utf8' });
    log('smoke frame pixels:', stats.trim());
    const stdev = parseFloat(stats.match(/stdev=([\d.]+)/)[1]);
    if (stdev < 5) failures.push('rendered frame looks blank (stdev < 5)');
  } finally {
    chrome.kill();
    server.close();
  }
  if (failures.length > 0) {
    console.log('\nSMOKE FAILED:');
    failures.forEach((f) => console.log(' -', f));
    process.exit(1);
  }
  console.log('\nSMOKE PASSED');
}

if (mode === 'shots') await runShots();
else if (mode === 'shot') {
  const s = SHOTS.find((x) => x.query.includes(`shot=${shotName}`))
    ?? { name: `${shotName}.jpg`, query: `?shot=${shotName}&seed=7` };
  const server = await startServer();
  const chrome = await launchChrome();
  try {
    const cdp = await newPage(`file://${GAME_ROOT}/index.html`);
    await takeShot(cdp, s.query, s.name);
  } finally { chrome.kill(); server.close(); }
} else if (mode === 'smoke') await runSmoke();
else { console.error('usage: take-shots.mjs shots | shot <name> | smoke'); process.exit(2); }
