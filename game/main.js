// Lightship Marigold: a toy first-person shooter played on the inside of a 1960s pinball table.
import * as THREE from 'three';
import { GLTFLoader } from './lib/jsm/loaders/GLTFLoader.js';
import { Sim, makeBot, EYE, BR, SR } from './sim.js';
import { bakedMaterial, floorMaterial, backglassMaterial, ballMaterial, glassMaterial, glintMaterial, Lens } from './shaders.js';
import { Sound } from './audio.js';

const Q = new URLSearchParams(location.search);
const SEED = +(Q.get('seed') || 1), AUTO = Q.get('auto') === '1', FREEZE = Q.has('t') ? +Q.get('t') : null, STATE = Q.get('state'), VIEW = Q.get('view');
const $ = id => document.getElementById(id);
const T = (x, y, z = 0) => new THREE.Vector3(x, z, -y);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v, lerp = (a, b, t) => a + (b - a) * t;
const LAMPC = [[1.0, 0.5, 0.1], [1.0, 0.1, 0.05], [0.12, 1.0, 0.32], [0.16, 0.42, 1.0], [1.0, 0.82, 0.55]];

const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace; renderer.toneMapping = THREE.NoToneMapping; renderer.autoClear = true;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.08, 1500); scene.add(camera);
const lens = new Lens(renderer);
const sound = new Sound();
const shared = { uW: { value: new THREE.Vector3(0, 0, 0) }, uEnvS: { value: 0.02 }, uLitAll: { value: 0 }, uTime: { value: 0 } };

// ---------------------------------------------------------------- loading
const tl = new THREE.TextureLoader();
async function tex(url, { srgb = false, flip = false, mip = true, rep = false } = {}) {
  const t = await tl.loadAsync(url); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.flipY = flip; t.anisotropy = 8;
  if (!mip) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; } if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
const [L, gltf, tArt, tWear, tFd, tFl, tAa, tAd, tAl, tAe, tBa, tBd, tBl, tBg, tReel, tLet, tRoom] = await Promise.all([
  fetch('game/layout.json').then(r => r.json()), new GLTFLoader().loadAsync('game/table.glb'),
  tex('game/tex/pf_art.jpg', { srgb: true }), tex('game/tex/wear.png'), tex('game/bake/F_dim.png'), tex('game/bake/F_lit.png'),
  tex('game/bake/A_alb.png'), tex('game/bake/A_dim.png'), tex('game/bake/A_lit.png'), tex('game/bake/A_emit.png'),
  tex('game/bake/B_alb.png'), tex('game/bake/B_dim.png'), tex('game/bake/B_lit.png'),
  tex('game/tex/backglass.jpg', { srgb: true }), tex('game/tex/reel.png', { srgb: true, flip: true }), tex('game/tex/letters.png', { srgb: true, flip: true }), tex('game/tex/room.jpg', { srgb: true, flip: true }),
]);

// lamp data: row 0 = x, y, r, level; row 1 = colour, shape
const lampData = new Float32Array(64 * 2 * 4);
const tLamp = new THREE.DataTexture(lampData, 64, 2, THREE.RGBAFormat, THREE.FloatType); tLamp.minFilter = tLamp.magFilter = THREE.NearestFilter;
L.lamps.forEach((l, i) => { lampData.set([l.x, l.y, l.r, 0], i * 4); lampData.set([...LAMPC[l.col], l.shape], 256 + i * 4); });
const idMap = new Uint8Array(256 * 512);
for (let j = 0; j < 512; j++) for (let i = 0; i < 256; i++) { const x = (i + 0.5) / 256 * 48 - 24, y = (j + 0.5) / 512 * 96 - 4; let best = 0, bd = 1e9; for (const l of L.lamps) { const d = Math.hypot(x - l.x, y - l.y) - l.r; if (d < 3.6 && d < bd) { bd = d; best = l.id + 1; } } idMap[j * 256 + i] = best; }
const tLampId = new THREE.DataTexture(idMap, 256, 512, THREE.RedFormat, THREE.UnsignedByteType); tLampId.minFilter = tLampId.magFilter = THREE.NearestFilter; tLampId.needsUpdate = true;
const lampLevel = new Float32Array(L.lamps.length);

