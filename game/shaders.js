// GLSL for the baked table, the lacquered playfield, the lens.
import * as THREE from 'three';

const COMMON = /* glsl */`
vec3 dec(vec3 e){ e = pow(e, vec3(2.2)); return e / (1.0 - min(e, vec3(0.985))); }
uniform vec3 uW;                       // lit fraction per area
float areaW(float y){ return mix(mix(uW.x, uW.y, smoothstep(30.0, 36.0, y)), uW.z, smoothstep(56.0, 62.0, y)); }
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
`;
const VS = /* glsl */`
varying vec2 vUv; varying vec3 vWp; varying vec3 vN;
void main(){ vUv = uv; vec4 wp = modelMatrix * vec4(position, 1.0); vWp = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * wp; }
`;

// everything static and diffuse: albedo x baked light (two lamp states) + baked emission
export function bakedMaterial(tAlb, tDim, tLit, tEmit, shared) {
  return new THREE.ShaderMaterial({
    uniforms: { tAlb: { value: tAlb }, tDim: { value: tDim }, tLit: { value: tLit }, tEmit: { value: tEmit }, uEmitOn: { value: tEmit ? 1 : 0 }, uW: shared.uW, uEnvS: shared.uEnvS },
    vertexShader: VS,
    fragmentShader: COMMON + /* glsl */`
uniform sampler2D tAlb, tDim, tLit, tEmit; uniform float uEmitOn; uniform float uEnvS; varying vec2 vUv; varying vec3 vWp; varying vec3 vN;
void main(){
  float w = areaW(-vWp.z);
  vec3 alb = pow(texture2D(tAlb, vUv).rgb, vec3(2.2));
  float g = vnoise(vWp.xz * 38.0 + vWp.y * 17.0) * 0.5 + vnoise(vWp.xz * 150.0 + vWp.y * 90.0) * 0.5;
  alb *= 0.9 + 0.2 * g;
  // the side rails and the arch are lacquered walnut: grain drawn here so it stays crisp at ball height
  vec2 tp = vec2(vWp.x, -vWp.z); float el = (tp.x * tp.x) / 441.0 + (tp.y - 72.0) * (tp.y - 72.0) / 196.0;
  float wall = max(step(20.9, abs(tp.x)) * step(tp.y, 72.5), step(0.975, el) * step(72.0, tp.y)); float top = step(5.98, vWp.y);
  if (max(wall, top) > 0.5 && vWp.y < 6.5 && tp.y < 89.5) {
    float s = top > 0.5 ? tp.y : (tp.y < 72.0 ? tp.y : atan(tp.x, tp.y - 72.0) * 21.0), h = top > 0.5 ? tp.x : vWp.y;
    float f = vnoise(vec2(s * 0.22, h * 7.0)) * 0.55 + vnoise(vec2(s * 0.9, h * 31.0)) * 0.3 + vnoise(vec2(s * 2.5, h * 90.0)) * 0.15;
    float pores = 1.0 - 0.3 * smoothstep(0.62, 0.8, vnoise(vec2(s * 4.0, h * 170.0)));
    alb = mix(vec3(0.085, 0.036, 0.016), vec3(0.3, 0.15, 0.06), smoothstep(0.25, 0.75, f)) * pores;
  }
  vec3 irr = mix(dec(texture2D(tDim, vUv).rgb), dec(texture2D(tLit, vUv).rgb), w);
  vec3 col = alb * irr;
  if (uEmitOn > 0.5) col += dec(texture2D(tEmit, vUv).rgb) * mix(0.012, 1.0, w * w);
  // a little sheen on lacquer and plastic
  vec3 V = normalize(cameraPosition - vWp); float f = pow(1.0 - max(dot(V, normalize(vN)), 0.0), 4.0);
  col += f * 0.05 * (irr + uEnvS) * 0.6;
  gl_FragColor = vec4(col, 1.0);
}` });
}

