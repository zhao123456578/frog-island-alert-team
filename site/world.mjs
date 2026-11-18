import * as THREE from 'three';
import { ACTION } from './actions.mjs';

export { ACTION };

export const PAL = {
  asphalt: 0x8d949e, pavement: 0xbac1ca, plinth: 0xa9b1bb,
  wallA: 0xeae4d6, wallB: 0xd8dee6, wallC: 0xcfd8c8, roof: 0x6f7f8c,
  brick: 0xc98a6b, glass: 0x9dc6da, steel: 0x8a929c,
  leaf: 0x55a86e, trunk: 0x7a5c46,
  safe: 0x2fbf71, alert: 0xf0902a, danger: 0xd94b3b, info: 0x3b82c4,
};

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.86, metalness: 0.02, ...extra });

// 控制器允许的踏步高度，矮于此的盒子（站前台地、马路牙子）直接走上去。
// 场景里的交互点半径按这个值判埋没，两边共用一个数才不会各说各话。
export const STEP_UP = 0.45;

function box(scene, colliders, o) {
  const { x, z, w, d, h, y = 0, color, solid = true, rotY = 0, name } = o;
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y + h / 2, z);
  m.rotation.y = rotY;
  m.castShadow = true;
  m.receiveShadow = true;
  if (name) m.name = name;
  scene.add(m);
  // 斜放的盒子用旋转后的包围盒近似：把四角转出来再取 min/max
  if (solid) {
    const c = Math.cos(rotY), s = Math.sin(rotY);
    const ex = (Math.abs(c) * w + Math.abs(s) * d) / 2;
    const ez = (Math.abs(s) * w + Math.abs(c) * d) / 2;
    colliders.push({ x, z, ex, ez, y0: y, y1: y + h });
  }
  return m;
}

function building(scene, colliders, x, z, w, d, h, wall, floors = 4) {
  box(scene, colliders, { x, z, w, d, h, color: wall });
  box(scene, colliders, { x, z, w: w + 0.5, d: d + 0.5, h: 0.35, y: h, color: PAL.roof, solid: false });
  const bandMat = mat(PAL.glass, { roughness: 0.35, metalness: 0.25 });
  for (let f = 1; f <= floors; f++) {
    const y = (h / (floors + 0.4)) * f;
    if (y > h - 0.8) break;
    for (const [sx, sz, rw, rd] of [[0, d / 2 + 0.03, w * 0.82, 0.06], [0, -d / 2 - 0.03, w * 0.82, 0.06],
      [w / 2 + 0.03, 0, 0.06, d * 0.82], [-w / 2 - 0.03, 0, 0.06, d * 0.82]]) {
      const g = new THREE.Mesh(new THREE.BoxGeometry(rw, 0.5, rd), bandMat);
      g.position.set(x + sx, y, z + sz);
      scene.add(g);
    }
  }
}

function tree(scene, colliders, x, z, s = 1) {
  const t = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * s, 0.16 * s, 1.1 * s, 7), mat(PAL.trunk));
  t.position.set(x, 0.55 * s, z);
  t.castShadow = true;
  scene.add(t);
  const c = new THREE.Mesh(new THREE.SphereGeometry(0.85 * s, 12, 9), mat(PAL.leaf));
  c.position.set(x, 1.5 * s, z);
  c.castShadow = true;
  scene.add(c);
  colliders.push({ x, z, ex: 0.25 * s, ez: 0.25 * s, y0: 0, y1: 2 * s });
}

function lamp(scene, x, z) {
  const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 4.2, 6), mat(PAL.steel));
  p.position.set(x, 2.1, z);
  p.castShadow = true;
  scene.add(p);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xfff2cc, emissive: 0xffd98a, emissiveIntensity: 0.9 }));
  head.position.set(x, 4.2, z);
  scene.add(head);
}

function marker(scene, type, correct, x, z, y = 0) {
  const col = ACTION[type].color;
  const g = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.72, 0.06, 8, 28),
    new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.75, roughness: 0.5 })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.06;
  g.add(ring);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.34, 2.4, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.26, side: THREE.DoubleSide, depthWrite: false })
  );
  beam.position.y = 1.2;
  g.add(beam);
  g.position.set(x, y, z);
  g.userData.ring = ring;
  g.userData.beam = beam;
  scene.add(g);
  return g;
}

// 街区：西北教学楼 / 东北沿街商铺 / 西南地铁站 / 东南住宅楼
const B = 34, ROAD = 13;
const Q = B / 2 + ROAD / 2;
const PODEST = 0.14;   // 街区台面
const DECK = 0.35;     // 地铁站前台地，比街区台面高，标记要跟着抬