// ---------------------------------------------------------------- materials
const matFloor = floorMaterial({ art: tArt, wear: tWear, fDim: tFd, fLit: tFl, lampId: tLampId, lamp: tLamp }, shared);
const matA = bakedMaterial(tAa, tAd, tAl, tAe, shared), matB = bakedMaterial(tBa, tBd, tBl, null, shared);
const std = (color, roughness, metalness = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
const mSteel = std(0xb8b8b4, 0.3, 1), mChrome = std(0xf2f2f2, 0.06, 1), mBrass = std(0xb39356, 0.36, 1);
const mCream = std(0xe6d8ae, 0.32), mRed = std(0xb5261a, 0.45), mRubber = std(0xd8d4c4, 0.75), mBlack = std(0x18140f, 0.5), mYellow = std(0xf0a81c, 0.3);

let floorMesh, bgMesh;
gltf.scene.traverse(o => {
  if (!o.isMesh) return;
  const n = o.name.split('_')[0] === 'M' ? o.name : (o.parent && o.parent !== gltf.scene ? o.parent.name : o.name);
  if (n.startsWith('M_steel')) o.material = mSteel; else if (n.startsWith('M_chrome')) o.material = mChrome; else if (n.startsWith('M_brass')) o.material = mBrass;
  else if (n === 'F') { o.material = matFloor; floorMesh = o; }
  else if (n === 'A') o.material = matA; else if (n === 'B') o.material = matB;
  else if (n === 'backglass') { o.material = backglassMaterial(tBg, shared); bgMesh = o; }
});
scene.add(gltf.scene);

// the room beyond the glass
const tRoomB = (() => { const c = document.createElement('canvas'); c.width = 1024; c.height = 512; const g = c.getContext('2d'); g.filter = 'blur(7px)'; g.drawImage(tRoom.image, 0, 0, 1024, 512); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
const room = new THREE.Mesh(new THREE.SphereGeometry(700, 48, 24), new THREE.MeshBasicMaterial({ map: tRoomB, side: THREE.BackSide, color: 0x3a3a3a }));
room.rotation.set(-0.113, Math.PI, 0); room.position.copy(T(0, 44, 8)); scene.add(room);

// ---------------------------------------------------------------- dynamic things
const sim = new Sim(L, SEED);
const dyn = new THREE.Group(); scene.add(dyn);
const radial = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, map: radial, transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
const blobGeo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
const reflHidden = []; // things the floor mirror pass should not see

// drop targets: moulded plastic blades with a printed face
function targetGeo(w, h) { const r = 0.22, s = new THREE.Shape(), x = w / 2, y = h / 2; s.moveTo(-x + r, -y); s.lineTo(x - r, -y); s.quadraticCurveTo(x, -y, x, -y + r); s.lineTo(x, y - r); s.quadraticCurveTo(x, y, x - r, y); s.lineTo(-x + r, y); s.quadraticCurveTo(-x, y, -x, y - r); s.lineTo(-x, -y + r); s.quadraticCurveTo(-x, -y, -x + r, -y);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.26, bevelEnabled: true, bevelSize: 0.07, bevelThickness: 0.07, bevelSegments: 3, curveSegments: 8 }); g.translate(0, 0, -0.13); return g; }
const targetM = sim.targets.map((t, i) => {
  const face = tLet.clone(); face.repeat.set(1 / 9, 1); face.offset.set(i / 9, 0); face.needsUpdate = true;
  const body = std(0xe9dcb4, 0.3);
  face.repeat.set(1 / (9 * t.w), 1 / t.h); face.offset.set(i / 9 + 1 / 18, 0.5);
  const m = new THREE.Mesh(targetGeo(t.w - 0.14, t.h), [std(0xffffff, 0.26, 0, { map: face, emissive: 0xffffff, emissiveMap: face, emissiveIntensity: 0.05 }), body]);
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(t.w + 1.2, 1.6).rotateX(-Math.PI / 2), shadowMat.clone()); sh.position.copy(T(t.x, t.y - 0.3, 0.012)); dyn.add(sh); reflHidden.push(sh); m.userData.sh = sh;
  dyn.add(m); return m;
});
// flippers
const flipM = sim.flippers.map(f => {
  const s = new THREE.Shape(); const R = 1.0, r = 0.5, len = f.len, a = Math.asin((R - r) / len);
  s.absarc(0, 0, R, Math.PI / 2 + a, 3 * Math.PI / 2 - a, false); s.absarc(len, 0, r, -Math.PI / 2 - a, Math.PI / 2 + a, false);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 1.1, bevelEnabled: true, bevelSize: 0.1, bevelThickness: 0.1, bevelSegments: 2, curveSegments: 20 }).rotateX(-Math.PI / 2);
  const g = new THREE.Group(); const bat = new THREE.Mesh(geo, mCream); bat.position.y = 0.3; g.add(bat);
  const s2 = new THREE.Shape(); s2.absarc(0, 0, R + 0.12, Math.PI / 2 + a, 3 * Math.PI / 2 - a, false); s2.absarc(len, 0, r + 0.12, -Math.PI / 2 - a, Math.PI / 2 + a, false);
  const band = new THREE.Mesh(new THREE.ExtrudeGeometry(s2, { depth: 0.42, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.1, bevelSegments: 2, curveSegments: 20 }).rotateX(-Math.PI / 2), mRed); band.position.y = 0.65; g.add(band);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.2, 20), mChrome); cap.position.y = 1.62; g.add(cap);
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(len + 3, 3.4).rotateX(-Math.PI / 2), shadowMat.clone()); sh.position.set(len / 2, 0.012, 0); sh.material.opacity = 0.6; g.add(sh); reflHidden.push(sh);
  g.position.copy(T(f.x, f.y, 0)); dyn.add(g); return g;
});
// bumper rings and flashes
const flashes = [];
function flash(x, y, z, size, color) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: radial, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 })); s.position.copy(T(x, y, z)); s.scale.setScalar(size); dyn.add(s); return s; }
const bumperM = sim.bumpers.map(b => {
  const g = new THREE.Group(); const ring = new THREE.Mesh(new THREE.TorusGeometry(3.0, 0.11, 10, 48).rotateX(Math.PI / 2), mChrome); g.add(ring);
  for (let i = 0; i < 3; i++) { const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.3, 8), mSteel); const a = i * 2.094 + 0.5; rod.position.set(Math.cos(a) * 3.0, -0.65, Math.sin(a) * 3.0); g.add(rod); }
  g.position.copy(T(b.x, b.y, 1.3)); dyn.add(g); g.userData.f = flash(b.x, b.y, 4.2, 15, 0xffc070); return g;
});
const slingM = sim.slings.map(s => { const mx = (s.fa[0] + s.fb[0]) / 2, my = (s.fa[1] + s.fb[1]) / 2; const dx = s.fb[0] - s.fa[0], dy = s.fb[1] - s.fa[1], l = Math.hypot(dx, dy);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(l * 0.55, 0.5, 0.22), mSteel); arm.rotation.y = Math.atan2(dy, dx); arm.userData = { x: mx, y: my, nx: -dy / l * s.s, ny: dx / l * s.s }; if ((mx) * arm.userData.nx > 0) { arm.userData.nx *= -1; arm.userData.ny *= -1; } dyn.add(arm); arm.userData.f = flash(mx, my, 2.4, 12, 0xffb060); return arm; });
const standM = sim.standups.map(s => { const g = new THREE.Group(); const d = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.16, 28).rotateZ(Math.PI / 2), mYellow); d.position.set(0.14, 1.45, 0); g.add(d);
  const c = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.18, 20).rotateZ(Math.PI / 2), mRed); c.position.set(0.15, 1.45, 0); g.add(c);
  const bl = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.6, 0.7), mSteel); bl.position.set(0.02, 0.8, 0); g.add(bl); g.position.copy(T(s.x, s.y, 0)); g.rotation.y = s.ang; dyn.add(g); return g; });