// the playfield: printed art under worn lacquer, lamp inserts lit from below, mirror-like at grazing angles
export function floorMaterial(tex, shared) {
  return new THREE.ShaderMaterial({
    uniforms: { tArt: { value: tex.art }, tWear: { value: tex.wear }, tDim: { value: tex.fDim }, tLit: { value: tex.fLit }, tLampId: { value: tex.lampId }, tLamp: { value: tex.lamp },
      tRefl: { value: null }, uReflMat: { value: new THREE.Matrix4() }, uReflOn: { value: 1 }, uW: shared.uW, uEnvS: shared.uEnvS },
    vertexShader: VS,
    fragmentShader: COMMON + /* glsl */`
uniform sampler2D tArt, tWear, tDim, tLit, tLampId, tLamp, tRefl; uniform mat4 uReflMat; uniform float uReflOn, uEnvS; varying vec2 vUv; varying vec3 vWp;
void main(){
  vec2 tp = vec2(vWp.x, -vWp.z);
  float w = areaW(tp.y);
  vec3 art = texture2D(tArt, vUv).rgb; vec2 wear = texture2D(tWear, vUv).rg;
  float grain = vnoise(tp * vec2(70.0, 9.0)) * 0.6 + vnoise(tp * 240.0) * 0.4;
  float dustN = vnoise(tp * 23.0) * vnoise(tp * 7.0 + 3.0);
  float dust = clamp(wear.g * (0.5 + 1.6 * dustN), 0.0, 1.0);
  vec3 alb = art * (0.9 + 0.2 * grain);
  alb = mix(alb, vec3(0.36, 0.31, 0.26), dust * 0.5);
  vec3 irr = mix(dec(texture2D(tDim, vUv).rgb), dec(texture2D(tLit, vUv).rgb), w);
  vec3 col = alb * irr;
  float rough = clamp(wear.r * 0.9 + dust * 0.7 + (vnoise(tp * 55.0) - 0.5) * 0.12, 0.05, 1.0);
  // lamp inserts
  float id = texture2D(tLampId, vec2((tp.x + 24.0) / 48.0, (tp.y + 4.0) / 96.0)).r * 255.0;
  float ins = 0.0;
  if (id > 0.5) {
    float u = (id - 0.5) / 64.0; vec4 L0 = texture2D(tLamp, vec2(u, 0.25)); vec4 L1 = texture2D(tLamp, vec2(u, 0.75));
    vec2 dl = tp - L0.xy; float d = length(dl), aa = fwidth(d) + 0.003;
    ins = 1.0 - smoothstep(L0.z - aa, L0.z + aa, d);
    float rr = d / L0.z, ang = atan(dl.y, dl.x);
    float star = 0.78 + 0.22 * cos(ang * 18.0) * smoothstep(0.15, 0.6, rr); float rings = 0.9 + 0.1 * cos(rr * 22.0);
    float pr = dot(art, vec3(0.333));                         // printed letter or arrow over the insert
    vec3 plastic = mix(L1.rgb, vec3(1.0), 0.3);
    vec3 off = plastic * (irr * 0.62 + 0.004) * (0.85 + 0.15 * star) * rings;
    vec3 on = L1.rgb * L0.w * (2.6 * exp(-rr * rr * 2.2) + 0.8) * star * rings + vec3(1.0, 0.9, 0.75) * L0.w * 1.6 * exp(-rr * rr * 9.0);
    col = mix(col, (off + on) * (0.12 + 0.88 * pr), ins);
    col += alb * L1.rgb * L0.w * (1.0 - 0.5 * w) * 0.5 * exp(-max(d - L0.z, 0.0) * 1.25) * (1.0 - ins);
    rough = mix(rough, 0.12, ins);
  }
  // lacquer reflection
  vec3 V = normalize(cameraPosition - vWp); float F = 0.04 + 0.96 * pow(1.0 - clamp(V.y, 0.0, 1.0), 5.0);
  float dist = length(cameraPosition - vWp);
  vec3 refl = vec3(uEnvS);
  if (uReflOn > 0.5) { vec4 rc = uReflMat * vec4(vWp, 1.0); vec2 ruv = rc.xy / rc.w; float lod = rough * 5.5 + clamp(dist * 0.02, 0.0, 1.0);
    refl = textureLod(tRefl, ruv + (vec2(vnoise(tp * 31.0), vnoise(tp * 31.0 + 9.0)) - 0.5) * 0.012 * rough, lod).rgb; }
  float k = F * mix(1.0, 0.25, rough);
  float holes = smoothstep(0.02, 0.06, dot(art, vec3(0.333)) + ins);   // no gloss inside the black slots
  col = col * (1.0 - k * 0.85) + refl * k * holes;
  gl_FragColor = vec4(col, 1.0);
}` });
}

