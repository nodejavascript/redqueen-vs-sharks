// Scene, environment, dock, queen and shark factory.
import * as THREE from './vendor/three.module.js';

export const WATER_Y = -0.55;
export const DECK_Z0 = 14;      // near end of the dock
export const DECK_Z1 = -190;    // far end
const SUN_DIR = new THREE.Vector3(0.55, 0.16, -0.82).normalize();

/* ------------------------------------------------------------------ textures */
function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return { c, x: c.getContext('2d') };
}

function tex(c, repeatX = 1, repeatY = 1) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = 4;
  return t;
}

function skyTexture() {
  const { c, x } = canvas(8, 512);
  const g = x.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0.00, '#151b3d');
  g.addColorStop(0.14, '#2c2a5c');
  g.addColorStop(0.27, '#6b3f6c');
  g.addColorStop(0.38, '#b85e60');
  g.addColorStop(0.45, '#e8814f');
  g.addColorStop(0.49, '#ffb877');
  g.addColorStop(0.50, '#ffd8a8');
  g.addColorStop(0.53, '#ffe7c0');
  g.addColorStop(1.00, '#ffe7c0');
  x.fillStyle = g; x.fillRect(0, 0, 8, 512);
  return tex(c);
}

function woodTexture() {
  const { c, x } = canvas(256, 512);
  x.fillStyle = '#7d4a2c'; x.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 260; i++) {
    const y = Math.random() * 512;
    const a = 0.04 + Math.random() * 0.13;
    x.strokeStyle = `rgba(${40 + Math.random() * 40},${20 + Math.random() * 20},10,${a})`;
    x.lineWidth = 0.6 + Math.random() * 2.2;
    x.beginPath();
    x.moveTo(0, y);
    x.bezierCurveTo(90, y + (Math.random() - .5) * 12, 170, y + (Math.random() - .5) * 12, 256, y + (Math.random() - .5) * 10);
    x.stroke();
  }
  for (let i = 0; i < 34; i++) {          // plank seams
    const y = (i / 34) * 512;
    x.fillStyle = 'rgba(20,8,4,0.55)';
    x.fillRect(0, y, 256, 3);
    x.fillStyle = 'rgba(255,190,130,0.10)';
    x.fillRect(0, y + 3, 256, 2);
  }
  return c;
}

function cloudTexture() {
  const { c, x } = canvas(256, 128);
  x.clearRect(0, 0, 256, 128);
  for (let i = 0; i < 46; i++) {
    const cx = 44 + Math.random() * 168;
    const cy = 78 - Math.random() * 40;
    const r = 10 + Math.random() * 26;
    const g = x.createRadialGradient(cx, cy - r * 0.25, 0, cx, cy, r);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.45, 'rgba(255,246,232,0.55)');
    g.addColorStop(0.78, 'rgba(255,232,208,0.18)');
    g.addColorStop(1, 'rgba(255,226,200,0)');
    x.fillStyle = g;
    x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  return t;
}