const spinFace = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d'); g.fillStyle = '#f2e5c2'; g.fillRect(0, 0, 256, 128); g.fillStyle = '#d2412a'; g.fillRect(0, 0, 256, 18); g.fillRect(0, 110, 256, 18); g.beginPath(); g.arc(128, 64, 34, 0, 7); g.fill(); g.fillStyle = '#f2e5c2'; g.font = 'bold 40px Futura, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('10', 128, 67); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return std(0xffffff, 0.3, 0, { map: t }); })();
const spinM = sim.spinners.map(s => { const g = new THREE.Group(); const plate = new THREE.Mesh(new THREE.BoxGeometry(s.w - 1.3, 1.25, 0.06), [mSteel, mSteel, mSteel, mSteel, spinFace, spinFace]); g.add(plate);
  const ax = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, s.w, 8).rotateZ(Math.PI / 2), mChrome); g.add(ax); g.position.copy(T(s.x, s.y, 1.55)); dyn.add(g);
  for (const sg of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.6, 8), mChrome); p.position.copy(T(s.x + sg * s.w / 2, s.y, 0.8)); dyn.add(p); } return plate; });
const gateM = sim.gates.map(g => { const w = Math.abs(g.b[0] - g.a[0]), mx = (g.a[0] + g.b[0]) / 2; const grp = new THREE.Group();
  const ax = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, w + 0.6, 8).rotateZ(Math.PI / 2), mChrome); grp.add(ax);
  const flap = new THREE.Group(); const n = g.kind === 'special' ? 5 : 2;
  for (let i = 0; i < n; i++) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 2.1, 8), mChrome); leg.position.set(-w / 2 + 0.5 + i * (w - 1) / (n - 1), -1.05, 0); flap.add(leg); }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, w - 0.9, 8).rotateZ(Math.PI / 2), mChrome); bar.position.y = -2.1; flap.add(bar); grp.add(flap);
  grp.position.copy(T(mx, g.a[1], 2.55)); dyn.add(grp); return flap; });
const tossM = sim.tossers.map(t => { const g = new THREE.Group(); const base = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.0, 0.45, 28), mBrass); base.position.y = 0.225; g.add(base);
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 1.7, 16), mSteel); col.position.y = 1.2; g.add(col);
  const head = new THREE.Group(); head.position.y = 2.2; const box = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.6, 0.9), mRed); head.add(box);
  const coil = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.7, 16).rotateZ(Math.PI / 2), mBrass); coil.position.set(-0.5, 0.42, 0); head.add(coil);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.1, 0.5), mChrome); arm.position.set(0.9, 0.1, 0); head.add(arm);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.17, 8, 20).rotateX(Math.PI / 2), mRubber); ring.position.set(1.05, 0.3, 0); head.add(ring);
  g.add(head); g.position.copy(T(t.x, t.y, 0)); const sh = new THREE.Mesh(blobGeo, shadowMat); sh.scale.setScalar(1.8); sh.position.y = 0.012; g.add(sh); reflHidden.push(sh); dyn.add(g); return { head, arm, ring }; });
const sparks = Array.from({ length: 10 }, () => { const s = flash(0, 0, 0, 1, 0xffffff); s.userData = { t: 0, life: 1, size: 1 }; return s; }); let sparkI = 0;
function spark(x, y, z, size, color, life = 0.14) { const s = sparks[sparkI++ % sparks.length]; s.position.copy(T(x, y, z)); s.material.color.set(color); s.userData.t = life; s.userData.life = life; s.userData.size = size; }
const ringPool = Array.from({ length: 8 }, () => { const m = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.17, 8, 20), mRubber); m.visible = false; dyn.add(m); return m; });
// the table ball with its own live reflection of the level
const ballCubeRT = new THREE.WebGLCubeRenderTarget(384, { type: THREE.HalfFloatType, generateMipmaps: false });
const ballCube = new THREE.CubeCamera(0.4, 900, ballCubeRT); scene.add(ballCube);
const matBall = ballMaterial(ballCubeRT.texture, shared);
const bigM = new THREE.Mesh(new THREE.SphereGeometry(BR, 72, 48), matBall); dyn.add(bigM);
const bigSh = new THREE.Mesh(blobGeo, shadowMat.clone()); bigSh.scale.setScalar(2.5); dyn.add(bigSh); reflHidden.push(bigSh);
// small steel balls
const MAXB = 48; const ballsM = new THREE.InstancedMesh(new THREE.SphereGeometry(SR, 20, 14), std(0xf4f4f4, 0.08, 1), MAXB); ballsM.frustumCulled = false; dyn.add(ballsM);
const ballsSh = new THREE.InstancedMesh(blobGeo, shadowMat, MAXB); ballsSh.frustumCulled = false; dyn.add(ballsSh); reflHidden.push(ballsSh);
// score reels behind the backglass
const reelM = []; { const geo = new THREE.CylinderGeometry(6.2, 6.2, 3.0, 96, 1, true); const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), v = uv.getY(i); uv.setXY(i, 1 - v, u); } geo.rotateZ(Math.PI / 2);
  renderer.localClippingEnabled = true; const mat = new THREE.MeshBasicMaterial({ map: tReel, color: 0x555555, clippingPlanes: [new THREE.Plane(new THREE.Vector3(0, 1, 0), -11.62), new THREE.Plane(new THREE.Vector3(0, -1, 0), 15.48)] }); for (let i = 0; i < 5; i++) { const m = new THREE.Mesh(geo, mat); m.position.copy(T(-6.6 + i * 3.3, 96.14, 13.55)); m.userData.a = 0; dyn.add(m); reelM.push(m); } reelM.mat = mat;
  const back = new THREE.Mesh(new THREE.PlaneGeometry(17, 5), new THREE.MeshBasicMaterial({ color: 0x020202 })); back.position.copy(T(0, 97, 13.5)); back.scale.setScalar(3); dyn.add(back); }
// the glass overhead: smears, fingerprints and the mirror images of the lamps
const glass = new THREE.Mesh(new THREE.PlaneGeometry(42, 90).rotateX(-Math.PI / 2), glassMaterial(shared)); glass.position.copy(T(0, 45, L.GLASS_Z)); scene.add(glass);
const glint = (() => { const pos = [], uv = [], lid = [], idx = []; L.lamps.forEach((l, i) => { const r = l.r * 1.7, b = i * 4; for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) { const p = T(l.x + (u - 0.5) * 2 * r, l.y + (v - 0.5) * 2 * r, L.GLASS_Z * 2); pos.push(p.x, p.y, p.z); uv.push(u, v); lid.push(i); } idx.push(b, b + 1, b + 2, b, b + 2, b + 3); });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('lid', new THREE.Float32BufferAttribute(lid, 1)); g.setIndex(idx);
  const m = new THREE.Mesh(g, glintMaterial(tLamp)); m.frustumCulled = false; m.visible = false; return m; })();

