// Deterministic game simulation for "Lightship Marigold". No rendering, no audio: emits events.
// Table frame, cm: x right, y up the table, z up. The table slopes down toward y = 0.
export const EYE = 2.2, PR = 1.1, BR = 1.35, SR = 0.3;
const GZ = -70, GY = -8, BIG_GY = -14, WALK = 13.5;
const REST = [0.35, 0.55, 0.84, 0.42]; // wood, steel, rubber, plastic
export function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

export class Sim {
  constructor(L, seed = 1) { this.L = L; this.seed = seed; this.resetAll(); }

  resetAll(area = 0) {
    const L = this.L; this.rnd = mulberry(this.seed * 7919 + 13);
    this.t = 0; this.score = 0; this.shots = 0; this.won = false; this.wonT = 0; this.events = [];
    this.letters = new Array(9).fill(false);
    this.targets = L.targets.map(t => ({ ...t, up: true, z: 0 }));       // z: 0 up .. 1 down
    this.banks = [0, 1, 2].map(i => ({ done: false, timer: 0, limit: [0, 16, 11][i] }));
    this.balls = []; this.rings = [];
    this.bumpers = L.bumpers.map(b => ({ ...b, k: 0 }));
    this.slings = L.slings.map(s => ({ ...s, k: 0 }));
    this.spinners = L.spinners.map(s => ({ ...s, ang: 0, vel: 0 }));
    this.standups = L.standups.map(s => ({ ...s, w: 0 }));
    this.rollovers = L.rollovers.map(r => ({ ...r, lit: false, k: 0 }));
    this.gates = L.gates.map(g => ({ ...g, open: 0, swing: 0 }));
    this.tossers = L.tossers.map((t, i) => ({ ...t, area: t.a2 ? 1 : 2, yaw: -Math.PI / 2, cool: 2 + i * 0.9, stun: 0, arm: 0 }));
    this.flippers = L.flippers.map(f => ({ ...f, a: 0, ph: 0 }));
    this.launcher = { charge: 0, held: false, cool: 0, kick: 0 };
    this.player = { x: 0, y: 0, vx: 0, vy: 0, yaw: Math.PI / 2, pitch: 0, credits: 3, inv: 0, bob: 0, area: 0, hurt: 0, shove: 0 };
    this.big = { x: 9, y: 71, vx: 0, vy: 0, slow: 0, held: 0, away: 0 };
    for (let a = 0; a < area; a++) { this.banks[a].done = true; for (let i = 0; i < 3; i++) { this.letters[a * 3 + i] = true; const t = this.targets[a * 3 + i]; t.up = false; t.z = 1; } }
    this.dirty = true; this.placeAt(Math.min(area, 2));
  }
  placeAt(area) {
    const s = this.L.areas[area].start, p = this.player; p.x = s[0]; p.y = s[1]; p.yaw = s[2]; p.pitch = 0; p.vx = p.vy = 0; p.area = area; p.credits = 3; p.inv = 1.5;
    this.big.x = area === 2 ? 14 : 9; this.big.y = area === 2 ? 40 : 71; this.big.vx = this.big.vy = 0; this.big.held = 0;
    this.balls.length = 0; this.rings.length = 0;
  }
  restartArea() {
    const a = this.player.area, b = this.banks[a];
    if (!b.done) this.resetBank(a, true);
    this.placeAt(a); this.ev('restart', 0, 0, 1, a);
  }
  resetBank(a, quiet) {
    for (let i = 0; i < 3; i++) { this.targets[a * 3 + i].up = true; this.letters[a * 3 + i] = false; }
    this.banks[a].timer = 0; this.dirty = true; if (!quiet) this.ev('reset', this.targets[a * 3 + 1].x, this.targets[a * 3 + 1].y, 1, a);
  }
  ev(type, x, y, v = 1, n = 0) { this.events.push({ type, x, y, v, n }); }
  add(n, x, y) { this.score += n; this.ev('score', x, y, n); }

