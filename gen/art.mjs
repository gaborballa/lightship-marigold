// Draws all printed art with canvas 2D in headless Chrome and saves it to game/tex.
// Run: node gen/art.mjs   (needs playwright from the scratch tools folder via NODE_PATH)
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(process.env.TOOLS + '/');
const { chromium } = require('playwright');
const layout = JSON.parse(fs.readFileSync(new URL('../game/layout.json', import.meta.url)));
const out = new URL('../game/tex/', import.meta.url).pathname;

function draw(layout) {
  const C = { wood: '#d6ab72', navy: '#15304f', teal: '#2c8a88', mari: '#f0a31c', red: '#d2412a', cream: '#f2e5c2', black: '#151210', white: '#fbf6e6' };
  const LAMPC = ['#ffb23a', '#ff4a30', '#3fe08a', '#4aa2ff', '#fff2d0'];
  let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const res = {};
  function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  // planar table mapping: x -24..24, y -4..92
  function table(w, h) {
    const c = mk(w, h), g = c.getContext('2d'); const k = w / 48;
    g.setTransform(k, 0, 0, -k, 24 * k, 92 * k); // now draw in cm, y up
    return { c, g, k };
  }
  const poly = (g, pts) => { g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); };
  const circle = (g, x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, 7); };
  function text(g, s, x, y, size, font, fill, rot = 0, stroke) {
    const it = font.startsWith('italic '); g.save(); g.translate(x, y); g.rotate(rot); g.scale(size / 100, -size / 100); g.font = `${it ? 'italic ' : ''}100px ${font.replace('italic ', '')}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (stroke) { g.lineWidth = 16; g.strokeStyle = stroke; g.lineJoin = 'round'; g.strokeText(s, 0, 0); }
    g.fillStyle = fill; g.fillText(s, 0, 0); g.restore();
  }
  function arcText(g, s, cx, cy, r, a0, a1, size, font, fill) {
    const n = s.length; for (let i = 0; i < n; i++) { const a = a0 + (a1 - a0) * (n === 1 ? 0.5 : i / (n - 1)); text(g, s[i], cx + r * Math.cos(a), cy + r * Math.sin(a), size, font, fill, a - Math.PI / 2); }
  }
  function star4(g, x, y, r, rot = 0) { g.beginPath(); for (let i = 0; i < 8; i++) { const a = rot + i * Math.PI / 4, rr = i % 2 ? r * 0.22 : r; g.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a)); } g.closePath(); }
  const FUT = '"Futura", "Avenir Next Condensed", sans-serif', FUTC = '"Futura-CondensedExtraBold", "Futura", sans-serif', ROCK = '"Rockwell", serif', BOD = 'italic "Bodoni 72", "Didot", serif';
  const key = (g, w = 0.11) => { g.save(); g.translate(0.035, -0.025); g.lineWidth = w; g.strokeStyle = C.black; g.lineJoin = 'round'; g.stroke(); g.restore(); }; // black key plate, slightly off register

  // ================= playfield =================
  {
    const { c, g } = table(3072, 6144);
    g.fillStyle = C.wood; g.fillRect(-24, -4, 48, 96);
    // plywood grain
    for (let i = 0; i < 2600; i++) { const x = -24 + rnd() * 48, y = -4 + rnd() * 96, l = 3 + rnd() * 16; g.strokeStyle = `rgba(${rnd() < 0.5 ? '120,78,36' : '236,200,150'},${0.05 + rnd() * 0.09})`; g.lineWidth = 0.02 + rnd() * 0.07; g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + rnd() * 0.3 - 0.15, y + l * 0.3, x + rnd() * 0.3 - 0.15, y + l * 0.7, x + rnd() * 0.2 - 0.1, y + l); g.stroke(); }
    // --- area 3: night sky with beacon rays from the special hole
    g.save(); poly(g, [[-21, 59.5], [21, 59.5], [21, 90], [-21, 90]]); g.clip();
    g.fillStyle = C.navy; g.fillRect(-21, 59.5, 42, 31);
    for (let i = 0; i < 9; i++) { const a0 = Math.PI * (1.08 + i * 0.094), a1 = a0 + Math.PI * 0.047; g.fillStyle = i % 2 ? C.cream : C.mari; g.beginPath(); g.moveTo(0, 82.6); g.lineTo(60 * Math.cos(a0), 82.6 + 60 * Math.sin(a0)); g.lineTo(60 * Math.cos(a1), 82.6 + 60 * Math.sin(a1)); g.closePath(); g.fill(); key(g, 0.09); }
    for (let i = 0; i < 46; i++) { const x = -20 + rnd() * 40, y = 61 + rnd() * 25; if (Math.abs(x) < 15 && y < 79 && rnd() < 0.8) continue; g.fillStyle = C.cream; star4(g, x, y, 0.35 + rnd() * 0.7, rnd()); g.fill(); }
    circle(g, 0, 82.6, 4.3); g.fillStyle = C.red; g.fill(); key(g, 0.14); circle(g, 0, 82.6, 3.3); g.fillStyle = C.cream; g.fill(); key(g);
    g.restore();
    g.fillStyle = C.black; g.fillRect(-21, 59.3, 42, 0.22);
    // --- area 2: the deck. teal field, life rings round the bumpers, compass star
    g.save(); poly(g, [[-21, 33.5], [21, 33.5], [21, 59.4], [-21, 59.4]]); g.clip();
    g.fillStyle = C.teal; g.fillRect(-21, 33.5, 42, 26);
    for (let i = 0; i < 14; i++) { g.fillStyle = i % 2 ? 'rgba(242,229,194,0.16)' : 'rgba(21,48,79,0.16)'; g.fillRect(-21 + i * 3, 33.5, 3, 26); }
    g.fillStyle = C.cream; star4(g, 0, 45.6, 9.5, 0); g.fill(); key(g); g.fillStyle = C.mari; star4(g, 0, 45.6, 6.2, Math.PI / 4); g.fill(); key(g);
    circle(g, 0, 45.6, 2.6); g.fillStyle = C.navy; g.fill(); key(g);
    for (const b of layout.bumpers) { circle(g, b.x, b.y, 4.7); g.fillStyle = C.cream; g.fill(); key(g, 0.13); for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(b.x, b.y, 4.7, i * Math.PI / 2 + 0.3, i * Math.PI / 2 + 1.0); g.arc(b.x, b.y, 3.35, i * Math.PI / 2 + 1.0, i * Math.PI / 2 + 0.3, true); g.closePath(); g.fillStyle = C.red; g.fill(); key(g, 0.08); } circle(g, b.x, b.y, 3.35); g.fillStyle = C.navy; g.fill(); key(g, 0.1); }
    g.restore();
    g.fillStyle = C.black; g.fillRect(-21, 33.3, 42, 0.22);
    // --- area 1: the sea. scalloped wave bands, a path of light up the middle
    g.save(); poly(g, [[-21, 2], [21, 2], [21, 33.4], [-21, 33.4]]); g.clip();
    for (let r = 0; r < 12; r++) { const y = 33.5 - r * 2.7; g.fillStyle = [C.navy, C.teal, '#1f5f78'][r % 3]; g.beginPath(); g.moveTo(-24, y - 4); for (let x = -24; x <= 22; x += 2.8) { const ox = (r % 2) * 1.4; g.arc(x + ox + 1.4, y, 1.4, Math.PI, 0, true); } g.lineTo(24, y - 4); g.closePath(); g.fill(); key(g, 0.08); }
    poly(g, [[-4.6, 2], [4.6, 2], [2.2, 30], [-2.2, 30]]); g.fillStyle = C.mari; g.fill(); key(g, 0.13);
    poly(g, [[-2.9, 2], [2.9, 2], [1.3, 30], [-1.3, 30]]); g.fillStyle = C.cream; g.fill(); key(g, 0.09);
    g.restore();
    // titles and legends
    text(g, 'Marigold', 0, 7.6, 1.5, BOD, C.navy);
    text(g, 'SPECIAL', 0, 77.2, 1.0, FUTC, C.cream, 0, C.black); text(g, 'WHEN LIT', 0, 72.9, 0.72, FUT, C.cream, 0, C.black);
    text(g, 'LIGHT ALL NINE LAMPS', -18.9, 46, 0.8, FUT, C.cream, Math.PI / 2); text(g, 'TO OPEN THE SPECIAL', 18.9, 46, 0.8, FUT, C.cream, -Math.PI / 2);
    for (const s of [-1, 1]) { text(g, '500', s * 10.5, 36.3, 1.3, ROCK, C.cream, 0, C.black); text(g, '50', s * 13.5, 65.2, 1.0, ROCK, C.cream, 0, C.black); }
    // inserts: white plastic with a black key ring and printed letters
    for (const l of layout.lamps) {
      circle(g, l.x, l.y, l.r + 0.16); g.fillStyle = C.black; g.fill(); circle(g, l.x, l.y, l.r); g.fillStyle = '#ffffff'; g.fill();
      if (typeof l.g === 'number') text(g, layout.word[l.g], l.x, l.y - 0.05, 1.45, FUTC, C.black);
      if (l.shape === 1) { g.fillStyle = 'rgba(0,0,0,0.75)'; g.beginPath(); g.moveTo(l.x, l.y + l.r * 0.55); g.lineTo(l.x - l.r * 0.5, l.y - l.r * 0.3); g.lineTo(l.x + l.r * 0.5, l.y - l.r * 0.3); g.closePath(); g.fill(); }
      if (l.shape === 2) { g.fillStyle = C.black; star4(g, l.x, l.y, l.r * 0.8, 0); g.fill(); }
    }
    for (const r of layout.rollovers) { g.fillStyle = C.black; g.fillRect(r.x - 0.28, r.y - 1.15, 0.56, 2.3); }
    // the special hole and drop target slots
    for (const h of layout.holes) { circle(g, h.x, h.y, h.r + 0.12); g.fillStyle = '#050403'; g.fill(); }
    for (const t of layout.targets) { g.fillStyle = '#070605'; g.fillRect(t.x - t.w / 2 - 0.06, t.y - 0.34, t.w + 0.12, 0.68); }
    // wear: ball tracks rubbed through the paint, then fine scratches
    g.globalCompositeOperation = 'source-over';
    const track = (pts, w, a) => { g.strokeStyle = `rgba(214,171,114,${a})`; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke(); };
    for (let k = 0; k < 5; k++) for (const s of [-1, 1]) {
      const j = () => (rnd() - 0.5) * 0.9;
      track([[s * 18.9 + j(), 16], [s * 18.9 + j(), 72], [s * 15 + j(), 80]], 0.5 + rnd(), 0.05);
      track([[s * 4 + j(), 8], [s * 9 + j(), 20], [s * 18.5 + j(), 29]], 0.5 + rnd(), 0.05);
      track([[s * 12 + j(), 12], [s * 6 + j(), 9], [s * 3 + j(), 5]], 0.6 + rnd(), 0.07);
      track([[j(), 10], [j(), 31], [j() * 2, 40]], 0.7 + rnd(), 0.045);
    }
    for (const b of layout.bumpers) for (let k = 0; k < 4; k++) { g.strokeStyle = 'rgba(214,171,114,0.07)'; g.lineWidth = 0.35 + rnd() * 0.5; circle(g, b.x, b.y, 3.4 + rnd() * 0.9); g.stroke(); }
    for (let i = 0; i < 1500; i++) { const x = -21 + rnd() * 42, y = 2 + rnd() * 86, a = rnd() * 7, l = 0.3 + rnd() * 2.2; g.strokeStyle = `rgba(240,225,200,${0.04 + rnd() * 0.1})`; g.lineWidth = 0.012 + rnd() * 0.02; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l * 2.5); g.stroke(); }
    res.pf_art = c.toDataURL('image/jpeg', 0.93);
  }
  // ================= lamp emission (for the bake) =================
  {
    const { c, g } = table(1024, 2048); g.fillStyle = '#000'; g.fillRect(-24, -4, 48, 96);
    for (const l of layout.lamps) { circle(g, l.x, l.y, l.r); g.fillStyle = LAMPC[l.col]; g.fill(); }
    res.pf_lamps = c.toDataURL('image/png');
  }
  // ================= wear map: R gloss (mylar bright, tracks dull), G dust =================
  {
    const { c, g } = table(1024, 2048); g.fillStyle = 'rgb(128,0,0)'; g.fillRect(-24, -4, 48, 96);
    g.globalCompositeOperation = 'lighter';
    const dust = (x, y, r, a) => { const gr = g.createRadialGradient(x, y, r * 0.25, x, y, r); gr.addColorStop(0, `rgba(0,${Math.round(255 * a)},0,1)`); gr.addColorStop(1, 'rgba(0,0,0,1)'); g.fillStyle = gr; circle(g, x, y, r); g.fill(); };
    for (const p of layout.posts) dust(p.x, p.y, 2.2, 0.55);
    for (const s of layout.segs) { const n = Math.ceil(Math.hypot(s[2] - s[0], s[3] - s[1]) / 1.2); for (let i = 0; i <= n; i++) dust(s[0] + (s[2] - s[0]) * i / n, s[1] + (s[3] - s[1]) * i / n, 1.5 + rnd() * 0.9, 0.3); }
    for (let i = 0; i < 300; i++) dust(-21 + rnd() * 42, 2 + rnd() * 86, 0.5 + rnd() * 2.5, 0.12);
    // mylar patches: glossy
    g.globalCompositeOperation = 'source-over'; g.fillStyle = 'rgba(50,0,0,0.8)';
    for (const b of layout.bumpers) { circle(g, b.x, b.y, 5.2); g.fill(); }
    for (const s of [-1, 1]) { g.save(); g.translate(s * 11.2, 17.5); g.rotate(s * 0.48); g.fillRect(-1.6, -6.5, 3.2, 13); g.restore(); }
    g.fillRect(-5, 29.5, 10, 3.2); g.fillRect(-5, 55.5, 10, 3.2);
    g.globalCompositeOperation = 'source-over';
    const dull = (pts, w, a) => { g.strokeStyle = `rgba(235,0,0,${a})`; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke(); };
    for (let k = 0; k < 6; k++) for (const s of [-1, 1]) { const j = () => (rnd() - 0.5) * 1.2; dull([[s * 18.9 + j(), 16], [s * 18.9 + j(), 72], [s * 15 + j(), 80]], 0.8 + rnd(), 0.2); dull([[s * 4 + j(), 8], [s * 9 + j(), 20], [s * 18.5 + j(), 29]], 0.8 + rnd(), 0.2); dull([[j(), 10], [j(), 31], [j() * 2, 52]], 0.9 + rnd(), 0.2); }
    res.wear = c.toDataURL('image/png');
  }
  // ================= plastics, bumper caps, apron =================
  {
    const { c, g } = table(2048, 4096); g.fillStyle = C.cream; g.fillRect(-24, -4, 48, 96);
    for (const p of layout.plastics) {
      const cx = p.poly.reduce((a, q) => a + q[0], 0) / p.poly.length, cy = p.poly.reduce((a, q) => a + q[1], 0) / p.poly.length;
      g.save(); poly(g, p.poly); g.clip();
      g.fillStyle = p.id === 'sling' ? C.mari : p.id === 'corner' ? C.navy : p.id === 'island0' ? C.red : C.navy; g.fillRect(-24, -4, 48, 96);
      if (p.id === 'corner') { for (let i = 0; i < 9; i++) { g.strokeStyle = i % 2 ? C.teal : C.cream; g.lineWidth = 0.35; g.beginPath(); for (let x = -24; x <= 24; x += 0.4) g.lineTo(x, 3.2 + i * 1.5 + 0.35 * Math.sin(x * 2.3 + i)); g.stroke(); } }
      if (p.id === 'sling') { g.fillStyle = C.red; star4(g, cx - Math.sign(cx) * 0.5, cy + 0.3, 2.6, 0.3); g.fill(); key(g, 0.1); g.fillStyle = C.cream; circle(g, cx - Math.sign(cx) * 0.5, cy + 0.3, 0.8); g.fill(); key(g, 0.08); }
      if (p.id.startsWith('island')) { const a = Math.sign(cx) * -0.29; g.save(); g.translate(cx, cy); g.rotate(a); g.fillStyle = C.cream; g.fillRect(-9, -0.95, 18, 1.9); g.restore(); text(g, p.id === 'island0' ? (cx < 0 ? 'LIGHT' : 'SHIP') : (cx < 0 ? 'MARI' : 'GOLD'), cx, cy - 0.05, 1.55, FUTC, p.id === 'island0' ? C.red : C.navy, a); for (const s of [-1, 1]) { g.fillStyle = C.mari; star4(g, cx + s * 5.2 * Math.cos(a), cy + s * 5.2 * Math.sin(a) , 0.75, 0); g.fill(); } }
      g.restore();
      const inner = p.poly.map(q => [cx + (q[0] - cx) * 0.9, cy + (q[1] - cy) * 0.86]); poly(g, inner); g.lineWidth = 0.16; g.strokeStyle = C.cream; g.stroke(); poly(g, inner); key(g, 0.07);
    }
    for (const b of layout.bumpers) {
      circle(g, b.x, b.y, 4.2); g.fillStyle = C.cream; g.fill();
      for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; g.fillStyle = C.red; g.beginPath(); g.moveTo(b.x + 1.5 * Math.cos(a - 0.1), b.y + 1.5 * Math.sin(a - 0.1)); g.lineTo(b.x + 4.2 * Math.cos(a - 0.17), b.y + 4.2 * Math.sin(a - 0.17)); g.lineTo(b.x + 4.2 * Math.cos(a + 0.17), b.y + 4.2 * Math.sin(a + 0.17)); g.lineTo(b.x + 1.5 * Math.cos(a + 0.1), b.y + 1.5 * Math.sin(a + 0.1)); g.closePath(); g.fill(); }
      circle(g, b.x, b.y, 1.5); g.fillStyle = C.mari; g.fill(); key(g, 0.1); g.fillStyle = C.navy; star4(g, b.x, b.y, 1.1, 0); g.fill();
      arcText(g, 'POP · 50 · POP · 50 ·', b.x, b.y, 2.45, Math.PI * 2, 0.33, 0.52, FUT, C.cream);
    }
    // apron: cream enamel, navy stripe, two instruction cards
    g.fillStyle = C.cream; g.fillRect(-24, -4, 48, 6.4); g.fillStyle = C.navy; g.fillRect(-24, 1.5, 48, 0.5); g.fillStyle = C.red; g.fillRect(-24, 1.05, 48, 0.2);
    for (const s of [-1, 1]) { g.fillStyle = C.white; g.fillRect(s * 11 - 6, -3.2, 12, 3.6); g.lineWidth = 0.12; g.strokeStyle = C.red; g.strokeRect(s * 11 - 5.7, -2.95, 11.4, 3.1); text(g, s < 0 ? 'LIGHTSHIP MARIGOLD' : 'THREE CREDITS', s * 11, -0.45, 0.62, FUTC, C.navy); const lines = s < 0 ? ['Knock down each bank of targets', 'to light L-I-G-H-T-S-H-I-P.', 'The last lamp opens the special.'] : ['Keep clear of the table ball.', 'Pop bumpers return your shot.', 'A banked shot scores double.']; lines.forEach((t, i) => text(g, t, s * 11, -1.25 - i * 0.62, 0.42, FUT, C.black)); }
    text(g, 'MARIGOLD', 0, -1.1, 1.3, FUTC, C.red); text(g, 'Lightship', 0, 0.35, 0.9, BOD, C.navy);
    res.plastics = c.toDataURL('image/jpeg', 0.93);
  }
  // ================= backglass (x -25..25, z 8..52) =================
  {
    const c = mk(2048, 1792), g = c.getContext('2d'); const k = 2048 / 50; g.setTransform(k, 0, 0, -k, 25 * k, 52 * k);
    const sky = g.createLinearGradient(0, 52, 0, 20); sky.addColorStop(0, '#0b1830'); sky.addColorStop(0.7, '#1b4a6e'); sky.addColorStop(1, '#2c8a88'); g.fillStyle = sky; g.fillRect(-25, 8, 50, 44);
    // beacon rays
    const bx = 3.5, bz = 37.5;
    for (let i = 0; i < 16; i++) { const a0 = i * Math.PI / 8 + 0.1, a1 = a0 + Math.PI / 16; g.fillStyle = i % 2 ? 'rgba(242,229,194,0.9)' : 'rgba(240,163,28,0.95)'; g.beginPath(); g.moveTo(bx, bz); g.lineTo(bx + 70 * Math.cos(a0), bz + 70 * Math.sin(a0)); g.lineTo(bx + 70 * Math.cos(a1), bz + 70 * Math.sin(a1)); g.closePath(); g.fill(); }
    for (let i = 0; i < 70; i++) { g.fillStyle = C.cream; star4(g, -25 + rnd() * 50, 30 + rnd() * 22, 0.25 + rnd() * 0.6, rnd()); g.fill(); }
    // sea
    for (let r = 0; r < 7; r++) { const z = 22.5 - r * 2.3; g.fillStyle = [C.navy, C.teal, '#1f5f78'][r % 3]; g.beginPath(); g.moveTo(-26, z - 4); for (let x = -26; x <= 26; x += 3.2) g.arc(x + (r % 2) * 1.6 + 1.6, z, 1.6, Math.PI, 0, true); g.lineTo(26, z - 4); g.closePath(); g.fill(); key(g, 0.1); }
    // the ship
    poly(g, [[-11, 27.2], [15.5, 27.2], [13, 21.2], [-8.5, 21.2]]); g.fillStyle = C.red; g.fill(); key(g, 0.16);
    g.fillStyle = C.cream; g.fillRect(-10.2, 25.4, 24.9, 0.6); text(g, 'MARIGOLD', 2.4, 23.5, 2.3, FUTC, C.cream);
    g.fillStyle = C.cream; g.fillRect(-3, 27.2, 9, 2.6); poly(g, [[-3, 27.2], [6, 27.2], [6, 29.8], [-3, 29.8]]); key(g, 0.12);
    for (let i = 0; i < 4; i++) { circle(g, -1.6 + i * 2.1, 28.5, 0.55); g.fillStyle = C.mari; g.fill(); key(g, 0.08); }
    g.fillStyle = C.black; g.fillRect(bx - 0.25, 29.8, 0.5, 6.4); g.fillRect(-7.6, 27.2, 0.3, 7); g.fillRect(11.6, 27.2, 0.3, 5.5);
    g.strokeStyle = C.black; g.lineWidth = 0.1; g.beginPath(); g.moveTo(-7.5, 34.2); g.lineTo(bx, 36.2); g.lineTo(11.7, 32.7); g.stroke();
    circle(g, bx, bz, 2.1); g.fillStyle = '#fff6d8'; g.fill(); key(g, 0.16); circle(g, bx, bz, 1.2); g.fillStyle = C.mari; g.fill();
    // lettering
    for (const [dx, dz, col] of [[0.28, -0.28, C.red], [0, 0, C.cream]]) { g.save(); g.translate(dx, dz); arcText(g, 'LIGHTSHIP', 0, 12, 34.5, Math.PI * 0.69, Math.PI * 0.31, 6.6, FUTC, col); g.restore(); }
    // score panel with five reel windows
    g.fillStyle = C.cream; g.fillRect(-11, 10.2, 22, 6.6); g.lineWidth = 0.2; g.strokeStyle = C.red; g.strokeRect(-10.6, 10.6, 21.2, 5.8); g.strokeStyle = C.black; g.lineWidth = 0.08; g.strokeRect(-11, 10.2, 22, 6.6);
    for (let i = 0; i < 5; i++) { g.fillStyle = '#060504'; g.fillRect(-8.1 + i * 3.3, 11.6, 3.0, 3.9); }
    text(g, 'SCORE', -9.45, 13.5, 0.62, FUT, C.navy, Math.PI / 2); text(g, 'Marigold', -17, 12.6, 3.2, BOD, C.cream, 0.06); text(g, 'A game of skill', 17, 12.4, 1.15, BOD, C.cream);
    res.backglass = c.toDataURL('image/jpeg', 0.93);
  }
  // ================= small sheets =================
  { // reel digits 0-9 (vertical strip), cream numerals on black drum
    const c = mk(128, 1280), g = c.getContext('2d'); g.fillStyle = '#0d0c0a'; g.fillRect(0, 0, 128, 1280); g.fillStyle = '#efe6c8'; g.font = '112px "Rockwell", serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 0; i < 10; i++) { g.fillText(String(i), 64, i * 128 + 68); g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(0, i * 128, 128, 2); g.fillStyle = '#efe6c8'; }
    res.reel = c.toDataURL('image/png');
  }
  { // drop target faces: nine letters in a row, each 128x128
    const c = mk(4608, 512), g = c.getContext('2d'); g.scale(4, 4);
    for (let i = 0; i < 9; i++) { const col = [C.mari, C.red, '#2fa56b'][Math.floor(i / 3)]; g.fillStyle = C.cream; g.fillRect(i * 128, 0, 128, 128); g.fillStyle = col; g.beginPath(); g.arc(i * 128 + 64, 60, 44, 0, 7); g.fill(); g.lineWidth = 4; g.strokeStyle = C.black; g.stroke(); g.beginPath(); g.arc(i * 128 + 64, 60, 36, 0, 7); g.lineWidth = 1.5; g.strokeStyle = C.cream; g.stroke(); g.fillStyle = C.black; g.font = '62px "Futura-CondensedExtraBold","Futura",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(layout.word[i], i * 128 + 64, 64); g.fillStyle = col; g.fillRect(i * 128 + 14, 114, 100, 5); }
    res.letters = c.toDataURL('image/png');
  }
  return res;
}

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
const res = await page.evaluate(`(${draw.toString()})(${JSON.stringify(layout)})`);
for (const [k, v] of Object.entries(res)) { const ext = v.startsWith('data:image/jpeg') ? 'jpg' : 'png'; fs.writeFileSync(out + k + '.' + ext, Buffer.from(v.split(',')[1], 'base64')); console.log(k + '.' + ext, Math.round(v.length * 0.75 / 1024) + ' KB'); }
await browser.close();