// ---------------------------------------------------------------- the launcher: a hand-held spring plunger
const gun = new THREE.Group(); camera.add(gun);
const gunP = { rod: null, spring: null, ball: null, knob: null };
{
  const S = 0.46, g = new THREE.Group(); g.scale.setScalar(S); gun.add(g); gun.userData.inner = g;
  const cyl = (r, len, mat, seg = 20) => new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg).rotateX(Math.PI / 2), mat);
  const housing = cyl(0.19, 0.5, mSteel, 24); housing.position.z = 0.2; g.add(housing);
  const flange = cyl(0.3, 0.06, mSteel, 24); flange.position.z = -0.08; g.add(flange);
  const nut = cyl(0.27, 0.12, mSteel, 6); nut.position.z = 0.5; g.add(nut);
  const rod = new THREE.Group(); g.add(rod); gunP.rod = rod;
  const shaft = cyl(0.07, 2.5, mChrome, 14); shaft.position.z = -0.05; rod.add(shaft);
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.34, 30).rotateX(Math.PI / 2), std(0x9a9a96, 0.42, 1, { flatShading: true })); knob.position.z = 1.3; rod.add(knob);
  const kcap = new THREE.Mesh(new THREE.SphereGeometry(0.235, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), mChrome); kcap.position.z = 1.47; kcap.scale.z = 0.5; rod.add(kcap);
  for (let i = 0; i < 3; i++) { const gr = new THREE.Mesh(new THREE.TorusGeometry(0.252, 0.012, 6, 30), mBlack); gr.position.z = 1.2 + i * 0.1; rod.add(gr); }
  const tip = cyl(0.14, 0.2, mBlack, 18); tip.position.z = -1.35; rod.add(tip);
  const washer = cyl(0.19, 0.04, mSteel, 18); washer.position.z = -1.23; rod.add(washer);
  const spring = new THREE.Mesh(new THREE.BufferGeometry(), std(0xd8d8d4, 0.22, 1)); spring.frustumCulled = false; g.add(spring); gunP.spring = spring;
  // wire cradle that carries the next ball
  class Rail extends THREE.Curve { constructor(sx) { super(); this.sx = sx; } getPoint(t, o = new THREE.Vector3()) { const z = -1.15 - t * 1.25; return o.set(this.sx * (0.1 + 0.03 * Math.sin(t * 3.1)), -0.2 - 0.05 * Math.sin(t * Math.PI) + (t > 0.9 ? (t - 0.9) * 1.3 : 0) + (t < 0.12 ? (0.12 - t) * 1.6 : 0), z); } }
  for (const sx of [-1, 1]) g.add(new THREE.Mesh(new THREE.TubeGeometry(new Rail(sx), 24, 0.028, 6), mChrome));
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.028, 6, 16, Math.PI).rotateZ(Math.PI), mChrome); strap.position.set(0, -0.06, -1.2); g.add(strap);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 16), std(0xf4f4f4, 0.07, 1)); g.add(ball); gunP.ball = ball;
  const bright = new Map(); gun.traverse(o => { o.frustumCulled = false; if (o.material && o.material.isMeshStandardMaterial) { if (!bright.has(o.material)) { const c = o.material.clone(); c.envMapIntensity = 2.3; bright.set(o.material, c); } o.material = bright.get(o.material); } });
}
const springPos = new Float32Array(9 * 22 * 7 * 3);
function buildSpring(z0, z1) { // helix between the flange and the tip washer: the coil is the power meter
  const turns = 8.5, N = 9 * 22, RS = 7, R = 0.15, rw = 0.026, idx = []; let k = 0; const pos = springPos;
  for (let i = 0; i < N; i++) { const t = i / (N - 1), a = t * turns * Math.PI * 2, z = z0 + (z1 - z0) * t, cx = Math.cos(a) * R, cy = Math.sin(a) * R;
    for (let j = 0; j < RS; j++) { const b = j / RS * Math.PI * 2, rr = Math.cos(b) * rw; pos[k++] = cx + Math.cos(a) * rr; pos[k++] = cy + Math.sin(a) * rr; pos[k++] = z + Math.sin(b) * rw; } }
  const geo = gunP.spring.geometry;
  if (!geo.index) { for (let i = 0; i < N - 1; i++) for (let j = 0; j < RS; j++) { const a = i * RS + j, b = i * RS + (j + 1) % RS, c = a + RS, d = b + RS; idx.push(a, c, b, b, c, d); } geo.setIndex(idx); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); }
  geo.attributes.position.needsUpdate = true; geo.computeVertexNormals();
}

