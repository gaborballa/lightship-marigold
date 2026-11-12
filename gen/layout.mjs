// Single source of truth for the table "Lightship Marigold".
// Units: cm. x = right, y = up the table (toward the backglass), z = up from the playfield.
// Consumed by gen/art.mjs (canvas art), gen/build.py (Blender bake) and game/sim.js (collision).
import fs from 'node:fs';
const W = 21, L = 88, WALL_H = 6, GLASS_Z = 6;
const K = { wood: 0, steel: 1, rubber: 2, plastic: 3 };
const o = {
  W, L, WALL_H, GLASS_Z, name: 'Lightship Marigold', word: 'LIGHTSHIP',
  segs: [],      // collision: [ax,ay,bx,by,kind,flags]  flags 1 = player only, 2 = sling kick face, 32 = wire guide (small balls pass)
  circs: [],     // collision: [x,y,r,kind]
  rails: [],     // steel strips {pts,h}
  posts: [],     // {x,y,rubber}
  bands: [],     // rubber bands around posts {pts:[[x,y]..] closed}
  plastics: [],  // {poly,z,id}
  bulbs: [],     // GI lamps under plastics {x,y,z,area}
  bumpers: [], targets: [], standups: [], spinners: [], rollovers: [], lamps: [],
  holes: [], gates: [], flippers: [], slings: [], tossers: [], areas: [], arch: [],
};
const seg = (a, b, kind, flags = 0) => o.segs.push([a[0], a[1], b[0], b[1], kind, flags]);
const mir = p => [-p[0], p[1]];
const both = f => { f(p => p, 1); f(mir, -1); };

// ---- outer boundary -------------------------------------------------------
const ARCH_Y = 72, ARCH_RY = 14;
for (let i = 0; i <= 20; i++) { const t = Math.PI * i / 20; o.arch.push([W * Math.cos(t), ARCH_Y + ARCH_RY * Math.sin(t)]); }
for (let i = 0; i < 20; i++) seg(o.arch[i], o.arch[i + 1], K.steel);
seg([W, 2.5], [W, ARCH_Y], K.wood); seg([-W, ARCH_Y], [-W, 2.5], K.wood);
seg([-W, 2.5], [W, 2.5], K.steel); // apron face

// ---- bottom funnels, flippers, drain --------------------------------------
both((m, s) => {
  const a = m([-21, 15.5]), b = m([-9, 7.2]);
  o.rails.push({ pts: [a, b], h: 2.0 }); seg(a, b, K.steel);
  o.plastics.push({ poly: [m([-21, 2.5]), m([-21, 15.2]), m([-9.4, 7.2]), m([-9.4, 2.5])], z: 3.0, id: 'corner' });
  o.posts.push({ x: s * -19.2, y: 12.2, rubber: false, hid: true }, { x: s * -11, y: 5, rubber: false, hid: true }, { x: s * -19.2, y: 4.5, rubber: false, hid: true });
  o.bulbs.push({ x: s * -17, y: 8.2, z: 1.6, area: 0 }, { x: s * -12.5, y: 5.4, z: 1.6, area: 0 });
  o.flippers.push({ x: s * -8.4, y: 6.8, len: 6.6, rest: s < 0 ? Math.PI - (-0.49) : -0.49, up: s < 0 ? Math.PI - 0.49 : 0.49, side: -s });
  seg(m([-9, 7.2]), m([-2.6, 3.7]), K.rubber);
});
seg([-2.6, 3.7], [2.6, 3.7], K.steel, 1); // the drain: the player cannot fall in

// ---- slingshots ------------------------------------------------------------
both((m, s) => {
  const P1 = m([-16.2, 23.5]), P2 = m([-16.2, 17.2]), P3 = m([-9.8, 13.2]);
  for (const p of [P1, P2, P3]) o.posts.push({ x: p[0], y: p[1], rubber: false });
  o.bands.push({ pts: [P1, P2, P3], r: 0.55 });
  o.slings.push({ a: P3, b: P1, s });
  o.plastics.push({ poly: [m([-16.9, 24.4]), m([-16.9, 16.6]), m([-9.6, 12.3]), m([-8.9, 13.4])], z: 3.0, id: 'sling' });
  o.bulbs.push({ x: s * -14.6, y: 18.6, z: 1.6, area: 0 });
});