  rebuild() { // dynamic collision
    const d = this.dyn = [];
    for (const t of this.targets) if (t.up) d.push([t.x - t.w / 2 - 0.12, t.y, t.x + t.w / 2 + 0.12, t.y, 3, 4, t]);
    for (const g of this.gates) if (!this.banks[g.bank].done) d.push([g.a[0], g.a[1], g.b[0], g.b[1], 1, 1 | 16, g]);
    this.standups.forEach(s => d.push([s.x + Math.cos(s.ang) * 0.1, s.y - 0.9, s.x + Math.cos(s.ang) * 0.1, s.y + 0.9, 1, 8, s]));
    for (const s of this.spinners) d.push([s.x - s.w / 2, s.y, s.x + s.w / 2, s.y, 1, 1, s]);
    this.dirty = false;
  }

  // circle against static + dynamic geometry. who: 0 player, 1 small ball, 2 table ball
  collide(o, r, who, px, py) {
    const L = this.L; let hit = false;
    for (let pass = 0; pass < 2; pass++) {
      const list = pass ? this.dyn : L.segs;
      for (const s of list) {
        const fl = s[5];
        if (((fl & 1) && who !== 0) || ((fl & 32) && who === 1)) continue;
        if (who === 1 && (fl & 12) && o.z > (fl & 4 ? 3.0 : 2.5)) continue;
        const ax = s[0], ay = s[1], dx = s[2] - ax, dy = s[3] - ay, l2 = dx * dx + dy * dy;
        let u = ((o.x - ax) * dx + (o.y - ay) * dy) / l2; const uc = clamp(u, 0, 1);
        let cx = ax + dx * uc, cy = ay + dy * uc, nx = o.x - cx, ny = o.y - cy, d = Math.hypot(nx, ny);
        let pen = d < r;
        if (!pen && who && u > 0 && u < 1) { // crossed the line in one step?
          const il = 1 / Math.sqrt(l2), sx = -dy * il, sy = dx * il, d0 = (px - ax) * sx + (py - ay) * sy, d1 = (o.x - ax) * sx + (o.y - ay) * sy;
          if (d0 * d1 < 0) { pen = true; const sg = d0 > 0 ? 1 : -1; nx = sx * sg; ny = sy * sg; d = -Math.abs(d1); cx = o.x - nx * d; cy = o.y - ny * d; nx *= 1; ny *= 1; o.x = cx + nx * r; o.y = cy + ny * r; d = r; nx *= r; ny *= r; }
        }
        if (!pen) continue;
        if (d < 1e-5) { nx = -dy; ny = dx; d = Math.hypot(nx, ny); }
        nx /= d; ny /= d; o.x = cx + nx * r; o.y = cy + ny * r;
        const vn = o.vx * nx + o.vy * ny;
        if (vn < 0) { const e = who === 0 ? 0 : REST[s[4]] * (who === 2 ? 0.85 : 1); o.vx -= (1 + e) * vn * nx; o.vy -= (1 + e) * vn * ny; this.onHit(o, who, s, nx, ny, -vn); hit = true; }
      }
    }
    for (const c of L.circs) {
      let nx = o.x - c[0], ny = o.y - c[1]; const rr = r + c[2], d2 = nx * nx + ny * ny;
      if (d2 >= rr * rr) continue; const d = Math.sqrt(d2) || 1e-4; nx /= d; ny /= d; o.x = c[0] + nx * rr; o.y = c[1] + ny * rr;
      const vn = o.vx * nx + o.vy * ny;
      if (vn < 0) { const e = who === 0 ? 0 : REST[c[3]]; o.vx -= (1 + e) * vn * nx; o.vy -= (1 + e) * vn * ny; this.onHit(o, who, c, nx, ny, -vn, true); hit = true; }
    }
    return hit;
  }