// ---------------------------------------------------------------- probes and mirror
const envRT = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType, generateMipmaps: false });
const envCam = new THREE.CubeCamera(0.3, 900, envRT); scene.add(envCam); scene.environment = envRT.texture; scene.environmentIntensity = 1.0;
let reflRT = null, glassRT = null; const reflCam = new THREE.PerspectiveCamera();
const _n = new THREE.Vector3(0, 1, 0), _p = new THREE.Vector3(), _t = new THREE.Vector3(), _v = new THREE.Vector3(), _m = new THREE.Matrix4();
function renderMirror(h = 0, target = reflRT, mat = matFloor.uniforms.uReflMat.value) {
  camera.updateMatrixWorld(); _p.setFromMatrixPosition(camera.matrixWorld); _v.set(0, 0, -1).applyQuaternion(camera.quaternion); _t.copy(_p).add(_v);
  _p.y = 2 * h - _p.y; _t.y = 2 * h - _t.y; reflCam.position.copy(_p); reflCam.up.set(0, 1, 0).applyQuaternion(camera.quaternion); reflCam.up.reflect(_n); reflCam.lookAt(_t);
  reflCam.fov = camera.fov; reflCam.aspect = camera.aspect; reflCam.near = 0.05; reflCam.far = camera.far; reflCam.updateProjectionMatrix(); reflCam.updateMatrixWorld(); reflCam.matrixWorldInverse.copy(reflCam.matrixWorld).invert();
  _m.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(reflCam.projectionMatrix).multiply(reflCam.matrixWorldInverse); mat.copy(_m);
  floorMesh.visible = h > 0; matFloor.uniforms.uReflOn.value = h > 0 ? 0 : 1; glass.visible = false; glint.visible = false; gun.visible = false; for (const o of reflHidden) o.visible = false;
  renderer.setRenderTarget(target); renderer.render(scene, reflCam);
  floorMesh.visible = true; matFloor.uniforms.uReflOn.value = 1; glass.visible = true; glint.visible = true; gun.visible = !VIEW && view.rise < 0.05; for (const o of reflHidden) o.visible = true;
}
function renderCubes(frame) {
  matFloor.uniforms.uReflOn.value = 0; gun.visible = false; glass.visible = false;
  if (frame % 3 === 0) { bigM.visible = false; ballCube.position.copy(bigM.position); ballCube.update(renderer, scene); bigM.visible = true; matBall.uniforms.uC.value.copy(bigM.position); }
  if (frame % 6 === 1) { envCam.position.copy(camera.position); envCam.update(renderer, scene); envRT.texture.needsPMREMUpdate = true; }
  matFloor.uniforms.uReflOn.value = 1; gun.visible = !VIEW && view.rise < 0.05; glass.visible = true;
}

// ---------------------------------------------------------------- HUD
const hud = { score: $('score'), credits: $('credits'), letters: $('letters'), hint: $('hint'), msg: $('msg'), end: $('end'), pop: $('pop'), goal: $('goal'), timer: $('timer') };
hud.letters.innerHTML = [...L.word].map((c, i) => `<i class="b${Math.floor(i / 3)}">${c}</i>`).join('');
hud.credits.innerHTML = '<b></b><b></b><b></b>';
let msgT = 0; function say(t, d = 2.2) { hud.msg.textContent = t; hud.msg.classList.add('on'); msgT = d; }
let popT = 0; function pop(t) { hud.pop.textContent = t; hud.pop.classList.remove('go'); void hud.pop.offsetWidth; hud.pop.classList.add('go'); }
const HINT0 = hud.hint.textContent;
const GOALS = ['Knock down the three drop targets ahead to light L · I · G', 'Mind the pop bumpers. Drop H · T · S before the bank resets', 'Last bank: drop H · I · P, then walk into the special hole'];
let shownScore = -1, wonAt = null;
function updateHud() {
  if (sim.score !== shownScore) { shownScore = sim.score; hud.score.textContent = String(sim.score).padStart(5, '0'); }
  const cr = hud.credits.children; for (let i = 0; i < 3; i++) cr[i].className = i < sim.player.credits ? '' : 'off';
  const le = hud.letters.children; for (let i = 0; i < 9; i++) le[i].classList.toggle('on', sim.letters[i]);
  if (sim.won && wonAt && sim.wonT > 1.6 && !hud.end.classList.contains('on')) { hud.end.classList.add('on'); $('endline').textContent = `Score ${sim.score} · ${Math.floor(wonAt.t / 60)}:${String(Math.floor(wonAt.t % 60)).padStart(2, '0')} · ${wonAt.shots} shots`; }
  if (!sim.won && hud.end.classList.contains('on')) hud.end.classList.remove('on');
  const a = sim.won ? 3 : [0, 1, 2].find(i => !sim.banks[i].done); const g = a === undefined ? 'The special is open. Walk into the hole at the top' : sim.won ? '' : GOALS[a];
  if (hud.goal.textContent !== g) hud.goal.textContent = g;
  const b = sim.banks[a]; const tt = b && b.timer > 0 ? 'bank resets in ' + Math.ceil(b.timer) : ''; if (hud.timer.textContent !== tt) hud.timer.textContent = tt;
}

// ---------------------------------------------------------------- input
const keys = new Set(); let mouseFire = false, dragging = false, attract = !AUTO && FREEZE === null && !STATE ? true : false, auto = AUTO || FREEZE !== null, locked = false;
let bot = makeBot(sim);
const view = { rise: 0, yawK: 0, pitchK: 0, recoil: 0, swayX: 0, swayY: 0, lagY: 0, lagP: 0, fade: 1, focus: 20, exp: 2.2, reload: 1 };
function takeover() { if (!attract) return; attract = false; auto = false; sim.resetAll(0); sim.events.length = 0; view.fade = 0.0; say('Your turn', 1.6); hud.end.classList.remove('on'); }
function restart() { sim.resetAll(0); sim.events.length = 0; bot = makeBot(sim); view.fade = 0; hud.end.classList.remove('on'); }
addEventListener('keydown', e => { if (e.repeat) return; keys.add(e.code); if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault(); if (attract) takeover(); else if (e.code === 'KeyR') restart(); else if (sim.won && sim.wonT > 2.2 && (e.code === 'Enter' || e.code === 'Space')) restart(); });
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); mouseFire = false; });
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('mousedown', e => {
  if (attract) takeover();
  if (e.button === 0) { if (sim.won && sim.wonT > 2.2 && !auto) { restart(); return; } mouseFire = true; if (!locked && canvas.requestPointerLock) { try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (_) {} } }
  if (e.button === 2) dragging = true;
});
addEventListener('mouseup', e => { if (e.button === 0) mouseFire = false; if (e.button === 2) dragging = false; });
addEventListener('mousemove', e => {
  if (attract) { if (Math.abs(e.movementX) + Math.abs(e.movementY) > 2) takeover(); return; }
  if (auto) return;
  if (locked || dragging) { const k = dragging && !locked ? 0.0052 : 0.0023; sim.player.yaw -= e.movementX * k; sim.player.pitch = clamp(sim.player.pitch - e.movementY * k, -0.9, 1.1); }
});
document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === canvas; hud.hint.textContent = locked ? 'W A S D walk · mouse looks · hold the left button to pull the spring, release to fire · Esc gives the pointer back' : HINT0; });
$('snd').addEventListener('click', e => { e.stopPropagation(); const on = sound.toggle(); $('snd').textContent = on ? 'Sound on' : 'Enable sound'; $('snd').classList.toggle('on', on); });
function humanInput(dt) {
  const p = sim.player; const k = c => keys.has(c) ? 1 : 0;
  p.yaw += (k('ArrowLeft') - k('ArrowRight')) * 2.3 * dt; p.pitch = clamp(p.pitch + (k('ArrowUp') - k('ArrowDown')) * 1.4 * dt, -0.9, 1.1);
  return { f: k('KeyW') - k('KeyS'), s: k('KeyD') - k('KeyA'), fire: mouseFire || keys.has('Space') };
}