// ---- dividers: islands with a bank of drop targets as the door -------------
function divider(y0, bank, area) {
  both((m, s) => {
    const c = [m([-16.6, y0]), m([-16.6, y0 + 4]), m([-5.1, y0 + 7.5]), m([-5.1, y0 + 3.5])];
    for (const p of c) o.posts.push({ x: p[0], y: p[1], rubber: false });
    o.bands.push({ pts: c, r: 0.55 });
    o.plastics.push({ poly: [m([-17.3, y0 - 0.7]), m([-17.3, y0 + 4.6]), m([-4.5, y0 + 8.3]), m([-4.5, y0 + 2.9])], z: 3.0, id: 'island' + bank });
    o.bulbs.push({ x: s * -13.5, y: y0 + 2.9, z: 1.6, area }, { x: s * -8, y: y0 + 4.6, z: 1.6, area });
    // one-way gate in the orbit lane: the heavy table ball pushes through, the player cannot
    o.gates.push({ a: m([-21, y0 + 2]), b: m([-16.9, y0 + 2]), bank, kind: 'orbit' });
  });
  for (let i = 0; i < 3; i++) o.targets.push({ x: -3 + 3 * i, y: y0 + 5.5, bank, i, n: bank * 3 + i, w: 2.7, h: 2.8 });
}
divider(27.5, 0, 0);
divider(53.5, 1, 1);

// ---- area 2: bumper nest ---------------------------------------------------
o.bumpers.push({ x: -7.5, y: 43.5 }, { x: 7.5, y: 43.5 }, { x: 0, y: 49.6 });
o.standups.push({ x: -20.6, y: 46, ang: 0 }, { x: 20.6, y: 46, ang: Math.PI }, { x: -20.6, y: 66.5, ang: 0 }, { x: 20.6, y: 66.5, ang: Math.PI });
o.spinners.push({ x: 18.8, y: 50.5, w: 3.6 }, { x: -18.8, y: 24.5, w: 3.6 });
both((m, s) => { // lone rubber posts for bank shots
  o.posts.push({ x: s * -12.6, y: 38.2, rubber: true }, { x: s * -11.5, y: 50.8, rubber: true });
});

// ---- area 3: top lanes and the special pocket ------------------------------
for (const x of [-9, -3, 3, 9]) { const pts = [[x, 67.2], [x, 73.2]]; o.rails.push({ pts, h: 2.0, wire: true }); seg(pts[0], pts[1], K.steel, 32); o.circs.push([x, 67.2, 0.25, K.steel], [x, 73.2, 0.25, K.steel]); }
for (const x of [-13.5, -6, 0, 6, 13.5]) o.rollovers.push({ x, y: 70.2 });
both((m, s) => {
  const a = m([-5.1, 76.6]), b = m([-5.1, 85.4]);
  o.rails.push({ pts: [a, b], h: 2.0, wire: true }); seg(a, b, K.steel, 32);
  o.posts.push({ x: a[0], y: a[1], rubber: true });
  o.posts.push({ x: s * -14.5, y: 78.5, rubber: true });
  o.tossers.push({ x: s * -11.5, y: 81.2 });
  o.bulbs.push({ x: s * -17.5, y: 74.5, z: 4.2, area: 2, arch: true }, { x: s * -9.5, y: 84.6, z: 4.2, area: 2, arch: true });
});
o.tossers.push({ x: -12.8, y: 55.2, a2: true });
for (let i = 0; i < 3; i++) o.targets.push({ x: -3 + 3 * i, y: 78.2, bank: 2, i, n: 6 + i, w: 2.7, h: 2.8 });
o.gates.push({ a: [-4.9, 79.8], b: [4.9, 79.8], bank: 2, kind: 'special' });
o.holes.push({ x: 0, y: 82.6, r: 1.85, kind: 'special' });