  onHit(o, who, s, nx, ny, vn, circ) {
    const kind = circ ? s[3] : s[4], fl = circ ? 0 : s[5];
    if (circ && kind === 3) { // pop bumper
      const b = this.bumpers.find(b => b.x === s[0] && b.y === s[1]);
      if (b && b.k <= 0 && (who !== 1 || vn > 6)) {
        b.k = 0.3; this.ev('bumper', b.x, b.y, 1);
        if (who === 0) { o.vx += nx * 26; o.vy += ny * 26; this.player.shove = 0.35; }
        else if (who === 2) { o.vx = nx * 30 + o.vx * 0.3; o.vy = ny * 30 + o.vy * 0.3; }
        else { // fire the ball back at the player
          const p = this.player; let tx = p.x - o.x, ty = p.y - o.y; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
          let dx = nx * 0.55 + tx * 0.45, dy = ny * 0.55 + ty * 0.45; const dl = Math.hypot(dx, dy) || 1; const sp = 46 + Math.min(vn, 60) * 0.25;
          o.vx = dx / dl * sp; o.vy = dy / dl * sp; o.vz = 9; o.ret = true; o.bounces++; this.add(50, b.x, b.y);
        }
      }
      return;
    }
    if (fl & 2) { // slingshot face
      const sl = this.slings.find(q => q.fa[0] === s[0] && q.fa[1] === s[1]);
      if (sl && sl.k <= 0 && (who !== 1 || vn > 10)) { sl.k = 0.3; const kk = who === 0 ? 22 : who === 2 ? 26 : 34; o.vx += nx * kk; o.vy += ny * kk; if (who === 0) this.player.shove = 0.3; this.ev('sling', (s[0] + s[2]) / 2, (s[1] + s[3]) / 2, 1, sl.s); if (who === 1) { this.add(10, o.x, o.y); o.bounces++; } return; }
    }
    if (who === 1) {
      if (fl & 4) { const t = s[6]; if (vn > 5) this.dropTarget(t, o); else this.ev('tick', o.x, o.y, 0.3); return; }
      if (fl & 8) { const st = s[6]; if (vn > 5 && st.w <= 0.05) { st.w = 1; this.ev('standup', st.x, st.y, 1); this.add(100, st.x, st.y); } return; }
      o.bounces++;
      if (vn > 3) this.ev(kind === 2 ? 'rubber' : kind === 1 ? 'steel' : kind === 0 ? 'wood' : 'tick', o.x, o.y, clamp(vn / 60, 0.08, 1));
    } else if (who === 2) {
      if (vn > 4) this.ev(kind === 2 ? 'bigrubber' : 'bigknock', o.x, o.y, clamp(vn / 40, 0.1, 1), kind);
    }
  }

  dropTarget(t, ball) {
    if (!t.up) return;
    t.up = false; this.letters[t.n] = true; this.dirty = true;
    const bank = this.banks[t.bank], banked = ball && ball.bounces > 0;
    this.ev('drop', t.x, t.y, 1, t.n); this.add(banked ? 1000 : 500, t.x, t.y); if (banked) this.ev('bankshot', t.x, t.y, 1);
    if (bank.timer <= 0) bank.timer = bank.limit;
    if ([0, 1, 2].every(i => this.letters[t.bank * 3 + i])) { bank.done = true; bank.timer = 0; this.ev('bankdone', t.x, t.y, 1, t.bank); this.add(1000, t.x, t.y); }
  }

  fire() {
    const p = this.player, la = this.launcher; const c = la.charge; la.charge = 0; la.cool = 0.5; la.kick = 1; this.shots++;
    const cp = Math.cos(p.pitch), fx = Math.cos(p.yaw) * cp, fy = Math.sin(p.yaw) * cp, fz = Math.sin(p.pitch), rx = Math.sin(p.yaw), ry = -Math.cos(p.yaw);
    const mx = p.x + fx * 1.3 + rx * 0.5, my = p.y + fy * 1.3 + ry * 0.5, mz = EYE - 0.45 + fz * 1.3;
    const sp = 52 + 66 * c;
    let ax = p.x + fx * 26 - mx, ay = p.y + fy * 26 - my, az = EYE + fz * 26 + 0.9 - mz; const al = Math.hypot(ax, ay, az);
    this.balls.push({ x: mx, y: my, z: mz, vx: ax / al * sp + p.vx * 0.5, vy: ay / al * sp + p.vy * 0.5, vz: az / al * sp, bounces: 0, life: 0, air: true, ret: false, roll: 0 });
    if (this.balls.length > 48) this.balls.shift();
    this.ev('fire', mx, my, 0.4 + c * 0.6);
  }