// ---------------------------------------------------------------- events -> sound and feedback
function onEvent(e) {
  const p = sim.player, dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy); const pan = clamp((dx * Math.sin(p.yaw) - dy * Math.cos(p.yaw)) / 14, -1, 1), att = 1 / (1 + d * d / 500);
  sound.ev(e.type, e.v * att, pan, e.n);
  switch (e.type) {
    case 'fire': view.recoil = 1; view.reload = 0; break;
    case 'drop': pop(L.word[e.n] + ' lit'); spark(e.x, e.y - 0.4, 1.4, 7, 0xffd9a0, 0.2); break;
    case 'steel': case 'ping': spark(e.x, e.y, 0.5, 1.2 + e.v * 2.5, 0xfff0d0, 0.1); break;
    case 'bumper': spark(e.x, e.y, 1.2, 6, 0xffc070, 0.12); break;
    case 'glass': spark(e.x, e.y, L.GLASS_Z - 0.1, 2.5, 0xcfe8ff, 0.12); break;
    case 'bankshot': pop('Bank shot · double'); break;
    case 'bankdone': say(e.n === 2 ? 'The special is open' : e.n === 0 ? 'L · I · G lit. The door is open' : 'H · T · S lit. On to the top lanes', 3); break;
    case 'reset': say('The bank has reset', 2); break;
    case 'hit': view.pitchK = -0.05; view.yawK = (Math.random() - 0.5) * 0.06; say(e.n > 0 ? `Hit by the table ball. ${e.n} credit${e.n > 1 ? 's' : ''} left` : '', 2); break;
    case 'restart': view.fade = 0; say('Out of credits. This area starts again', 2.6); break;
    case 'stun': pop('Tosser jammed · 200'); break;
    case 'standup': pop('100'); break;
    case 'win': wonAt = { t: sim.t, shots: sim.shots }; break;
  }
}

// ---------------------------------------------------------------- lamps
const lampTarget = new Float32Array(L.lamps.length);
function updateLamps(dt, time) {
  const lit = [0, 1, 2].map(a => (sim.letters[a * 3] + sim.letters[a * 3 + 1] + sim.letters[a * 3 + 2]) / 3), all = (lit[0] + lit[1] + lit[2]) / 3;
  const cnt = [0, 0, 0];
  L.lamps.forEach((l, i) => {
    let v = 0;
    if (typeof l.g === 'number') { v = sim.letters[l.g] ? 1 : 0; const b = sim.banks[l.area]; if (b.timer > 0 && b.timer < 3 && v) v = (Math.floor(time * 6) % 2) ? 1 : 0.25; }
    else if (l.g === 's') v = sim.banks[2].done ? 0.75 + 0.25 * Math.sin(time * 9) : 0;
    else { const a = l.area, k = cnt[a]++; v = sim.banks[a].done ? 1 : Math.pow(Math.max(0, Math.sin(time * 3.2 - k * 0.8 + a * 2)), 6) * 0.85; if (sim.won) v = 0.5 + 0.5 * Math.sin(time * 12 + k); }
    lampTarget[i] = v; lampLevel[i] += (v - lampLevel[i]) * Math.min(1, dt * (v > lampLevel[i] ? 16 : 8)); lampData[i * 4 + 3] = lampLevel[i];
  });
  tLamp.needsUpdate = true;
  const w = shared.uW.value, k = Math.min(1, dt * 2.2);
  w.x += (lit[0] * 0.85 + all * 0.15 - w.x) * k; w.y += (lit[1] * 0.85 + all * 0.15 - w.y) * k; w.z += (lit[2] * 0.85 + all * 0.15 - w.z) * k;
  shared.uLitAll.value += (all - shared.uLitAll.value) * k;
  reelM.mat.color.setScalar(0.25 + 0.75 * shared.uLitAll.value);
}