export function buildWorld(scene) {
  const colliders = [];
  const points = [];
  const pulse = [];

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), mat(PAL.asphalt));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // 十字马路 + 中央路口的斑马线，四条街的走向一眼能看出来
  for (const [x, z, w, d] of [[0, 0, ROAD, 160], [0, 0, 160, ROAD]]) {
    box(scene, colliders, { x, z, w, d, h: 0.02, color: 0x7b828c, solid: false, y: 0.001 });
  }
  const stripe = mat(0xe9ecf1, { roughness: 0.7 });
  for (let i = -5; i <= 5; i++) {
    for (const [x, z] of [[i * 1.2, -Q + 1.2], [i * 1.2, Q - 1.2]]) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 2.2), stripe);
      s.position.set(x, 0.03, z);
      scene.add(s);
    }
    for (const [x, z] of [[-Q + 1.2, i * 1.2], [Q - 1.2, i * 1.2]]) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.03, 0.5), stripe);
      s.position.set(x, 0.03, z);
      scene.add(s);
    }
  }

  const block = (cx, cz) => {
    // 街区台面 0.14 m、路缘 0.3 m，都矮过 STEP_UP，所以是 solid 的：
    // 挡不住脚步，但要能被 groundAt 认成地面，否则人会陷进台面。
    box(scene, colliders, { x: cx, z: cz, w: B, d: B, h: PODEST, color: PAL.pavement });
    box(scene, colliders, { x: cx, z: cz - B / 2, w: B, d: 0.5, h: 0.3, color: PAL.plinth });
    box(scene, colliders, { x: cx, z: cz + B / 2, w: B, d: 0.5, h: 0.3, color: PAL.plinth });
    box(scene, colliders, { x: cx - B / 2, z: cz, w: 0.5, d: B, h: 0.3, color: PAL.plinth });
    box(scene, colliders, { x: cx + B / 2, z: cz, w: 0.5, d: B, h: 0.3, color: PAL.plinth });
  };

  const pt = (o) => {
    o.radius = o.radius ?? (o.type === 'triangle' ? 2.0 : 1.7);
    // 标记画在所属台面上：地铁站台比街区台面高 0.21 m，一律写 0.16 会把光圈埋进地里
    o.surf = o.surf ?? PODEST;
    o.marker = marker(scene, o.type, ACTION[o.type].correct, o.x, o.z, o.surf + 0.02);
    pulse.push(o.marker);
    points.push(o);
    return o;
  };

  // ── 西北：教学楼庭院 ─────────────────────────────────────────
  block(-Q, -Q);
  building(scene, colliders, -Q - 4, -Q - 6, 18, 12, 15, PAL.wallB, 5);
  box(scene, colliders, { x: -Q + 8, z: -Q - 12, w: 6, d: 6, h: 1.0, color: PAL.wallA, name: '旗台' });
  for (let i = 0; i < 3; i++) tree(scene, colliders, -Q + 10, -Q + 4 + i * 4, 1.1);
  lamp(scene, -Q, -Q - 2);
  // 教室里翻倒的课桌：地震时最典型的一处三角区
  for (let i = 0; i < 4; i++) {
    box(scene, colliders, { x: -Q - 12 + i * 2.2, z: -Q + 8, w: 1.8, d: 0.8, h: 0.8, color: 0xb98a5a });
  }
  pt({ id: 'desk', type: 'triangle', x: -Q - 9.5, z: -Q + 5.6, hint: '躲到课桌旁的内墙角' });
  pt({ id: 'panel', type: 'power', x: -Q - 4, z: -Q + 1.5, hint: '拉下教学楼南入口外墙的总闸' });
  pt({ id: 'lab-gas', type: 'gas', x: -Q + 13, z: -Q - 6, hint: '实验室燃气总阀在东侧管井' });
  pt({ id: 'school-exit', type: 'route', x: -Q + 2, z: -Q + 14, hint: '教学楼南侧步行楼梯直通操场' });
  pt({ id: 'lift-school', type: 'elevator', x: -Q - 4, z: -Q + 1, hint: '地震时电梯会困人' });

  // ── 东北：沿街商铺 ───────────────────────────────────────────
  block(Q, -Q);
  for (let i = 0; i < 4; i++) {
    building(scene, colliders, Q - 12 + i * 8, -Q - 9, 7.4, 10, 8 + (i % 2) * 4, i % 2 ? PAL.wallC : PAL.wallA, 3);
    box(scene, colliders, { x: Q - 12 + i * 8, z: -Q - 3.4, w: 7.0, d: 1.4, h: 0.2, y: 2.6, color: i % 2 ? PAL.alert : PAL.brick, solid: false });
  }
  for (let i = 0; i < 3; i++) box(scene, colliders, { x: Q - 8 + i * 7, z: -Q + 9, w: 2.4, d: 1.0, h: 1.7, color: PAL.steel });
  lamp(scene, Q + 2, -Q + 2);
  pt({ id: 'gas', type: 'gas', x: Q - 8, z: -Q + 3, hint: '关掉液化气总阀' });
  pt({ id: 'shop-pillar', type: 'triangle', x: Q + 14, z: -Q + 2, hint: '商铺仓库承重柱内侧' });
  pt({ id: 'shop-breaker', type: 'power', x: Q - 4, z: -Q + 6, hint: '拉下商铺总配电箱' });
  pt({ id: 'shutter', type: 'route', x: Q + 12, z: -Q + 12, hint: '卷帘门已卡死，走侧门' });
  pt({ id: 'lift-shop', type: 'elevator', x: Q - 2, z: -Q - 2, hint: '货梯不能载人撤离' });

  // ── 西南：地铁站口 ───────────────────────────────────────────
  block(-Q, Q);
  // 站前台地压到 0.35 m：控制器允许 0.45 m 的踏步，玩家能直接走上去，
  // 再高就只能绕，三个交互点会全变成够不着的死点。
  box(scene, colliders, { x: -Q, z: Q, w: 16, d: 16, h: DECK, color: PAL.plinth });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(5.4, 0.7, 10, 30), mat(PAL.info, { roughness: 0.4, metalness: 0.3 }));
  ring.rotation.x = Math.PI / 2;
  ring.position.set(-Q, 1.0, Q);
  ring.castShadow = true;
  scene.add(ring);
  box(scene, colliders, { x: -Q - 12, z: Q + 8, w: 9, d: 9, h: 11, color: PAL.wallB, name: '地铁风亭' });
  for (let i = 0; i < 6; i++) {
    box(scene, colliders, { x: -Q - 3 + i, z: Q - 5, w: 1.0, d: 1.4, h: 0.35 + i * 0.0, color: PAL.pavement, solid: false });
  }
  lamp(scene, -Q - 6, Q - 6);
  pt({ id: 'stairs', type: 'route', x: -Q + 6, z: Q - 6, hint: '走步行楼梯出站' });
  pt({ id: 'underpass', type: 'triangle', x: -Q - 6, z: Q + 2, surf: DECK, hint: '通道承重柱内侧' });
  pt({ id: 'metro-gas', type: 'gas', x: -Q - 9, z: Q - 9, hint: '站厅商业区燃气阀井' });
  pt({ id: 'metro-panel', type: 'power', x: -Q + 9, z: Q + 9, hint: '拉下车站配电总闸' });
  pt({ id: 'lift-metro', type: 'elevator', x: -Q + 1, z: Q + 5, hint: '地铁直梯震时自动停运' });

  // ── 东南：住宅楼 ─────────────────────────────────────────────
  block(Q, Q);
  building(scene, colliders, Q - 8, Q - 8, 11, 11, 22, PAL.wallA, 7);
  building(scene, colliders, Q + 9, Q + 6, 10, 12, 18, PAL.wallB, 6);
  box(scene, colliders, { x: Q + 6, z: Q - 10, w: 4, d: 3, h: 2.2, color: PAL.brick, name: '车库' });
  for (let i = 0; i < 3; i++) tree(scene, colliders, Q + 2 + i * 3, Q + 14, 1.0);
  lamp(scene, Q, Q + 2);
  pt({ id: 'corner', type: 'triangle', x: Q - 2, z: Q + 3, hint: '住宅楼承重外墙的阳角' });
  pt({ id: 'main-breaker', type: 'power', x: Q + 9, z: Q - 3, hint: '拉下户内总闸' });
  pt({ id: 'kitchen-gas', type: 'gas', x: Q - 12, z: Q + 9, hint: '燃气管道在阳台外侧' });
  pt({ id: 'fire-exit', type: 'route', x: Q + 15, z: Q + 13, hint: '走消防通道出单元门' });
  pt({ id: 'lift-home', type: 'elevator', x: Q + 2, z: Q + 8, hint: '单元电梯井已变形' });

  // 中央路口的应急避难场所：震后撤离终点
  const shelter = { x: 0, z: 0, r: 4.2 };
  const pad = new THREE.Mesh(new THREE.CircleGeometry(shelter.r, 40),
    new THREE.MeshStandardMaterial({ color: PAL.safe, roughness: 0.8 }));
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(0, 0.05, 0);
  pad.receiveShadow = true;
  scene.add(pad);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 5, 8), mat(PAL.steel));
  pole.position.set(0, 2.5, 0);
  scene.add(pole);
  const flag = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.1, 0.08),
    new THREE.MeshStandardMaterial({ color: PAL.safe, emissive: PAL.safe, emissiveIntensity: 0.5 }));
  flag.position.set(1.7, 4.3, 0);
  scene.add(flag);

  // 地面疏散箭头：朝中央路口
  const arrowMat = new THREE.MeshStandardMaterial({ color: 0x7fe3c0, emissive: 0x2fbf71, emissiveIntensity: 0.5, roughness: 0.6 });
  for (const [bx, bz] of [[-Q, -Q], [Q, -Q], [-Q, Q], [Q, Q]]) {
    for (let i = 0; i < 3; i++) {
      const a = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.2, 3), arrowMat);
      a.rotation.x = -Math.PI / 2;
      const dir = Math.atan2(-bz, -bx);
      a.rotation.z = -dir + Math.PI / 2;
      const t = 0.35 + i * 0.22;
      a.position.set(bx * t, 0.06, bz * t);
      scene.add(a);
    }
  }

  return { colliders, points, pulse, shelter, spawn: { x: 0, z: 9 }, blocks: [[-Q, -Q], [Q, -Q], [-Q, Q], [Q, Q]] };
}