// posts -> collision
for (const p of o.posts) if (!p.hid) o.circs.push([p.x, p.y, p.rubber ? 0.78 : 0.5, p.rubber ? K.rubber : K.steel]);
// bands -> collision (outer offset segments)
for (const b of o.bands) {
  const n = b.pts.length; let area = 0;
  for (let i = 0; i < n; i++) { const p = b.pts[i], q = b.pts[(i + 1) % n]; area += p[0] * q[1] - q[0] * p[1]; }
  const sg = area > 0 ? 1 : -1;
  for (let i = 0; i < n; i++) {
    const p = b.pts[i], q = b.pts[(i + 1) % n]; const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy);
    const nx = sg * dy / l * b.r, ny = -sg * dx / l * b.r;
    const A = [p[0] + nx, p[1] + ny], B = [q[0] + nx, q[1] + ny];
    const sl = o.slings.find(s => (s.a === p && s.b === q) || (s.a === q && s.b === p));
    seg(A, B, K.rubber, sl ? 2 : 0); if (sl) { sl.fa = A; sl.fb = B; }
    o.circs.push([p[0], p[1], b.r, K.rubber]);
  }
}
for (const b of o.bumpers) o.circs.push([b.x, b.y, 2.75, K.plastic]);

// ---- lamps (playfield inserts) ---------------------------------------------
// col: 0 amber, 1 red, 2 green, 3 blue, 4 white.  g: letter index 0..8, or 'c<area>' chase, 's' special
const lamp = (x, y, r, col, g, area, shape = 0) => o.lamps.push({ x, y, r, col, g, area, shape });
for (const t of o.targets) lamp(t.x, t.y - 2.9, 1.15, [0, 1, 2][t.bank], t.n, t.bank);
for (let i = 0; i < 6; i++) lamp(0, 11.5 + i * 2.9, 0.85, i % 2 ? 4 : 0, 'c0', 0, 1);
both((m, s) => { for (let i = 0; i < 4; i++) lamp(s * (-7.8 - i * 0.75), 17.2 + i * 2.6, 0.7, 1, 'c0', 0); });
for (let i = 0; i < 10; i++) { const t = i / 10 * Math.PI * 2 + 0.31; lamp(6.3 * Math.sin(t) * 0.62, 45.4 + 3.9 * Math.cos(t) * 0.62 + 0.3, 0.62, i % 2 ? 4 : 1, 'c1', 1); }
both((m, s) => { for (let i = 0; i < 3; i++) lamp(s * (-14.4 + i * 0.4), 40.6 + i * 3.4, 0.8, 3, 'c1', 1); lamp(s * -18.8, 39, 0.9, 0, 'c1', 1, 1); });
for (const r of o.rollovers) lamp(r.x, r.y - 2.6, 0.8, 2, 'c2', 2);
both((m, s) => { for (let i = 0; i < 3; i++) lamp(s * (-16.2 + i * 2.4), 63.2 + i * 0.9, 0.7, 3, 'c2', 2); });
lamp(0, 75.0, 1.5, 0, 's', 2, 2);
o.lamps.forEach((l, i) => l.id = i);

// ---- areas -----------------------------------------------------------------
o.areas = [
  { name: 'a1', y0: 2, y1: 33, start: [0, 14.2, Math.PI / 2] },
  { name: 'a2', y0: 33, y1: 59, start: [0, 36.6, Math.PI / 2] },
  { name: 'a3', y0: 59, y1: 88, start: [0, 62.8, Math.PI / 2] },
];
fs.writeFileSync(new URL('../game/layout.json', import.meta.url), JSON.stringify(o));
console.log('layout:', o.segs.length, 'segs', o.circs.length, 'circs', o.lamps.length, 'lamps', o.posts.length, 'posts');