// ---------------------------------------------------------------- per-frame visuals
const _mat = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler();
function focusDistance() { // what the aim mark rests on
  const p = sim.player, dx = Math.cos(p.yaw), dy = Math.sin(p.yaw); let best = 80;
  const test = s => { const ex = s[2] - s[0], ey = s[3] - s[1], den = dx * ey - dy * ex; if (Math.abs(den) < 1e-6) return; const t = ((s[0] - p.x) * ey - (s[1] - p.y) * ex) / den, u = ((s[0] - p.x) * dy - (s[1] - p.y) * dx) / den; if (t > 0 && u >= 0 && u <= 1 && t < best) best = t; };
  for (const s of L.segs) test(s); for (const s of sim.dyn || []) test(s);
  for (const c of L.circs) { const ox = c[0] - p.x, oy = c[1] - p.y, t = ox * dx + oy * dy; if (t > 0) { const d2 = ox * ox + oy * oy - t * t; if (d2 < c[2] * c[2]) best = Math.min(best, t - Math.sqrt(c[2] * c[2] - d2)); } }
  let d = best / Math.max(0.3, Math.cos(p.pitch)); if (p.pitch < -0.02) d = Math.min(d, EYE / -Math.sin(p.pitch)); return clamp(d, 2.5, 90);
}
function updateScene(dt, time) {
  const p = sim.player, la = sim.launcher;
  // camera: eye height with a small head bob, no forced shake
  const bobA = Math.min(1, Math.hypot(p.vx, p.vy) / 12), bob = Math.sin(p.bob * 1.9) * 0.05 * bobA, bobS = Math.cos(p.bob * 0.95) * 0.035 * bobA;
  view.yawK *= Math.exp(-dt * 7); view.pitchK *= Math.exp(-dt * 7);
  if (sim.won && sim.wonT > 0.5) { let d = -Math.PI / 2 - p.yaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; p.yaw += d * Math.min(1, dt * 1.6); p.pitch += (-0.2 - p.pitch) * Math.min(1, dt * 1.6); view.rise += (1 - view.rise) * Math.min(1, dt * 0.9); } else view.rise = 0;
  const yaw = p.yaw + view.yawK, pitch = p.pitch + view.pitchK, cp = Math.cos(pitch);
  if (VIEW === 'top') { camera.position.copy(T(0, 30, 64)); camera.up.set(0, 0, -1); camera.lookAt(T(0, 46, 0)); }
  else if (VIEW === 'low') { camera.position.copy(T(-13, 9, 2.4)); camera.lookAt(T(4, 50, 3)); }
  else { camera.position.copy(T(p.x + Math.sin(p.yaw) * bobS, p.y - Math.cos(p.yaw) * bobS, EYE + bob + view.rise * 2.5)); _v.copy(camera.position).add(T(Math.cos(yaw) * cp, Math.sin(yaw) * cp, Math.sin(pitch))); camera.up.set(0, 1, 0); camera.lookAt(_v); }
  gun.visible = !VIEW && view.rise < 0.05; document.body.classList.toggle('view', !!VIEW);
  // launcher: lags the view, sways with the walk, kicks when it fires
  const dyaw = clamp((p.yaw - (view.lastYaw ?? p.yaw)), -0.2, 0.2), dpitch = clamp(p.pitch - (view.lastPitch ?? p.pitch), -0.2, 0.2); view.lastYaw = p.yaw; view.lastPitch = p.pitch;
  view.lagY += dyaw * 0.9; view.lagP += dpitch * 0.9; view.lagY *= Math.exp(-dt * 9); view.lagP *= Math.exp(-dt * 9);
  view.recoil *= Math.exp(-dt * 9); view.reload = Math.min(1, view.reload + dt / 0.5);
  const rc = view.recoil, ch = la.charge, tremble = ch > 0.92 ? Math.sin(time * 70) * 0.004 : 0;
  gun.position.set(0.6 + bobS * 0.9 - view.lagY * 0.5 + tremble, -0.56 - Math.abs(bob) * 0.7 + view.lagP * 0.4 - rc * 0.03, -1.2 + rc * 0.14 - ch * 0.03);
  gun.rotation.set(0.09 + rc * 0.1 - view.lagP * 0.5, 0.17 + view.lagY * 0.9, -0.03 + bobS * 0.8 + view.lagY * 0.4);
  const pull = ch * 0.62 - Math.max(0, la.kick - 0.6) * 0.5; gunP.rod.position.z = pull; buildSpring(-0.12, -1.2 + pull);
  const rl = view.reload; gunP.ball.visible = rl > 0.25; const rb = clamp((rl - 0.25) / 0.6, 0, 1), eo = 1 - (1 - rb) * (1 - rb);
  gunP.ball.position.set(0, lerp(-0.75, -0.04, eo), lerp(-0.9, -1.72 + pull * 0.0, eo) + (rl >= 1 ? pull : 0));
  // machines
  sim.targets.forEach((t, i) => { const m = targetM[i]; m.position.copy(T(t.x, t.y, t.h / 2 - t.z * (t.h + 0.1))); m.visible = t.z < 0.98; m.userData.sh.material.opacity = 0.75 * (1 - t.z); });
  sim.flippers.forEach((f, i) => { flipM[i].rotation.y = lerp(f.rest, f.up, f.a); });
  sim.bumpers.forEach((b, i) => { const k = b.k / 0.3; bumperM[i].position.y = 1.3 - 0.85 * Math.sin(Math.min(1, k * 1.2) * Math.PI) * (k > 0 ? 1 : 0); bumperM[i].userData.f.material.opacity = k * k * 0.9 * (0.4 + 0.6 * shared.uW.value.y) + 0; });
  sim.slings.forEach((s, i) => { const k = s.k / 0.3, a = slingM[i], u = a.userData, o = -0.5 + Math.sin(k * Math.PI) * 0.9; a.position.copy(T(u.x + u.nx * o, u.y + u.ny * o, 1.2)); u.f.material.opacity = k * k * 0.7; });
  sim.standups.forEach((s, i) => { standM[i].rotation.z = Math.sin(s.w * 22) * s.w * 0.22; });
  sim.spinners.forEach((s, i) => { spinM[i].rotation.x = s.ang; });
  sim.gates.forEach((g, i) => { gateM[i].rotation.x = -(g.open * 1.45 + g.swing * 0.9); });
  sim.tossers.forEach((t, i) => { const m = tossM[i]; m.head.rotation.y = t.yaw; m.arm.rotation.z = t.arm * 0.9; m.ring.visible = t.cool < 1.2 && t.stun <= 0; });
  for (const s of sparks) { const u = s.userData; u.t = Math.max(0, u.t - dt); const k = u.t / u.life; s.material.opacity = k * k; s.scale.setScalar(u.size * (1.4 - 0.4 * k)); }
  ringPool.forEach((m, i) => { const r = sim.rings[i]; m.visible = !!r; if (r) { m.position.copy(T(r.x, r.y, r.z)); m.rotation.set(Math.PI / 2 + Math.sin(r.sp) * 0.5, r.sp, 0); } });
  const big = sim.big; bigM.position.copy(T(big.x, big.y, big.held > 0 ? BR - 0.9 : BR)); bigSh.position.copy(T(big.x, big.y - 0.25, 0.014));
  let n = 0; for (const b of sim.balls) { if (n >= MAXB) break; _mat.makeTranslation(b.x, b.z, -b.y); ballsM.setMatrixAt(n, _mat); const s = 0.42 + b.z * 0.25; _mat.makeScale(s, 1, s).setPosition(b.x, 0.012, -b.y + 0.05); ballsSh.setMatrixAt(n, _mat); n++; }
  ballsM.count = n; ballsSh.count = n; ballsM.instanceMatrix.needsUpdate = true; ballsSh.instanceMatrix.needsUpdate = true;
  // score reels
  const digits = String(Math.min(99999, sim.score)).padStart(5, '0'); reelM.forEach((m, i) => { const tgt = (+digits[i]) * Math.PI / 5; let d = tgt - m.userData.a; while (d < -0.01) d += Math.PI * 2; const st = Math.min(d, dt * 14); if (d > 0.02 && Math.floor((m.userData.a + st) / (Math.PI / 5)) !== Math.floor(m.userData.a / (Math.PI / 5))) sound.ev('reel', 0.25, 0, i); m.userData.a = (m.userData.a + st) % (Math.PI * 2); m.rotation.x = -(m.userData.a + Math.PI / 10) + REEL0; });
  // lens
  view.focus += (focusDistance() - view.focus) * Math.min(1, dt * 6);
  const wl = shared.uW.value, a = p.area, wHere = a === 0 ? wl.x : a === 1 ? wl.y : wl.z; view.exp += (lerp(1.6, 0.92, Math.sqrt(wHere)) - view.exp) * Math.min(1, dt * 1.5);
  view.fade = Math.min(1, view.fade + dt * 2.2);
  shared.uEnvS.value = lerp(0.015, 0.06, shared.uLitAll.value);
  // rumble of the table ball: distance and direction
  const dx = big.x - p.x, dy = big.y - p.y, d = Math.hypot(dx, dy), sp = big.held > 0 ? 0 : Math.hypot(big.vx, big.vy);
  sound.rumble(sp, d, clamp((dx * Math.sin(p.yaw) - dy * Math.cos(p.yaw)) / 12, -1, 1)); sound.hum(shared.uLitAll.value);
}
const REEL0 = +(Q.get('reel0') || 0);

