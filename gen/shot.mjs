// Headless Chrome on the real GPU. Usage: node gen/shot.mjs "<query>" "<steps>"
// steps: wait:ms ; shot:name ; down:Key ; up:Key ; click ; hold:ms (left button) ; drag:dx,dy (right button) ; move:dx,dy ; fps ; eval:js
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(process.env.TOOLS + '/'); const { chromium } = require('playwright');
const root = path.resolve(new URL('..', import.meta.url).pathname);
const types = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', glb: 'model/gltf-binary' };
const srv = http.createServer((q, s) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0])); const p = f.endsWith('/') ? f + 'index.html' : f; fs.readFile(p, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'content-type': types[p.split('.').pop()] || 'application/octet-stream' }); s.end(d); }); }).listen(0);
const port = srv.address().port;
const [query = '', steps = 'wait:3000;shot:x'] = process.argv.slice(2);
const W = +(process.env.W || 1920), H = +(process.env.H || 1080);
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: [...(process.env.UNCAP ? ['--disable-gpu-vsync', '--disable-frame-rate-limit'] : []), '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const errs = []; page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text().slice(0, 400)); }); page.on('pageerror', e => errs.push('PAGEERROR ' + e.message.slice(0, 600)));
const reqs = []; page.on('request', r => { if (!r.url().startsWith('http://localhost')) reqs.push(r.url()); });
await page.goto(`http://localhost:${port}/index.html?${query}`);
await page.waitForFunction('window.__stats && window.__stats.frame > 5', null, { timeout: 60000 }).catch(e => errs.push('never started: ' + e.message.slice(0, 100)));
let mx = W / 2, my = H / 2; await page.mouse.move(mx, my);
for (const st of steps.split(';')) {
  const [c, ...rest] = st.trim().split(':'); const a = rest.join(':');
  if (c === 'wait') await page.waitForTimeout(+a);
  else if (c === 'shot') { await page.screenshot({ path: `${root}/shots/${a}.png` }); }
  else if (c === 'down') await page.keyboard.down(a); else if (c === 'up') await page.keyboard.up(a);
  else if (c === 'click') { await page.mouse.down(); await page.waitForTimeout(60); await page.mouse.up(); }
  else if (c === 'hold') { await page.mouse.down(); await page.waitForTimeout(+a); await page.mouse.up(); }
  else if (c === 'drag') { const [dx, dy] = a.split(',').map(Number); await page.mouse.down({ button: 'right' }); for (let i = 1; i <= 8; i++) await page.mouse.move(mx + dx * i / 8, my + dy * i / 8); mx += dx; my += dy; await page.mouse.up({ button: 'right' }); mx = W / 2; my = H / 2; await page.mouse.move(mx, my); }
  else if (c === 'move') { const [dx, dy] = a.split(',').map(Number); mx += dx; my += dy; await page.mouse.move(mx, my); }
  else if (c === 'fps') { await page.evaluate('window.__f0 = [window.__stats.frame, performance.now()]'); await page.waitForTimeout(3000); console.log('FPS', await page.evaluate('(()=>{const s=window.__stats;return ((s.frame-window.__f0[0])/((performance.now()-window.__f0[1])/1000)).toFixed(1)+" internal "+s.w+"x"+s.h+" scale "+s.scale.toFixed(2)})()')); }
  else if (c === 'eval') console.log('EVAL', JSON.stringify(await page.evaluate(a)));
}
console.log('STATS', JSON.stringify(await page.evaluate('window.__stats').catch(() => null)));
if (reqs.length) console.log('EXTERNAL REQUESTS', reqs);
console.log(errs.length ? 'ERRORS\n' + [...new Set(errs)].slice(0, 12).join('\n') : 'no console errors');
await browser.close(); srv.close();
