// Headless capture for EMBERFALL: serves game/, opens each ?shot= URL from
// shots.json in headless Chromium, waits for window.__shotReady, and saves a
// 1280x720 JPEG. Also reports console errors, page errors and any network
// request that is not the local game server (the game must make none).
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

const shots = JSON.parse(readFileSync(new URL('./shots.json', import.meta.url), 'utf8'));
const root = new URL('.', import.meta.url).pathname;
const CHROME = `${process.env.HOME}/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome`;

const server = spawn('node', ['serve.ts', '--port', '8123'], { cwd: root, stdio: 'pipe' });
await new Promise((resolve) => {
  server.stdout.on('data', () => resolve());
  setTimeout(resolve, 3000);
});

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
const outsideRequests = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
});
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
page.on('request', (req) => {
  if (!req.url().startsWith('http://localhost:8123/')) outsideRequests.push(req.url());
});

for (const shot of shots) {
  const url = `http://localhost:8123/${shot.query}`;
  console.log('loading', url);
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  const timeout = shot.query.includes('victory') ? 180000 : 60000;
  try {
    await page.waitForFunction(() => window.__shotReady === true, { timeout });
    const summary = await page.evaluate(() => window.__shotSummary || null);
    console.log('ready:', shot.name, JSON.stringify(summary));
  } catch {
    const err = await page.evaluate(() => window.__gameError || 'no __shotReady, no error recorded');
    console.log('NOT READY:', shot.name, '-', err);
    errors.push(`${shot.name}: ${err}`);
  }
  await page.screenshot({ path: `${root}screenshots/${shot.name}`, type: 'jpeg', quality: 80 });
  console.log('saved', shot.name);
}

// Plain load (title screen) once, to check for load errors outside shot mode.
await page.goto('http://localhost:8123/', { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(2500);
const plain = await page.evaluate(() => ({
  error: window.__gameError || null,
  hasCanvas: !!document.querySelector('#game'),
  debugHandle: !!window.__emberfall,
  screen: window.__emberfall ? window.__emberfall.screen() : null,
}));
console.log('plain load:', JSON.stringify(plain));

await browser.close();
server.kill();
console.log('ERRORS:', errors.length ? errors : 'none');
console.log('OUTSIDE REQUESTS:', outsideRequests.length ? outsideRequests : 'none');