  step(dt, inp) {
    if (this.dirty) this.rebuild();
    const p = this.player, L = this.L, big = this.big; this.t += dt;
    if (this.won) { this.wonT += dt; p.vx *= 0.9; p.vy *= 0.9; }
    // ---- player
    const cy = Math.cos(p.yaw), sy = Math.sin(p.yaw);
    let wx = 0, wy = 0;
    if (!this.won) { wx = (cy * inp.f + sy * inp.s) * WALK; wy = (sy * inp.f - cy * inp.s) * WALK; const wl = Math.hypot(inp.f, inp.s); if (wl > 1) { wx /= wl; wy /= wl; } }
    const acc = Math.min(1, dt * (p.shove > 0 ? 3 : 11)); p.vx += (wx - p.vx) * acc; p.vy += (wy - p.vy) * acc; p.shove = Math.max(0, p.shove - dt);
    const ppx = p.x, ppy = p.y; p.x += p.vx * dt; p.y += p.vy * dt;
    for (const t of this.tossers) { const dx = p.x - t.x, dy = p.y - t.y, d = Math.hypot(dx, dy); if (d < PR + 0.9) { p.x = t.x + dx / d * (PR + 0.9); p.y = t.y + dy / d * (PR + 0.9); } }
    this.collide(p, PR, 0, ppx, ppy); this.collide(p, PR, 0, ppx, ppy);
    p.x = clamp(p.x, -L.W + PR, L.W - PR); p.y = clamp(p.y, 2.5 + PR, 86);
    const spd = Math.hypot(p.vx, p.vy); p.bob += spd * dt; p.inv = Math.max(0, p.inv - dt); p.hurt = Math.max(0, p.hurt - dt);
    p.area = p.y < 33 ? 0 : p.y < 59 ? 1 : 2;
    // ---- launcher
    const la = this.launcher; la.cool = Math.max(0, la.cool - dt); la.kick = Math.max(0, la.kick - dt * 5);
    if (!this.won) {
      if (inp.fire && la.cool <= 0) { if (!la.held) { la.held = true; this.ev('pull', p.x, p.y, 1); } la.charge = Math.min(1, la.charge + dt / 0.6); }
      else if (la.held) { la.held = false; if (la.cool <= 0) this.fire(); }
    }
    // ---- small balls
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i]; b.life += dt;
      const sp = Math.hypot(b.vx, b.vy), n = Math.min(5, Math.max(1, Math.ceil(sp * dt / 0.22))), h = dt / n; let dead = false;
      for (let k = 0; k < n && !dead; k++) {
        b.vy += GY * h; if (b.z > SR || b.vz > 0) b.vz += GZ * h;
        const px = b.x, py = b.y; b.x += b.vx * h; b.y += b.vy * h; b.z += b.vz * h;
        if (b.z < SR) { b.z = SR; if (b.vz < -14) { this.ev('land', b.x, b.y, clamp(-b.vz / 60, 0.1, 1)); b.vz = -b.vz * 0.32; } else b.vz = 0; b.air = false; }
        if (b.z > L.GLASS_Z - SR) { b.z = L.GLASS_Z - SR; b.vz = -Math.abs(b.vz) * 0.5; this.ev('glass', b.x, b.y, 0.6); }
        if (b.z <= SR + 0.01) { const f = 1 - 0.22 * h; b.vx *= f; b.vy *= f; }
        this.collide(b, SR, 1, px, py);
        // the table ball
        let dx = b.x - big.x, dy = b.y - big.y; const d = Math.hypot(dx, dy);
        if (d < BR + SR && b.z < 2.8) { dx /= d; dy /= d; b.x = big.x + dx * (BR + SR); b.y = big.y + dy * (BR + SR); const rv = (b.vx - big.vx) * dx + (b.vy - big.vy) * dy; if (rv < 0) { b.vx -= 1.7 * rv * dx; b.vy -= 1.7 * rv * dy; big.vx += rv * dx * 0.09; big.vy += rv * dy * 0.09; b.bounces++; this.ev('ping', b.x, b.y, clamp(-rv / 70, 0.15, 1)); this.add(5, b.x, b.y); } }
        for (const t of this.tossers) { const ex = b.x - t.x, ey = b.y - t.y, ed = Math.hypot(ex, ey); if (ed < 0.95 + SR && b.z < 2.6) { const vn = (b.vx * ex + b.vy * ey) / ed; b.x = t.x + ex / ed * (0.95 + SR); b.y = t.y + ey / ed * (0.95 + SR); if (vn < 0) { b.vx -= 1.5 * vn * ex / ed; b.vy -= 1.5 * vn * ey / ed; b.bounces++; if (t.stun <= 0 && vn < -6) { t.stun = 6; this.ev('stun', t.x, t.y, 1); this.add(200, t.x, t.y); } } } }
        for (const s of this.spinners) if (b.z < 2.3 && Math.abs(b.x - s.x) < s.w / 2 && (py - s.y) * (b.y - s.y) < 0) { s.vel += clamp(b.vy * 0.5, -40, 40); }
        for (const r of this.rollovers) if (r.k <= 0 && b.z < 0.6 && Math.abs(b.x - r.x) < 0.5 && Math.abs(b.y - r.y) < 1.1) { r.k = 0.5; r.lit = true; this.ev('rollover', r.x, r.y, 0.7); this.add(50, r.x, r.y); }
        for (const hh of L.holes) if (b.z <= SR + 0.01 && Math.hypot(b.x - hh.x, b.y - hh.y) < hh.r - 0.1) { this.ev('plunk', b.x, b.y, 0.8); dead = true; }
        if (b.ret && b.z < 2.7) { const ex = b.x - p.x, ey = b.y - p.y; if (ex * ex + ey * ey < 1.3 * 1.3) { p.vx += b.vx * 0.22; p.vy += b.vy * 0.22; p.shove = 0.25; p.hurt = Math.max(p.hurt, 0.35); this.ev('stagger', p.x, p.y, 0.7); dead = true; } }
        if (b.y < 3.9 && Math.abs(b.x) < 2.7) { this.ev('drain', b.x, b.y, 0.5); dead = true; }
      }
      const s2 = Math.hypot(b.vx, b.vy); b.roll = b.z <= SR + 0.01 ? s2 : 0;
      if (dead || b.life > 40 || (s2 < 0.6 && b.life > 14)) this.balls.splice(i, 1);
    }
    // ---- the table ball
    if (big.held > 0) { big.held -= dt; if (big.held <= 0) { big.vx = (this.rnd() - 0.5) * 16; big.vy = -26; big.y -= 2.4; this.ev('eject', big.x, big.y, 1); } }
    else {
      const n = 2, h = dt / n;
      for (let k = 0; k < n; k++) {
        big.vy += BIG_GY * h; const f = 1 - 0.1 * h; big.vx *= f; big.vy *= f;
        const px = big.x, py = big.y; big.x += big.vx * h; big.y += big.vy * h;
        this.collide(big, BR, 2, px, py);
        for (const s of this.spinners) if (Math.abs(big.x - s.x) < s.w / 2 + 0.6 && (py - s.y) * (big.y - s.y) < 0) s.vel += clamp(big.vy * 0.9, -50, 50);
        for (const g of this.gates) if (g.kind === 'orbit' && Math.abs(big.x - (g.a[0] + g.b[0]) / 2) < 2.4 && (py - g.a[1]) * (big.y - g.a[1]) < 0) { g.swing = big.vy > 0 ? 1 : -1; this.ev('gate', big.x, big.y, 0.6); }
        for (const t of this.targets) if (t.up && Math.abs(big.x - t.x) < t.w / 2 + BR && Math.abs(big.y - t.y) < BR + 0.2) { const sg = py < t.y ? -1 : 1; big.y = t.y + sg * (BR + 0.2); if (big.vy * sg < 0) { this.ev('bigknock', big.x, big.y, clamp(Math.abs(big.vy) / 40, 0.1, 1), 3); big.vy = -big.vy * 0.45; } }
        for (const t of this.tossers) { const ex = big.x - t.x, ey = big.y - t.y, ed = Math.hypot(ex, ey); if (ed < 0.9 + BR) { big.x = t.x + ex / ed * (0.9 + BR); big.y = t.y + ey / ed * (0.9 + BR); const vn = (big.vx * ex + big.vy * ey) / ed; if (vn < 0) { big.vx -= 1.5 * vn * ex / ed; big.vy -= 1.5 * vn * ey / ed; this.ev('bigknock', big.x, big.y, 0.5, 1); } } }
      }
      const g2 = this.gates.find(g => g.kind === 'special');
      if (!this.banks[2].done && big.y > g2.a[1] - BR && Math.abs(big.x) < 5.1 && big.y < 86) { big.y = g2.a[1] - BR; if (big.vy > 0) big.vy = -big.vy * 0.5; }
      for (const hh of L.holes) if (Math.hypot(big.x - hh.x, big.y - hh.y) < 0.9) { big.x = hh.x; big.y = hh.y; big.vx = big.vy = 0; big.held = 1.4; this.ev('saucer', big.x, big.y, 1); }
      // the unseen player's flippers
      if (big.y < 9.4 && big.vy <= 2 && Math.abs(big.x) < 9.5) {
        const side = big.x < 0 ? 0 : 1; const fl = this.flippers.find(f => (f.x < 0) === (side === 0)); fl.ph = 0.0001;
        const a = p.area, r = this.rnd; let tx, ty, extra;
        if (a === 0) { if (r() < 0.6 && this.t > 6) { tx = p.x + (r() - 0.5) * 12; ty = p.y + 2 + r() * 6; extra = 10 + r() * 14; } else { tx = (big.x < 0 ? 1 : -1) * 18.8; ty = 29.5; extra = 14 + r() * 26; } }
        else { if (r() < 0.55) { tx = (r() - 0.5) * 4.5; ty = 34; } else { tx = (big.x < 0 ? 1 : -1) * 18.8; ty = 29.5; } extra = (a === 1 ? 14 : 38) + r() * 16; }
        big.y = Math.max(big.y, 7.4); let dx = tx - big.x, dy = ty - big.y; const dl = Math.hypot(dx, dy); const sp = Math.sqrt(2 * -BIG_GY * (dl + extra)) * 1.04;
        big.vx = dx / dl * sp; big.vy = dy / dl * sp; this.ev('flipper', big.x, big.y, 1, side);
      }
      big.x = clamp(big.x, -L.W + BR, L.W - BR); big.y = clamp(big.y, 4, 86.5);
      const bs = Math.hypot(big.vx, big.vy);
      big.slow = bs < 2.2 ? big.slow + dt : 0;
      if (big.slow > 1.1) { big.slow = 0; big.vx += (this.rnd() - 0.5) * 30; big.vy += -4 - this.rnd() * 8; this.ev('nudge', big.x, big.y, 1); }
      // hits the player
      const dx = p.x - big.x, dy = p.y - big.y, d = Math.hypot(dx, dy);
      if (d < BR + PR * 0.9 && !this.won) {
        const nx = dx / d, ny = dy / d, rv = (big.vx - p.vx) * nx + (big.vy - p.vy) * ny;
        p.x = big.x + nx * (BR + PR * 0.9);
        p.y = big.y + ny * (BR + PR * 0.9);
        if (rv > 5 && p.inv <= 0) {
          p.credits--; p.inv = 2.4; p.hurt = 1; p.vx += nx * 26; p.vy += ny * 26; p.shove = 0.5; big.vx -= nx * rv * 0.5; big.vy -= ny * rv * 0.5;
          this.ev('hit', p.x, p.y, 1, p.credits);
          if (p.credits <= 0) this.restartArea();
        }
      }
    }
    // ---- machines
    for (const f of this.flippers) { if (f.ph > 0) { f.ph += dt; f.a = f.ph < 0.16 ? f.ph / 0.16 : f.ph < 0.42 ? 1 : Math.max(0, 1 - (f.ph - 0.42) / 0.5); if (f.ph > 0.92) { f.ph = 0; f.a = 0; } } }
    for (const b of this.bumpers) b.k = Math.max(0, b.k - dt);
    for (const s of this.slings) s.k = Math.max(0, s.k - dt);
    for (const s of this.standups) s.w = Math.max(0, s.w - dt * 1.6);
    for (const r of this.rollovers) { r.k = Math.max(0, r.k - dt); if (r.k <= 0 && Math.abs(p.x - r.x) < 0.9 && Math.abs(p.y - r.y) < 1.2) { r.k = 0.8; r.lit = true; this.ev('rollover', r.x, r.y, 0.7); this.add(50, r.x, r.y); } }
    for (const s of this.spinners) { const pa = s.ang; s.ang += s.vel * dt; s.vel *= 1 - 0.9 * dt; if (Math.abs(s.vel) < 1.2) { s.vel = 0; const tg = Math.round(s.ang / Math.PI) * Math.PI; s.ang += (tg - s.ang) * Math.min(1, dt * 5); } if (Math.floor(pa / Math.PI) !== Math.floor(s.ang / Math.PI) && s.vel !== 0) { this.ev('spin', s.x, s.y, 0.5); this.add(10, s.x, s.y); } }
    for (const t of this.targets) t.z = clamp(t.z + (t.up ? -dt * 7 : dt * 9), 0, 1);
    for (const g of this.gates) { g.open = clamp(g.open + (this.banks[g.bank].done ? dt * 2 : -dt * 2), 0, 1); g.swing *= 1 - 3 * dt; }
    this.banks.forEach((b, i) => { if (!b.done && b.timer > 0) { const pt = b.timer; b.timer -= dt; if (b.timer <= 3 && Math.floor(pt * 2) !== Math.floor(b.timer * 2)) this.ev('warn', this.targets[i * 3 + 1].x, this.targets[i * 3 + 1].y, 0.5); if (b.timer <= 0) this.resetBank(i); } });
    // ---- ring tossers: turn to face the player and lob rubber rings
    for (const t of this.tossers) {
      t.arm = Math.max(0, t.arm - dt * 3);
      if (t.stun > 0) { t.stun -= dt; t.yaw += dt * 9 * Math.min(1, t.stun); continue; }
      const dx = p.x - t.x, dy = p.y - t.y, d = Math.hypot(dx, dy);
      if (p.area !== t.area || d > 30 || this.won) continue;
      t.yaw += clamp(wrap(Math.atan2(dy, dx) - t.yaw), -2.4 * dt, 2.4 * dt);
      t.cool -= dt;
      if (t.cool <= 0 && Math.abs(wrap(Math.atan2(dy, dx) - t.yaw)) < 0.15 && d > 3) {
        t.cool = 3.1 + this.rnd() * 1.2; t.arm = 1; const tt = d / 17; // flight time
        this.rings.push({ x: t.x + Math.cos(t.yaw) * 0.9, y: t.y + Math.sin(t.yaw) * 0.9, z: 2.3, vx: Math.cos(t.yaw) * 17, vy: Math.sin(t.yaw) * 17, vz: (1.2 - 2.3) / tt + 0.5 * 26 * tt, sp: 0, life: 0 });
        this.ev('toss', t.x, t.y, 0.8);
      }
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]; r.life += dt; r.vz -= 26 * dt; r.x += r.vx * dt; r.y += r.vy * dt; r.z += r.vz * dt; r.sp += dt * 9;
      if (r.z < 0.25) { r.z = 0.25; if (r.vz < -3) this.ev('ringland', r.x, r.y, 0.4); r.vz = -r.vz * 0.35; r.vx *= 0.75; r.vy *= 0.75; r.dead = true; }
      const dx = p.x - r.x, dy = p.y - r.y;
      if (!r.dead && dx * dx + dy * dy < 1.5 * 1.5 && r.z < 3) { p.vx += r.vx * 0.9; p.vy += r.vy * 0.9; p.shove = 0.45; p.hurt = Math.max(p.hurt, 0.4); this.ev('ringhit', p.x, p.y, 1); this.rings.splice(i, 1); continue; }
      if (r.life > 5 || Math.abs(r.x) > 21 || r.y > 87 || r.y < 3) this.rings.splice(i, 1);
    }
    // ---- the special
    if (this.banks[2].done && !this.won) { const hh = L.holes[0]; if (Math.hypot(p.x - hh.x, p.y - hh.y) < 1.9) { this.won = true; this.add(5000, hh.x, hh.y); this.ev('win', hh.x, hh.y, 1); } }
  }
}