export function backglassMaterial(t, shared) {
  return new THREE.ShaderMaterial({
    uniforms: { tMap: { value: t }, uLit: shared.uLitAll, uTime: shared.uTime },
    vertexShader: VS,
    fragmentShader: COMMON + /* glsl */`
uniform sampler2D tMap; uniform float uLit, uTime; varying vec2 vUv;
void main(){
  vec2 p = vec2(vUv.x * 50.0 - 25.0, 8.0 + (1.0 - vUv.y) * 44.0);
  for (int i = 0; i < 5; i++) { float x0 = -8.1 + float(i) * 3.3; if (p.x > x0 && p.x < x0 + 3.0 && p.y > 11.6 && p.y < 15.5) discard; }
  vec3 c = texture2D(tMap, vUv).rgb;
  // bulbs behind the painted glass: uneven back light
  float hot = 0.0; for (int i = 0; i < 4; i++) for (int j = 0; j < 3; j++) { vec2 q = vec2(-18.0 + float(i) * 12.0, 16.0 + float(j) * 13.0); float fl = 0.9 + 0.1 * sin(uTime * (3.0 + float(i + j)) + float(i * 7 + j)); hot += fl * exp(-dot(p - q, p - q) / 60.0); }
  float lum = mix(0.22, 1.25, uLit) * (0.45 + 0.75 * hot);
  gl_FragColor = vec4(c * c * lum + c * 0.02, 1.0);
}` });
}

// mirror ball: samples a live cube map of the level
export function ballMaterial(cube, shared) {
  return new THREE.ShaderMaterial({
    uniforms: { tCube: { value: cube }, uC: { value: new THREE.Vector3() } },
    vertexShader: VS,
    fragmentShader: /* glsl */`
uniform samplerCube tCube; uniform vec3 uC; varying vec3 vWp; varying vec3 vN;
void main(){
  vec3 N = normalize(vN), V = normalize(cameraPosition - vWp); vec3 R = reflect(-V, N);
  // the floor is close: correct the lookup by the hit point on the playfield
  vec3 P = vWp; if (R.y < -0.02) { float t = -P.y / R.y; vec3 H = P + R * min(t, 60.0); R = normalize(H - uC); }
  vec3 c = textureCube(tCube, vec3(-R.x, R.y, R.z)).rgb;
  float f = pow(1.0 - max(dot(N, V), 0.0), 5.0);
  c *= mix(vec3(0.86, 0.87, 0.9), vec3(1.0), f);
  c *= mix(0.25, 1.0, smoothstep(-1.0, -0.72, N.y));          // contact with the playfield
  gl_FragColor = vec4(c, 1.0);
}` });
}

export function glassMaterial(shared) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uW: shared.uW, uEnvS: shared.uEnvS, tRefl: { value: null }, uReflMat: { value: new THREE.Matrix4() } },
    vertexShader: VS,
    fragmentShader: COMMON + /* glsl */`
uniform float uEnvS; uniform sampler2D tRefl; uniform mat4 uReflMat; varying vec3 vWp;
float print(vec2 p, vec2 c, float rot, float s){ vec2 q = p - c; float cs = cos(rot), sn = sin(rot); q = vec2(cs*q.x - sn*q.y, sn*q.x + cs*q.y) / s; float r = length(q * vec2(1.0, 0.72));
  float ridges = 0.5 + 0.5 * sin(r * 46.0 + 5.0 * vnoise(q * 3.0) + atan(q.y, q.x) * 2.0); return smoothstep(1.0, 0.75, r) * ridges * (0.4 + 0.6 * vnoise(q * 5.0 + c)); }
void main(){
  vec2 tp = vec2(vWp.x, -vWp.z); vec3 V = normalize(cameraPosition - vWp); float graze = pow(1.0 - abs(V.y), 2.0);
  float smear = vnoise(tp * vec2(0.5, 2.2)) * vnoise(tp * 1.3 + 4.0); smear = smoothstep(0.25, 0.7, smear);
  float specks = step(0.992, hash(floor(tp * 22.0))) * 0.8;
  float fp = print(tp, vec2(6.0, 21.0), 0.4, 0.8) + print(tp, vec2(7.1, 22.2), 0.9, 0.75) + print(tp, vec2(-9.5, 40.0), -0.6, 0.85) + print(tp, vec2(3.0, 58.0), 1.9, 0.8) + print(tp, vec2(-4.0, 13.0), 2.6, 0.9) + print(tp, vec2(12.0, 68.0), 0.1, 0.8);
  float w = areaW(tp.y);
  vec3 light = mix(vec3(0.05, 0.06, 0.08), vec3(0.55, 0.36, 0.2), w) + uEnvS * 0.3;
  float a = (smear * 0.05 + specks * 0.12 + fp * 0.12) * (0.35 + 1.4 * graze);
  // the glass mirrors the lit table below, faint when seen straight on and strong at a grazing angle
  vec4 rc = uReflMat * vec4(vWp, 1.0); vec2 ruv = rc.xy / rc.w; float F = 0.03 + 0.42 * pow(1.0 - abs(V.y), 4.0);
  vec3 refl = textureLod(tRefl, ruv + (vec2(vnoise(tp * 3.0), vnoise(tp * 3.0 + 7.0)) - 0.5) * 0.004, 1.0 + smear * 2.5).rgb;
  gl_FragColor = vec4(light * a + min(refl, vec3(6.0)) * F * (1.0 - 0.5 * smear), 1.0);
}` });
}

