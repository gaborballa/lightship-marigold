// Walk into every wall and corner with held keys (same input interface as the page) and prove
// that the player never leaves the level and never sticks.
import fs from 'node:fs'; import { Sim } from '../game/sim.js';
const L = JSON.parse(fs.readFileSync(new URL('../game/layout.json', import.meta.url)));
let worstOut = 0, stuck = 0, runs = 0; const dt = 1 / 120;
for (let area = 0; area < 3; area++) for (let k = 0; k < 72; k++) for (const strafe of [0, 1, -1]) {
  const sim = new Sim(L, 3); sim.resetAll(area); sim.big.x = 0; sim.big.y = 5; sim.tossers.forEach(t => t.area = 9); // hazards parked: this tests walls only
  const p = sim.player; p.yaw = k / 72 * Math.PI * 2; runs++;
  const hold = (f, s, sec) => { for (let i = 0; i < sec * 120; i++) { sim.big.x = 0; sim.big.y = 5; sim.big.vx = sim.big.vy = 0; sim.step(dt, { f, s, fire: false }); sim.events.length = 0; const o = Math.max(Math.abs(p.x) - (L.W - 1.0), 2.5 + 1.0 - p.y, p.y - 86.2); if (o > worstOut) worstOut = o; if (isNaN(p.x)) throw new Error('NaN'); } };
  hold(1, strafe, 5);                       // into the wall, sliding along it
  const a = [p.x, p.y]; hold(1, -strafe || 1, 2.5); // slide the other way along the same wall
  // not stuck: from where it ended, some direction must be free
  let best = 0; for (let d = 0; d < 8; d++) { const q = [p.x, p.y]; p.yaw = d * Math.PI / 4; p.vx = p.vy = 0; hold(1, 0, 0.6); best = Math.max(best, Math.hypot(p.x - q[0], p.y - q[1])); }
  if (best < 3) { stuck++; console.log('STUCK', area, k, strafe, a, [p.x, p.y]); }
  // the area ahead must stay closed until this bank is lit
  if (p.y > L.areas[area].y1 + 0.5) { console.log('ESCAPED area', area, k, strafe, p.x.toFixed(2), p.y.toFixed(2)); stuck++; }
}
console.log(`runs ${runs}, worst overshoot past the walls ${worstOut.toFixed(3)} cm, stuck or escaped ${stuck}`);
process.exit(stuck || worstOut > 0.01 ? 1 : 0);