// ---------------------------------------------------------------- the bot (attract mode, ?auto=1)
export function makeBot(sim) {
  const R = [[[0, 17]], [[0, 36.2], [13.2, 41.5], [13.2, 46.5], [8, 49]], [[0, 62.2], [0, 70.2]], [[0, 76.4], [0, 82.6]]];
  const st = { hold: 0, wait: 1.4, i: 0, a: -1, lx: 0, ly: 0, sx: 0, sy: 0, stt: 0 };
  return function bot(dt) {
    const p = sim.player, inp = { f: 0, s: 0, fire: false }; if (sim.won) return inp;
    let a = [0, 1, 2].find(i => !sim.banks[i].done); if (a === undefined) a = 3;
    if (a !== st.a || Math.hypot(p.x - st.lx, p.y - st.ly) > 4) { st.a = a; st.i = 0; st.hold = 0; } st.lx = p.x; st.ly = p.y;
    const route = R[a]; let wp = route[st.i];
    if (st.i < route.length - 1 && Math.hypot(wp[0] - p.x, wp[1] - p.y) < 0.8) wp = route[++st.i];
    st.stt += dt; if (st.stt > 1) { if (Math.hypot(p.x - st.sx, p.y - st.sy) < 0.4 && Math.hypot(wp[0] - p.x, wp[1] - p.y) > 1) { st.i = 0; wp = route[0]; } st.stt = 0; st.sx = p.x; st.sy = p.y; }
    const last = st.i === route.length - 1, dx = wp[0] - p.x, dy = wp[1] - p.y, d = Math.hypot(dx, dy);
    const aim = a < 3 && last && d < 1.5 ? sim.targets.find(t => t.bank === a && t.up) : null;
    // dodge the table ball
    const b = sim.big, bx = b.x - p.x, by = b.y - p.y, bd = Math.hypot(bx, by), closing = -(b.vx * bx + b.vy * by) / (bd || 1), danger = bd < 9 && closing > 4;
    let mvx = 0, mvy = 0;
    if (d > 0.35) { mvx = dx / d; mvy = dy / d; }
    if (danger) { const bl = Math.hypot(b.vx, b.vy) || 1; let sx = -b.vy / bl, sy = b.vx / bl; if (sx * -bx + sy * -by < 0) { sx = -sx; sy = -sy; } mvx = sx; mvy = sy; st.wait = 0.25; }
    let wantYaw = p.yaw, wantPitch = 0;
    if (aim) {
      const ax = aim.x - p.x, ay = aim.y - 0.3 - p.y, ad = Math.hypot(ax, ay); wantYaw = Math.atan2(ay, ax);
      const sp = 52 + 66 * 0.45, tt = ad / sp; wantPitch = clamp(Math.atan2(1.2 + 0.5 * 70 * tt * tt * 0.55 - EYE, ad), -0.3, 0.35);
      const err = Math.abs(wrap(wantYaw - p.yaw)) + Math.abs(wantPitch - p.pitch) * 0.5;
      st.wait -= dt;
      if (st.hold > 0) { st.hold -= dt; inp.fire = st.hold > 0; if (!inp.fire) st.wait = 1.25; }
      else if (err < 0.03 && st.wait <= 0 && sim.launcher.cool <= 0) { st.hold = 0.27; inp.fire = true; }
    } else { if (d > 0.35) wantYaw = Math.atan2(dy, dx); st.hold = 0; }
    p.yaw += clamp(wrap(wantYaw - p.yaw) * 6 * dt, -2.2 * dt, 2.2 * dt); p.pitch += clamp(wantPitch - p.pitch, -1.5 * dt, 1.5 * dt);
    const cy = Math.cos(p.yaw), sy = Math.sin(p.yaw);
    const k = danger ? 1 : 0.72; inp.f = (mvx * cy + mvy * sy) * k; inp.s = (mvx * sy - mvy * cy) * k;
    return inp;
  };
}