// mirror images of the lamps in the glass overhead
export function glintMaterial(tLamp) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { tLamp: { value: tLamp } },
    vertexShader: /* glsl */`attribute float lid; uniform sampler2D tLamp; varying vec3 vC; varying vec2 vUv; varying vec3 vWp;
void main(){ float u = (lid + 0.5) / 64.0; vC = texture2D(tLamp, vec2(u, 0.75)).rgb * texture2D(tLamp, vec2(u, 0.25)).w; vUv = uv; vec4 wp = modelMatrix * vec4(position, 1.0); vWp = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */`varying vec3 vC; varying vec2 vUv; varying vec3 vWp;
void main(){ float r = length(vUv - 0.5) * 2.0; vec3 V = normalize(cameraPosition - vWp); float F = 0.04 + 0.96 * pow(1.0 - abs(V.y), 5.0); gl_FragColor = vec4(vC * exp(-r * r * 2.5) * F * 2.2, 1.0); }` });
}

// ---------------------------------------------------------------- the lens
const FSV = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
export class Lens {
  constructor(renderer) {
    this.r = renderer; this.scene = new THREE.Scene(); this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null); this.quad.frustumCulled = false; this.scene.add(this.quad);
    const M = (fs, u) => new THREE.ShaderMaterial({ uniforms: u, vertexShader: FSV, fragmentShader: fs, depthTest: false, depthWrite: false });
    this.dof = M(/* glsl */`
