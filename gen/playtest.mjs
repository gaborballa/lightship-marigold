// One full run in headless Chrome driven only by real input: held W A S D, arrow keys and
// right-button drags to look, left clicks to fire. Saves screenshots of every stage.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(process.env.TOOLS + '/'); const { chromium } = require('playwright');
const root = path.resolve(new URL('..', import.meta.url).pathname);
const types = { html: 'text/html', js: 'text/javascript', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', glb: 'model/gltf-binary' };
const srv = http.createServer((q, s) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'content-type': types[f.split('.').pop()] || 'application/octet-stream' }); s.end(d); }); }).listen(0);
const W = 1920, H = 1080;
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errs = []; page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); }); page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
await page.goto(`http://localhost:${srv.address().port}/index.html?seed=${process.argv[2] || 4}`);
await page.waitForFunction('window.__stats && window.__stats.frame > 30');
const shot = n => page.screenshot({ path: `${root}/shots/play_${n}.png` });
const S = () => page.evaluate(() => { const s = window.__sim, p = s.player; return { x: p.x, y: p.y, yaw: p.yaw, pitch: p.pitch, credits: p.credits, area: p.area, banks: s.banks.map(b => b.done), targets: s.targets.map(t => ({ x: t.x, y: t.y, up: t.up, bank: t.bank })), won: s.won, score: s.score, t: s.t, letters: s.letters.join(), cool: s.launcher.cool, attract: window.__stats.attract, big: [s.big.x, s.big.y, s.big.vx, s.big.vy] }; });
const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const wait = ms => page.waitForTimeout(ms);
await wait(900); await shot('0_attract'); console.log('attract', (await S()).attract);
// first input: one click. It must take over and do something satisfying.
await page.mouse.move(W / 2, H / 2); await page.mouse.down(); await wait(220); await page.mouse.up(); await page.evaluate(() => document.exitPointerLock()); await wait(1300);
let s = await S(); console.log('after first click: attract', s.attract, 'letters', s.letters, 'score', s.score); await shot('1_first_click');
const log = { firstClickLit: s.letters.includes('true') };
async function face(yaw, pitch = 0) {
  for (let i = 0; i < 6; i++) {
    const st = await S(); const d = wrap(yaw - st.yaw), dp = pitch - st.pitch;
    if (Math.abs(d) < 0.012 && Math.abs(dp) < 0.02) return;
    if (Math.abs(d) > 0.35) { const k = d > 0 ? 'ArrowLeft' : 'ArrowRight'; await page.keyboard.down(k); await wait(Math.min(900, (Math.abs(d) - 0.1) / 2.3 * 1000)); await page.keyboard.up(k); }
    else { const kk = (await page.evaluate('window.__stats.locked')) ? 0.0023 : 0.0052; const dx = -d / kk, dy = -dp / kk; await page.mouse.move(W / 2, H / 2); await page.mouse.down({ button: 'right' }); for (let j = 1; j <= 6; j++) await page.mouse.move(W / 2 + dx * j / 6, H / 2 + dy * j / 6); await page.mouse.up({ button: 'right' }); }
  }
}
const R = [[[0, 17]], [[0, 36.2], [13.2, 41.5], [13.2, 46.5], [8, 49]], [[0, 62.2], [0, 70.2]], [[0, 76.4], [0, 82.6]]];
let idx = 0, cur = -1, shots = 0, seenArea = { 0: true }, t0 = Date.now(), last = [0, 0], held = null;
const release = async () => { if (held) { await page.keyboard.up(held); held = null; } };
while (Date.now() - t0 < +(process.env.MAXMS || 200000)) {
  s = await S(); if (s.won) break;
  let a = s.banks.findIndex(b => !b); if (a < 0) a = 3;
  if (a !== cur || Math.hypot(s.x - last[0], s.y - last[1]) > 5) { cur = a; idx = 0; } last = [s.x, s.y];
  if (!seenArea[s.area] && ((s.area === 1 && s.y > 36) || (s.area === 2 && s.y > 62))) { seenArea[s.area] = true; await release(); await face(Math.PI / 2, 0.03); await wait(200); await shot(`2_area${s.area + 1}`); continue; }
  const route = R[a]; let wp = route[idx]; if (idx < route.length - 1 && Math.hypot(wp[0] - s.x, wp[1] - s.y) < 0.9) wp = route[++idx];
  const d = Math.hypot(wp[0] - s.x, wp[1] - s.y), lastWp = idx === route.length - 1;
  // step aside when the table ball comes close: strafe with A or D
  const bd = Math.hypot(s.big[0] - s.x, s.big[1] - s.y), closing = -((s.big[2]) * (s.big[0] - s.x) + (s.big[3]) * (s.big[1] - s.y)) / (bd || 1);
  if (bd < 8 && closing > 5) { await release(); const k = ((s.big[0] - s.x) * Math.sin(s.yaw) - (s.big[1] - s.y) * Math.cos(s.yaw)) > 0 ? 'KeyA' : 'KeyD'; await page.keyboard.down(k); await wait(450); await page.keyboard.up(k); continue; }
  if (a < 3 && lastWp && d < 1.6) {
    await release(); const t = s.targets.find(t => t.bank === a && t.up); if (!t) { await wait(100); continue; }
    const ax = t.x - s.x, ay = t.y - 0.3 - s.y, ad = Math.hypot(ax, ay), tt = ad / 81.7;
    await face(Math.atan2(ay, ax), Math.max(-0.3, Math.min(0.35, Math.atan2(1.2 + 0.5 * 70 * tt * tt * 0.55 - 2.2, ad))));
    if (process.env.DEBUG) { const q = await S(); console.log('shoot at', t.x, t.y, 'from', q.x.toFixed(2), q.y.toFixed(2), 'yaw', q.yaw.toFixed(3), 'want', Math.atan2(ay, ax).toFixed(3), 'pitch', q.pitch.toFixed(3), 'locked', await page.evaluate('window.__stats.locked')); }
    await page.mouse.move(W / 2, H / 2); await page.mouse.down(); await wait(270); await page.mouse.up(); await page.evaluate(() => document.exitPointerLock()); shots++; await wait(750);
    if (shots === 2) await shot('1b_area1_shooting');
  } else {
    const want = Math.atan2(wp[1] - s.y, wp[0] - s.x);
    if (Math.abs(wrap(want - s.yaw)) > 0.12) { await release(); await face(want, 0); }
    if (!held) { held = 'KeyW'; await page.keyboard.down('KeyW'); } await wait(90);
  }
}
await release(); await wait(1500); s = await S(); await shot('3_end');
console.log('won', s.won, 'score', s.score, 'sim time', s.t.toFixed(1), 'shots', shots, 'credits', s.credits);
await page.keyboard.press('KeyR'); await wait(1200); const r = await S(); await shot('4_after_restart');
console.log('after restart: won', r.won, 'score', r.score, 'y', r.y.toFixed(1), 'letters', r.letters);
console.log(errs.length ? 'ERRORS ' + errs.join(' | ') : 'no console errors');
await browser.close(); srv.close(); process.exit(s.won && log.firstClickLit && !r.won && r.score === 0 ? 0 : 1);
