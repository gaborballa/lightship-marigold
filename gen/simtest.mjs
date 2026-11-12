// Headless check: the bot must finish the level for several seeds.
import fs from 'node:fs';
import { Sim, makeBot } from '../game/sim.js';
const L = JSON.parse(fs.readFileSync(new URL('../game/layout.json', import.meta.url)));
let ok = 0; const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
for (const seed of seeds) {
  const sim = new Sim(L, seed), bot = makeBot(sim); const dt = 1 / 120; const log = []; let hits = 0, restarts = 0, maxOut = 0;
  for (let i = 0; i < 120 * 400 && !sim.won; i++) {
    sim.step(dt, bot(dt));
    for (const e of sim.events) { if (e.type === 'bankdone') log.push(`bank${e.n}@${sim.t.toFixed(0)}`); if (e.type === 'hit') hits++; if (e.type === 'restart') restarts++; }
    sim.events.length = 0;
    const p = sim.player; if (Math.abs(p.x) > 21 || p.y < 2 || p.y > 87 || isNaN(p.x)) maxOut++;
    if (isNaN(sim.big.x)) { console.log('NaN big'); break; }
  }
  console.log(`seed ${seed}: won=${sim.won} t=${sim.t.toFixed(1)}s score=${sim.score} shots=${sim.shots} hits=${hits} restarts=${restarts} out=${maxOut} ${log.join(' ')}`);
  if (sim.won) ok++;
}
if (ok !== seeds.length) { console.log('FAIL'); process.exit(1); } else console.log('all seeds finish');