// ---------------------------------------------------------------- loop
let cssW = 0, cssH = 0, scale = 1, lastResize = 0;
function resize(force) {
  const w = innerWidth, h = innerHeight, dpr = Math.min(devicePixelRatio || 1, 2);
  let W = Math.round(w * dpr * scale), H = Math.round(h * dpr * scale); const maxPx = 2560 * 1440; if (W * H > maxPx) { const k = Math.sqrt(maxPx / (W * H)); W = Math.round(W * k); H = Math.round(H * k); }
  if (!force && W === cssW && H === cssH) return; cssW = W; cssH = H;
  renderer.setPixelRatio(1); renderer.setSize(W, H, false); lens.resize(W, H);
  if (reflRT) reflRT.dispose(); reflRT = new THREE.WebGLRenderTarget(W >> 1, H >> 1, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter }); matFloor.uniforms.tRefl.value = reflRT.texture;
  if (glassRT) glassRT.dispose(); glassRT = new THREE.WebGLRenderTarget(W >> 1, H >> 1, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter }); glass.material.uniforms.tRefl.value = glassRT.texture;
  camera.aspect = w / h; const hf = 75 * Math.PI / 180; camera.fov = (w / h >= 1.2 ? 2 * Math.atan(Math.tan(hf / 2) / (w / h)) : 62 * Math.PI / 180) * 180 / Math.PI; camera.updateProjectionMatrix();
}
addEventListener('resize', () => resize());

const DT = 1 / 120; let acc = 0, last = performance.now(), frame = 0, time = 0, frozen = false, ema = 16, fps = 60, endT = 0;
function stepSim(dt) { const inp = auto || attract ? bot(dt) : humanInput(dt); sim.step(dt, inp); }
if (STATE) { const a = { a1: 0, a2: 1, a3: 2, end: 3 }[STATE] ?? 0; sim.resetAll(Math.min(a, 3)); if (a === 3) { sim.player.x = 0; sim.player.y = 80.6; sim.player.yaw = -Math.PI / 2; sim.player.pitch = 0.1; } sim.events.length = 0; if (!AUTO && FREEZE === null) attract = false; }
if (FREEZE !== null) { for (let i = 0; i < FREEZE * 120; i++) { stepSim(DT); if (i % 12 === 0) updateLamps(DT * 12, i * DT); for (const e of sim.events) if (e.type === 'win') onEvent(e); sim.events.length = 0; }
  if (sim.won) { for (let i = 0; i < 300; i++) updateScene(1 / 60, FREEZE); } time = FREEZE; frozen = true; for (let i = 0; i < 240; i++) updateLamps(DT, time); }
resize(true);
function tick(now) {
  requestAnimationFrame(tick);
  let dt = Math.min(0.1, (now - last) / 1000); last = now; ema += (dt * 1000 - ema) * 0.05; fps = 1000 / ema; frame++;
  if (!frozen) {
    acc += dt; let guard = 0; while (acc >= DT && guard++ < 16) { stepSim(DT); acc -= DT; time += DT; for (const e of sim.events) onEvent(e); sim.events.length = 0; }
    if (sim.won && (attract || auto)) { endT += dt; if (endT > 9 && attract) { endT = 0; restart(); } } else endT = 0;
  } else dt = 1 / 60;
  shared.uTime.value = time; updateLamps(frozen ? 0 : dt, time); updateScene(frozen ? 1 : dt, time); updateHud();
  if (msgT > 0) { msgT -= dt; if (msgT <= 0) hud.msg.classList.remove('on'); }
  document.body.classList.toggle('attract', attract);
  // adaptive resolution
  if (!frozen && now - lastResize > 1500 && frame > 90) { if (ema > 19.5 && scale > 0.5) { scale = Math.max(0.5, scale * 0.88); lastResize = now; resize(); } else if (ema < 13 && scale < 1) { scale = Math.min(1, scale * 1.08); lastResize = now; resize(); } }
  renderCubes(frame); renderMirror(L.GLASS_Z, glassRT, glass.material.uniforms.uReflMat.value); renderMirror();
  renderer.setRenderTarget(lens.main); renderer.render(scene, camera);
  lens.render(camera, view.focus, { aperture: 26, exposure: view.exp, time: frozen ? 0.37 : time, hurt: sim.player.hurt, fade: view.fade });
  window.__stats = { locked, fps, scale, w: cssW, h: cssH, frame, t: sim.t, attract, auto, won: sim.won };
}
window.__sim = sim; window.__view = view;
document.body.classList.add('ready'); updateHud();
requestAnimationFrame(tick);