uniform sampler2D tC, tD; uniform vec2 uPx; uniform float uNear, uFar, uFocus, uAp; varying vec2 vUv;
float lin(float d){ float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
float coc(float z){ return clamp((1.0 / uFocus - 1.0 / z) * uAp, -4.5, 9.0); }
void main(){
  float z0 = lin(texture2D(tD, vUv).x), c0 = coc(z0); vec3 acc = texture2D(tC, vUv).rgb; float wsum = 1.0;
  float rad = max(abs(c0), 1.5);
  for (int i = 0; i < 22; i++) {
    float fi = float(i) + 0.5; float r = sqrt(fi / 22.0); float a = fi * 2.39996;
    vec2 o = vec2(cos(a), sin(a)) * r; vec2 uv = vUv + o * uPx * 9.0;
    float zs = lin(texture2D(tD, uv).x); float cs = abs(coc(zs));
    // near blur spreads over what is behind it, far blur must not bleed onto sharp near things
    float reach = (zs < z0) ? cs : min(cs, abs(c0));
    float w = smoothstep(r * 9.0 - 1.0, r * 9.0 + 0.5, reach);
    acc += texture2D(tC, uv).rgb * w; wsum += w;
  }
  gl_FragColor = vec4(acc / wsum, 1.0);
}`, { tC: { value: null }, tD: { value: null }, uPx: { value: new THREE.Vector2() }, uNear: { value: 0.1 }, uFar: { value: 1000 }, uFocus: { value: 20 }, uAp: { value: 30 } });
    this.down = M(/* glsl */`uniform sampler2D tC; uniform vec2 uPx; uniform float uThr; varying vec2 vUv;
void main(){ vec3 c = texture2D(tC, vUv + uPx * vec2(-1, -1)).rgb + texture2D(tC, vUv + uPx * vec2(1, -1)).rgb + texture2D(tC, vUv + uPx * vec2(-1, 1)).rgb + texture2D(tC, vUv + uPx * vec2(1, 1)).rgb; c *= 0.25;
  if (uThr > 0.0) { float l = max(c.r, max(c.g, c.b)); c *= smoothstep(uThr, uThr * 2.5, l); c = min(c, vec3(40.0)); } gl_FragColor = vec4(c, 1.0); }`, { tC: { value: null }, uPx: { value: new THREE.Vector2() }, uThr: { value: 0 } });
    this.up = M(/* glsl */`uniform sampler2D tC, tB; uniform vec2 uPx; varying vec2 vUv;
void main(){ vec3 c = vec3(0.0); c += texture2D(tC, vUv + uPx * vec2(-1, -1)).rgb + texture2D(tC, vUv + uPx * vec2(1, -1)).rgb + texture2D(tC, vUv + uPx * vec2(-1, 1)).rgb + texture2D(tC, vUv + uPx * vec2(1, 1)).rgb;
  c = c * 0.125 + texture2D(tC, vUv).rgb * 0.5; gl_FragColor = vec4(c + texture2D(tB, vUv).rgb, 1.0); }`, { tC: { value: null }, tB: { value: null }, uPx: { value: new THREE.Vector2() } });
    this.fin = M(/* glsl */`uniform sampler2D tC, tB; uniform float uExp, uTime, uHurt, uFade; uniform vec2 uRes; varying vec2 vUv;
float h(vec2 p){ p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
void main(){
  vec2 d = vUv - 0.5; float r2 = dot(d, d);
  vec2 ca = d * r2 * 0.012;
  vec3 c = vec3(texture2D(tC, vUv + ca).r, texture2D(tC, vUv).g, texture2D(tC, vUv - ca).b);
  vec3 b = texture2D(tB, vUv).rgb;
  c += b * 0.085;
  c *= uExp * (1.0 - r2 * 0.75);
  c = aces(c * vec3(1.02, 1.0, 0.97));
  c = pow(c, vec3(1.0 / 2.2));
  float g = h(gl_FragCoord.xy + fract(uTime) * 61.7) - 0.5; float l = dot(c, vec3(0.3, 0.6, 0.1));
  c += g * mix(0.055, 0.022, l);
  c = mix(c, vec3(0.6, 0.05, 0.02), uHurt * smoothstep(0.08, 0.5, r2) * 0.55);
  c *= uFade;
  gl_FragColor = vec4(c, 1.0);
}`, { tC: { value: null }, tB: { value: null }, uExp: { value: 1 }, uTime: { value: 0 }, uHurt: { value: 0 }, uFade: { value: 1 }, uRes: { value: new THREE.Vector2() } });
    this.w = 0;
  }
  resize(w, h) {
    if (w === this.w && h === this.h) return; this.w = w; this.h = h;
    const mk = (W, H, o = {}) => new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, depthBuffer: false, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter, ...o });
    for (const t of this.all || []) t.dispose();
    this.main = mk(w, h, { samples: 4, depthBuffer: true, depthTexture: new THREE.DepthTexture(w, h) });
    this.rDof = mk(w, h); this.bl = []; let W = w, H = h;
    for (let i = 0; i < 6; i++) { W = Math.max(2, W >> 1); H = Math.max(2, H >> 1); this.bl.push([mk(W, H), mk(W, H)]); }
    this.all = [this.main, this.rDof, ...this.bl.flat()];
  }
  pass(mat, target) { this.quad.material = mat; this.r.setRenderTarget(target); this.r.render(this.scene, this.cam); }
  render(cam, focus, o) {
    const { dof, down, up, fin } = this;
    dof.uniforms.tC.value = this.main.texture; dof.uniforms.tD.value = this.main.depthTexture; dof.uniforms.uPx.value.set(1 / this.w, 1 / this.h);
    dof.uniforms.uNear.value = cam.near; dof.uniforms.uFar.value = cam.far; dof.uniforms.uFocus.value = focus; dof.uniforms.uAp.value = o.aperture * this.h / 1080;
    this.pass(dof, this.rDof);
    let src = this.rDof;
    for (let i = 0; i < this.bl.length; i++) { const t = this.bl[i][0]; down.uniforms.tC.value = src.texture; down.uniforms.uPx.value.set(0.5 / src.width, 0.5 / src.height); down.uniforms.uThr.value = i === 0 ? 1.1 : 0; this.pass(down, t); src = t; }
    for (let i = this.bl.length - 2; i >= 0; i--) { const t = this.bl[i][1]; up.uniforms.tC.value = (i === this.bl.length - 2 ? this.bl[i + 1][0] : this.bl[i + 1][1]).texture; up.uniforms.tB.value = this.bl[i][0].texture; up.uniforms.uPx.value.set(1 / this.bl[i + 1][0].width, 1 / this.bl[i + 1][0].height); this.pass(up, t); }
    fin.uniforms.tC.value = this.rDof.texture; fin.uniforms.tB.value = this.bl[0][1].texture; fin.uniforms.uExp.value = o.exposure; fin.uniforms.uTime.value = o.time; fin.uniforms.uHurt.value = o.hurt; fin.uniforms.uFade.value = o.fade;
    this.pass(fin, null);
  }
}
