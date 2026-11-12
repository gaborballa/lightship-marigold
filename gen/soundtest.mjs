// Sound must stay silent until "Enable sound" is clicked, then run without errors.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module';
const require = createRequire(process.env.TOOLS + '/'); const { chromium } = require('playwright');
const root = path.resolve(new URL('..', import.meta.url).pathname);
const srv = http.createServer((q, s) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); s.end(d); }); }).listen(0);
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); }); page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
await page.addInitScript(() => { window.__ac = 0; const A = window.AudioContext; window.AudioContext = class extends A { constructor(...a) { super(...a); window.__ac++; } }; });
await page.goto(`http://localhost:${srv.address().port}/index.html?auto=1&seed=2`);
await page.waitForFunction('window.__stats && window.__stats.frame > 30'); await page.waitForTimeout(4000);
console.log('audio contexts before the click:', await page.evaluate('window.__ac'));
await page.click('#snd'); await page.waitForTimeout(12000);
console.log('after the click: contexts', await page.evaluate('window.__ac'), 'button', await page.textContent('#snd'), 'sim t', (await page.evaluate('window.__sim.t')).toFixed(1), 'score', await page.evaluate('window.__sim.score'));
console.log(errs.length ? 'ERRORS ' + errs.join(' | ') : 'no console errors');
await browser.close(); srv.close();