function palmTexture() {
  const { c, x } = canvas(1024, 256);
  x.clearRect(0, 0, 1024, 256);
  const ink = 'rgba(26,12,18,0.95)';
  // ground band
  x.fillStyle = ink;
  x.fillRect(0, 232, 1024, 24);
  for (let i = 0; i < 11; i++) {
    const px = 40 + i * 92 + Math.random() * 26;
    const h = 96 + Math.random() * 92;
    x.strokeStyle = ink;
    x.lineWidth = 4 + Math.random() * 3;
    x.beginPath();
    x.moveTo(px, 236);
    x.quadraticCurveTo(px + 10, 236 - h * 0.6, px + (Math.random() - .5) * 26, 236 - h);
    x.stroke();
    // fronds
    for (let f = 0; f < 6; f++) {
      const a = -Math.PI / 2 + (f - 2.5) * 0.48 + Math.random() * 0.1;
      const len = 34 + Math.random() * 26;
      const bx = px + (Math.random() - .5) * 22, by = 236 - h;
      x.lineWidth = 3;
      x.beginPath();
      x.moveTo(bx, by);
      x.quadraticCurveTo(bx + Math.cos(a) * len * .6, by + Math.sin(a) * len * .6 - 8,
                         bx + Math.cos(a) * len, by + Math.sin(a) * len + 14);
      x.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  return t;
}

function glowTexture() {
  const { c, x } = canvas(128, 128);
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0.0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(255,240,220,0.85)');
  g.addColorStop(0.45, 'rgba(255,150,90,0.28)');
  g.addColorStop(1.0, 'rgba(255,110,60,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function discTexture() {
  const { c, x } = canvas(128, 128);
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(0.65, 'rgba(0,0,0,0.22)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/* ------------------------------------------------------------------ water */
const waterVert = /* glsl */`
  varying vec3 vWorld;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const waterFrag = /* glsl */`
  uniform float uTime;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uHaze;
  varying vec3 vWorld;

  vec2 grad(vec2 p, float t) {
    vec2 g = vec2(0.0);
    vec2 d;
    d = normalize(vec2( 0.90,  0.45)); g += 0.052 * d * cos(dot(p, d) * 0.30 + t * 0.55);
    d = normalize(vec2(-0.70,  0.80)); g += 0.042 * d * cos(dot(p, d) * 0.52 + t * 0.78);
    d = normalize(vec2( 0.30, -0.95)); g += 0.032 * d * cos(dot(p, d) * 0.95 + t * 1.10);
    d = normalize(vec2(-0.95, -0.30)); g += 0.020 * d * cos(dot(p, d) * 1.70 + t * 1.55);
    d = normalize(vec2( 0.80,  0.60)); g += 0.013 * d * cos(dot(p, d) * 3.10 + t * 2.25);
    return g;
  }

  void main() {
    vec2 g = grad(vWorld.xz, uTime);
    vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
    vec3 V = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - max(dot(n, V), 0.0), 4.0);

    float shore = exp(-abs(vWorld.x) / 11.0);
    vec3 base = mix(uDeep, uShallow, 0.25 + 0.75 * shore);
    vec3 skyRefl = mix(vec3(0.52, 0.22, 0.20), vec3(1.00, 0.70, 0.42),
                       clamp(-vWorld.z * 0.004 + 0.55, 0.0, 1.0));
    vec3 col = mix(base, skyRefl, 0.28 + 0.55 * fres);

    vec3 L = normalize(uSunDir);
    vec3 H = normalize(L + V);
    float ndh = max(dot(n, H), 0.0);
    col += uSunColor * (pow(ndh, 420.0) * 3.0 + pow(ndh, 90.0) * 0.16 + pow(ndh, 18.0) * 0.05);

    float haze = smoothstep(80.0, 520.0, length(vWorld.xz));
    col = mix(col, uHaze, haze * 0.92);
    col = mix(col, uHaze, smoothstep(0.80, 0.99, fres) * 0.22);

    gl_FragColor = vec4(col, 1.0);
  }
`;

export function createWater(glow) {
  const geo = new THREE.PlaneGeometry(3000, 3000, 1, 1);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSunDir: { value: SUN_DIR.clone() },
      uSunColor: { value: new THREE.Color(0xffd9a0) },
      uDeep: { value: new THREE.Color(0x07303c) },
      uShallow: { value: new THREE.Color(0x1fb0a2) },
      uHaze: { value: new THREE.Color(0xffb27a) },
    },
    vertexShader: waterVert,
    fragmentShader: waterFrag,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = WATER_Y;
  mesh.renderOrder = 0;
  return mesh;
}

/* ------------------------------------------------------------------ dock */
function buildDock(wood) {
  const g = new THREE.Group();
  const len = DECK_Z0 - DECK_Z1;
  const deckMat = new THREE.MeshStandardMaterial({ map: wood, roughness: 0.82, metalness: 0.05 });
  wood.repeat.set(2, 46);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.34, len), deckMat);
  deck.position.set(0, -0.17, (DECK_Z0 + DECK_Z1) / 2);
  g.add(deck);

  const postGeo = new THREE.CylinderGeometry(0.14, 0.17, 1.8, 8);
  const postMat = new THREE.MeshStandardMaterial({ color: 0x5d3a22, roughness: 0.9 });
  const step = 6.2;
  const count = Math.floor(len / step) * 2;
  const posts = new THREE.InstancedMesh(postGeo, postMat, count);
  const m = new THREE.Matrix4();
  let i = 0;
  for (let z = DECK_Z0 - 3; z > DECK_Z1; z -= step) {
    for (const x of [-1.86, 1.86]) {
      if (i >= count) break;
      m.makeTranslation(x, 0.42, z);
      posts.setMatrixAt(i++, m);
    }
  }
  posts.count = i;
  posts.instanceMatrix.needsUpdate = true;
  g.add(posts);

  // rope line between posts, both sides
  const ropeMat = new THREE.MeshStandardMaterial({ color: 0x8a6640, roughness: 1 });
  for (const x of [-1.86, 1.86]) {
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, len - 6, 4), ropeMat);
    rope.rotation.x = Math.PI / 2;
    rope.position.set(x, 0.95, (DECK_Z0 - 3 + DECK_Z1) / 2);
    g.add(rope);
  }
  return g;
}

/* ------------------------------------------------------------------ queen */
export function buildQueen(glow) {
  const g = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({
    color: 0xc2101a, roughness: 0.38, metalness: 0.32, emissive: 0x30040a, emissiveIntensity: 0.9,
  });
  const gold = new THREE.MeshStandardMaterial({
    color: 0xffc24a, roughness: 0.25, metalness: 0.85, emissive: 0x4a2a00, emissiveIntensity: 0.7,
  });
  const skin = new THREE.MeshStandardMaterial({ color: 0xffe2c6, roughness: 0.65 });

  const profile = [
    [0.00, 0.00], [0.52, 0.015], [0.57, 0.10], [0.50, 0.30], [0.38, 0.62],
    [0.24, 0.88], [0.19, 1.02], [0.29, 1.12], [0.26, 1.20], [0.17, 1.24],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const gown = new THREE.Mesh(new THREE.LatheGeometry(profile, 40), red);
  g.add(gown);

  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.035, 8, 28), gold);
  belt.rotation.x = Math.PI / 2;
  belt.position.y = 0.92;
  g.add(belt);

  const collar = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.22, 20, 1, true), gold);
  collar.position.y = 1.22;
  g.add(collar);

  const HEAD_R = 0.152, HEAD_Y = 1.40;
  const head = new THREE.Mesh(new THREE.SphereGeometry(HEAD_R, 24, 18), skin);
  head.position.y = HEAD_Y;
  g.add(head);

  // eyes on her face: she has to be readable as facing YOU during the intro
  const eyeDot = new THREE.MeshBasicMaterial({ color: 0x2a1108 });
  const faceEyes = [];
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8), eyeDot);
    eye.position.set(sx * 0.052, 1.435, -HEAD_R * 0.93);
    g.add(eye);
    faceEyes.push(eye);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.008, 0.012), eyeDot);
    brow.position.set(sx * 0.052, 1.468, -HEAD_R * 0.9);
    brow.rotation.z = -sx * 0.18;
    g.add(brow);
  }

  // A crown has to sit ON the skull, not float around it: the band radii are the head radius at
  // the band's top and bottom edges, so the ring hugs the curve of her head.
  // the band's BOTTOM edge is exactly the head's radius at that height, so it meets the skull with
  // no gap; above that line the cylinder stands proud of the shrinking sphere and reads as a crown
  const bandBot = 1.492, bandTop = 1.578;
  const rAt = (y) => Math.sqrt(Math.max(0.0004, HEAD_R * HEAD_R - (y - HEAD_Y) * (y - HEAD_Y)));
  const bandR = rAt(bandBot) * 1.004;
  const crownBand = new THREE.Mesh(
    new THREE.CylinderGeometry(bandR, bandR, bandTop - bandBot, 24, 1, true),
    gold
  );
  crownBand.material.side = THREE.DoubleSide;
  crownBand.position.y = (bandTop + bandBot) / 2;
  g.add(crownBand);

  const spikeBase = bandTop - 0.004;
  const spikeR = bandR * 0.93;
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.115, 6), gold);
    spike.position.set(Math.cos(a) * spikeR, spikeBase + 0.052, Math.sin(a) * spikeR);
    spike.rotation.z = -Math.cos(a) * 0.16;
    spike.rotation.x = Math.sin(a) * 0.16;
    g.add(spike);
  }
  const bandRim = new THREE.Mesh(new THREE.TorusGeometry(bandR, 0.011, 6, 24), gold);
  bandRim.rotation.x = Math.PI / 2;
  bandRim.position.y = bandTop - 0.004;
  g.add(bandRim);

  // mouth: a dark arc, closed by default so the smile can open it
  const mouthMat = new THREE.MeshBasicMaterial({ color: 0x51130f });
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.011, 8, 20, Math.PI), mouthMat);
  mouth.rotation.z = Math.PI;                     // opens upward = a smile
  mouth.position.set(0, HEAD_Y - 0.028, -HEAD_R * 0.90);
  mouth.scale.set(1, 0.001, 1);
  g.add(mouth);

  // arms holding the blaster
  // arms sit OUTSIDE the gown profile or they disappear inside it
  const armGeo = new THREE.CapsuleGeometry(0.058, 0.30, 4, 8);
  const arms = {};
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(armGeo, red);
    arm.position.set(s * 0.22, 1.00, -0.13);
    arm.rotation.x = -1.32;          // reaching forward to the blaster, not out to the side
    arm.rotation.z = s * 0.14;
    arm.userData.rest = { x: -1.32, z: s * 0.14 };
    g.add(arm);
    arms[s < 0 ? 'left' : 'right'] = arm;
  }
  // a dedicated waving arm: pivot at the shoulder, so it actually reaches above her head
  const waveGeo = new THREE.CapsuleGeometry(0.062, 0.46, 4, 8);
  waveGeo.translate(0, 0.27, 0);
  const waveArm = new THREE.Mesh(waveGeo, red);
  waveArm.position.set(0.30, 1.05, -0.06);
  waveArm.rotation.set(-0.15, 0, -0.45);
  waveArm.visible = false;
  g.add(waveArm);
  const waveHand = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 10), skin);
  waveHand.position.set(0, 0.58, 0);
  waveArm.add(waveHand);

  const blaster = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.34), gold);
  blaster.position.set(0, 0.98, -0.42);
  g.add(blaster);
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.075, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xff3b30 })
  );
  core.position.set(0, 0.98, -0.60);
  g.add(core);

  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glow, color: 0xff5533, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  halo.scale.setScalar(1.5);
  halo.position.copy(core.position);
  g.add(halo);

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.98, -0.66);
  g.add(muzzle);

  const crownGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glow, color: 0xffaa44, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  crownGlow.scale.setScalar(0.72);
  crownGlow.position.y = 1.60;
  g.add(crownGlow);

  g.scale.setScalar(1.12);
  g.userData.muzzle = muzzle;
  g.userData.arms = arms;
  g.userData.waveArm = waveArm;
  g.userData.mouth = mouth;
  g.userData.faceEyes = faceEyes;
  g.userData.blaster = blaster;
  g.userData.halo = halo;
  return g;
}

/* ------------------------------------------------------------------ shark */
// A shark is not a scaled sphere. The body is lofted from elliptical sections along a taper
// profile so it is slim at the shoulders and pinches to a thin caudal peduncle; the fins are
// extruded shapes with real sweep, and the tail is a crescent with two lobes.
const BODY_LEN = 5.0;          // nose (z = +2.6) to caudal peduncle (z = -2.4)
const NOSE_Z = 2.6;
const PED_Z = -2.4;
const SECTION_R = [            // t = 0 at the nose, 1 at the peduncle
  [0.00, 0.012], [0.04, 0.062], [0.10, 0.132], [0.19, 0.215],
  [0.30, 0.272], [0.42, 0.278], [0.55, 0.248], [0.68, 0.192],
  [0.79, 0.136], [0.89, 0.086], [0.96, 0.058], [1.00, 0.042],
];
const WIDTH_K = 0.86;          // narrower than tall, like a shark
const HEIGHT_K = 1.16;

function radiusAt(t) {
  const P = SECTION_R;
  if (t <= P[0][0]) return P[0][1];
  for (let i = 1; i < P.length; i++) {
    if (t <= P[i][0]) {
      const [t0, r0] = P[i - 1], [t1, r1] = P[i];
      const k = (t - t0) / (t1 - t0);
      const sm = k * k * (3 - 2 * k);
      return r0 + (r1 - r0) * sm;
    }
  }
  return P[P.length - 1][1];
}

function buildSharkBody() {
  const RINGS = 30, SIDES = 18;
  const pos = [];
  const idx = [];
  for (let i = 0; i <= RINGS; i++) {
    const t = i / RINGS;
    const z = NOSE_Z + (PED_Z - NOSE_Z) * t;
    const r = radiusAt(t);
    // a slight downward belly line and an upward back, so the body is not a tube
    const back = 0.06 * Math.sin(Math.PI * Math.min(1, t * 1.15));
    for (let j = 0; j < SIDES; j++) {
      const a = (j / SIDES) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      pos.push(r * WIDTH_K * ca * (sa < 0 ? 1.04 : 1.0), r * HEIGHT_K * sa + back, z);
    }
  }
  for (let i = 0; i < RINGS; i++) {
    for (let j = 0; j < SIDES; j++) {
      const a = i * SIDES + j;
      const b = i * SIDES + ((j + 1) % SIDES);
      const c = (i + 1) * SIDES + j;
      const d = (i + 1) * SIDES + ((j + 1) % SIDES);
      idx.push(a, c, b, b, c, d);
    }
  }
  // caps
  const noseTip = pos.length / 3;
  pos.push(0, 0.02, NOSE_Z + 0.16);
  const tailTip = pos.length / 3;
  pos.push(0, 0.0, PED_Z - 0.05);
  for (let j = 0; j < SIDES; j++) {
    idx.push(noseTip, j, (j + 1) % SIDES);
    const base = RINGS * SIDES;
    idx.push(tailTip, base + ((j + 1) % SIDES), base + j);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** An extruded fin from a 2-D outline in the Y/Z plane, with a little thickness in X. */
function finGeometry(points, thickness = 0.035) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness, bevelEnabled: false, curveSegments: 2,
  });
  geo.translate(0, 0, -thickness / 2);
  geo.rotateY(-Math.PI / 2);      // outline +x becomes +z (forward), so fins sweep BACK
  geo.computeVertexNormals();
  return geo;
}

const SHARK_GEO = {};

function sharkGeo() {
  if (SHARK_GEO.body) return SHARK_GEO;
  SHARK_GEO.body = buildSharkBody();

  // dorsal: tall, swept back, thin
  SHARK_GEO.dorsal = finGeometry([
    [0.46, 0.00], [-0.40, 0.00], [-0.44, 0.40], [-0.24, 0.26],
  ], 0.042);

  // pectoral: long, angled back and down
  SHARK_GEO.pectoral = finGeometry([
    [0.26, 0.00], [-0.30, 0.00], [-0.52, -0.44], [-0.26, -0.20],
  ], 0.034);

  // pelvic: small
  SHARK_GEO.pelvic = finGeometry([
    [0.16, 0.0], [-0.12, 0.0], [-0.30, -0.22], [-0.14, -0.12],
  ], 0.028);

  // caudal: crescent — long upper lobe, short lower lobe
  SHARK_GEO.caudalUpper = finGeometry([
    [0.14, 0.03], [-0.46, 0.74], [-0.26, 0.26], [-0.12, 0.03],
  ], 0.04);
  SHARK_GEO.caudalLower = finGeometry([
    [0.14, -0.03], [-0.26, -0.46], [-0.14, -0.16], [-0.08, -0.03],
  ], 0.04);
  return SHARK_GEO;
}

export function createShark({ glow, disc }) {
  const G = sharkGeo();
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({
    color: 0x123a41, roughness: 0.66, metalness: 0.14,
    transparent: true, opacity: 0.66, depthWrite: false, side: THREE.DoubleSide,
  });
  const finMat = new THREE.MeshStandardMaterial({
    color: 0x0f3238, roughness: 0.58, metalness: 0.2, transparent: true, opacity: 0.92,
    side: THREE.DoubleSide,
  });

  const body = new THREE.Mesh(G.body, skin);
  body.renderOrder = 2;
  g.add(body);

  // where the body is thickest, so fins sit flush with the surface
  const backY = (t) => radiusAt(t) * HEIGHT_K + 0.06 * Math.sin(Math.PI * Math.min(1, t * 1.15));
  const zAt = (t) => NOSE_Z + (PED_Z - NOSE_Z) * t;
  const sideX = (t) => radiusAt(t) * WIDTH_K;

  const dorsal = new THREE.Mesh(G.dorsal, finMat);
  dorsal.position.set(0, backY(0.40) * 0.93, zAt(0.40) - 0.18);
  g.add(dorsal);

  for (const sx of [-1, 1]) {
    const pec = new THREE.Mesh(G.pectoral, finMat);
    pec.position.set(sx * sideX(0.30) * 0.55, -radiusAt(0.30) * 0.55, zAt(0.30));
    pec.rotation.z = sx * 0.35;
    pec.rotation.y = sx * 0.42;
    pec.scale.x = sx;
    g.add(pec);

    const pel = new THREE.Mesh(G.pelvic, finMat);
    pel.position.set(sx * sideX(0.66) * 0.6, -radiusAt(0.66) * 0.6, zAt(0.66));
    pel.rotation.z = sx * 0.3;
    pel.rotation.y = sx * 0.3;
    pel.scale.x = sx;
    g.add(pel);
  }

  const pedY = 0.02;
  const up = new THREE.Mesh(G.caudalUpper, finMat);
  up.position.set(0, pedY, PED_Z - 0.02);
  g.add(up);
  const lo = new THREE.Mesh(G.caudalLower, finMat);
  lo.position.set(0, pedY, PED_Z - 0.02);
  g.add(lo);

  // eyes — the target, set into the sides of the head
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2a12, transparent: true, opacity: 1 });
  const eyes = [];
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.062, 12, 10), eyeMat);
    eye.position.set(sx * sideX(0.13) * 0.80, 0.06, zAt(0.13));
    g.add(eye);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glow, color: 0xff3311, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    halo.scale.setScalar(1.0);
    halo.position.copy(eye.position);
    g.add(halo);
    eyes.push({ eye, halo });
  }

  // snout laser
  const emitter = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xff5533, transparent: true, opacity: 1 })
  );
  emitter.position.set(0, 0.03, NOSE_Z + 0.14);
  g.add(emitter);

  const emitterGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glow, color: 0xff3b18, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  emitterGlow.scale.setScalar(1.4);
  emitterGlow.position.copy(emitter.position);
  g.add(emitterGlow);

  // a gill line behind the head, for readability
  const gillMat = new THREE.MeshBasicMaterial({ color: 0x081c20, transparent: true, opacity: 0.5 });
  for (let i = 0; i < 3; i++) {
    const gill = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.16, 0.02), gillMat);
    gill.position.set(sideX(0.26) * 0.98, 0.02, zAt(0.26) - i * 0.055);
    gill.rotation.z = 0.2;
    g.add(gill);
  }

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: disc, transparent: true, opacity: 0.5, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(2.6, 6.0, 1);
  shadow.position.y = WATER_Y + 0.02;
  shadow.renderOrder = 1;

  const head = new THREE.Object3D();
  head.position.set(0, 0.06, 2.05);
  g.add(head);

  return { group: g, eyes, emitter, emitterGlow, head, shadow, skin, body, fins: [dorsal] };
}

/* ------------------------------------------------------------------ world */
export function createWorld(renderer) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xffb279, 130, 620);

  const camera = new THREE.PerspectiveCamera(56, 1, 0.1, 3000);
  camera.position.set(0, 2.9, 10);

  const glow = glowTexture();
  const disc = discTexture();

  // sky dome
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1200, 32, 20),
    new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false, depthWrite: false })
  );
  scene.add(sky);

  // sun
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glow, color: 0xffd9a8, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, fog: false,
  }));
  sun.scale.setScalar(165);
  sun.position.copy(SUN_DIR).multiplyScalar(900);
  sun.position.y = Math.max(sun.position.y, 26);
  scene.add(sun);

  // clouds
  const cloudTex = cloudTexture();
  const clouds = [];
  for (let i = 0; i < 18; i++) {
    const warm = Math.random();
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: cloudTex,
      color: new THREE.Color().setHSL(0.06 - warm * 0.03, 0.35 + warm * 0.4, 0.62 + warm * 0.28),
      transparent: true, opacity: 0.6 + Math.random() * 0.35, depthWrite: false, fog: false,
    }));
    const high = i > 13;
    s.position.set(-620 + Math.random() * 1240, (high ? 110 : 24) + Math.random() * 90, -400 - Math.random() * 320);
    s.scale.set(180 + Math.random() * 300, 54 + Math.random() * 70, 1);
    s.userData.vx = 0.6 + Math.random() * 1.2;
    scene.add(s);
    clouds.push(s);
  }

  // distant palms / island
  const palmMat = new THREE.MeshBasicMaterial({
    map: palmTexture(), transparent: true, depthWrite: false, fog: true, color: 0x4a3040,
  });
  for (let i = 0; i < 3; i++) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(760, 96), palmMat);
    p.position.set(-250 - i * 190, 15 - i * 3, -560 - i * 90);
    scene.add(p);
  }

  const water = createWater(glow);
  scene.add(water);

  const wood = tex(woodTexture());
  scene.add(buildDock(wood));

  const queen = buildQueen(glow);
  scene.add(queen);

  // lights
  const sunLight = new THREE.DirectionalLight(0xffb478, 2.4);
  sunLight.position.copy(SUN_DIR).multiplyScalar(120);
  scene.add(sunLight);
  scene.add(new THREE.HemisphereLight(0xffc7a0, 0x3a1a12, 0.75));
  scene.add(new THREE.AmbientLight(0x60303a, 0.5));

  const tmpV = new THREE.Vector3();

  function resize(w, h) {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }

  function updateEnv(dt, time, queenZ) {
    water.material.uniforms.uTime.value = time;
    // camera rides behind and above the queen
    const targetZ = queenZ + 8.4;
    camera.position.lerp(tmpV.set(0, 2.65, targetZ), 1 - Math.exp(-dt * 4.0));
    camera.lookAt(0, 0.9, queenZ - 26);
    for (const c of clouds) {
      c.position.x += c.userData.vx * dt * 4;
      if (c.position.x > 900) c.position.x = -900;
    }
  }

  return { scene, camera, water, queen, sun, clouds, glow, disc, resize, updateEnv, sunDir: SUN_DIR };
}

/* ------------------------------------------------------------------ laser beam */
export function createBeam({ color = 0xff3b22, radius = 0.09, opacity = 1 } = {}) {
  const geo = new THREE.CylinderGeometry(radius, radius, 1, 8, 1, true);
  geo.translate(0, 0.5, 0);
  const mat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, blending: THREE.AdditiveBlending,
    depthWrite: false, fog: false, toneMapped: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.visible = false;
  mesh.renderOrder = 20;
  return mesh;
}

const UP = new THREE.Vector3(0, 1, 0);
export function setBeam(mesh, a, b) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  if (len < 1e-4) { mesh.visible = false; return; }
  mesh.position.copy(a);
  mesh.quaternion.setFromUnitVectors(UP, dir.clone().normalize());
  mesh.scale.set(1, len, 1);
  mesh.visible = true;
}
