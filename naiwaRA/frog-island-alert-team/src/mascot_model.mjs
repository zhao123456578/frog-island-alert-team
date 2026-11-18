import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildLoft, paint } from './naiwa_model.mjs';

export const HEIGHT_M = 1.45;

export const MCOL = {
  body: [0.62, 0.79, 0.66],
  bodyBack: [0.47, 0.68, 0.56],
  cream: [0.96, 0.92, 0.77],
  vest: [0.96, 0.57, 0.14],
  vestTrim: [0.27, 0.28, 0.30],
  reflective: [0.74, 0.76, 0.78],
  sclera: [0.99, 0.99, 0.97],
  pupil: [0.05, 0.06, 0.06],
  mouth: [0.19, 0.21, 0.19],
  lash: [0.16, 0.24, 0.19],
  ear: [0.52, 0.73, 0.60],
  mitten: [0.24, 0.28, 0.26],
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

// [u (0 sole .. 1 crown), rx half width, rz half depth, z = spine offset]
// 稳稳的大形：胯 0.30 起手，最宽 0.275 在 u0.56，往上是一条连续锥收到头顶。
// 没有脖子，也没有独立的头——脸就是这根锥的前面。
const TORSO = [
  [0.300, 0.218, 0.200, 0.004], [0.340, 0.240, 0.220, 0.010],
  [0.380, 0.245, 0.228, 0.016], [0.440, 0.262, 0.244, 0.020],
  [0.500, 0.272, 0.254, 0.024], [0.560, 0.275, 0.256, 0.024],
  [0.620, 0.268, 0.248, 0.018], [0.680, 0.250, 0.232, 0.010],
  [0.740, 0.224, 0.208, 0.002], [0.800, 0.190, 0.178, -0.004],
  [0.850, 0.163, 0.155, -0.008], [0.900, 0.145, 0.141, -0.010],
  [0.940, 0.132, 0.130, -0.012], [0.965, 0.112, 0.112, -0.014],
].map(([v, rx, rz, z]) => [0, v, z, rx, rz]);

function profileAt(u) {
  const n = TORSO.length;
  const lo = TORSO[0][1], hi = TORSO[n - 1][1];
  const i = clamp(Math.round(((clamp(u, lo, hi) - lo) / (hi - lo)) * (n - 1)), 1, n - 1);
  const a = TORSO[i - 1], b = TORSO[i];
  const t = clamp((u - a[1]) / Math.max(1e-9, b[1] - a[1]), 0, 1);
  return { rx: lerp(a[3], b[3], t), rz: lerp(a[4], b[4], t), z: lerp(a[2], b[2], t) };
}

// 体表前缘的 z。五官一律从这里推出来而不是写死坐标：
// 身体一改宽，写死的眼睛就整颗埋进肉里。
const faceZ = (u, x) => {
  const p = profileAt(u);
  return p.z + p.rz * Math.sqrt(Math.max(0, 1 - (x / p.rx) ** 2));
};

// [x, u, z, r] — 胳膊是一截短粗的锥形。上端整截埋进体表，往下才慢慢
// 鼓出来：这根锥没有肩，胳膊要是从头到尾平行地贴在体外，看着就是
// 两根粘在身上的水管。
export const ARM = [
  [0.150, 0.680, 0.000, 0.076],
  [0.212, 0.610, 0.016, 0.078],
  [0.244, 0.540, 0.034, 0.074],
  [0.256, 0.478, 0.050, 0.064],
];

// [x, u, z, rx, rz] — 短粗外八，最后一站 z 往前顶、rz 拉长成一只脚
export const LEG = [
  [0.072, 0.330, 0.010, 0.108, 0.112], [0.092, 0.250, 0.008, 0.094, 0.098],
  [0.108, 0.170, 0.006, 0.084, 0.088], [0.118, 0.090, 0.004, 0.078, 0.084],
  [0.122, 0.030, 0.030, 0.072, 0.096],
];

const EYE_U = 0.812, EYE_X = 0.070;
// 眼睛是贴在脸上的扁透镜，不是挂在头上的球：z 向半径只有 0.013，
// 中心压进体表 1 毫米，整颗只鼓出来 0.012。
const EYE = { cx: EYE_X, cy: EYE_U, cz: faceZ(EYE_U, EYE_X) + 0.001, rx: 0.050, ry: 0.056, rz: 0.013 };
const LID = 0.014; // 半睁：眼皮压过瞳孔上沿，死鱼眼的全部灵魂在这一个数上

// 嘴是一条横向的扁管，不是三个点。半径 4 毫米在 1.45 米身上缩到游戏里
// 直接消失，而且三个点连不成一条嘴。
const MOUTH_U = 0.766;
const MOUTH_R = 0.0085;
const MOUTH = [-0.048, -0.024, 0, 0.024, 0.048].map((x) => [
  x,
  MOUTH_U + 0.004 * Math.abs(x) / 0.048,
  faceZ(MOUTH_U, Math.abs(x)) + 0.003,
  MOUTH_R,
  MOUTH_R,
]);

const WRIST = ARM[ARM.length - 1];
const PAW = [
  new THREE.Vector3(WRIST[0], WRIST[1], WRIST[2]),
  new THREE.Vector3(-WRIST[0], WRIST[1], WRIST[2]),
];
const SOLE = [new THREE.Vector3(0.122, 0.032, 0.040), new THREE.Vector3(-0.122, 0.032, 0.040)];

const EAR_U = 0.944, EAR_X = 0.068;

function frontness(p, u) {
  const pr = profileAt(u);
  return { sx: p.x / pr.rx, sz: (p.z - pr.z) / pr.rz };
}

// 反光背心：整圈套头围兜，前面不留大口，也不做肩带。
// 这根锥没有脖子也没有肩，肩带只会画成眼睛下面两道橙色泪痕。
// 留大口的话橙色只剩两片肩甲；下摆压到 u0.52 才既盖住胸又把圆肚皮留住。
function vestAt(p, u, sx, sz) {
  const hem = 0.478 + 0.022 * Math.abs(sx);
  const top = 0.700 - 0.020 * Math.abs(sx);
  const band = smoothstep(hem - 0.014, hem + 0.014, u) * smoothstep(top + 0.014, top - 0.014, u);
  // 反光条和滚边都要留出橙色上下沿：占满整圈就变成一道白带子
  const mid = (hem + top) / 2;
  const retro = smoothstep(0.022, 0.011, Math.abs(u - mid)) * band;
  const trim = Math.max(
    smoothstep(0.016, 0.006, Math.abs(u - hem)) * band,
    smoothstep(0.016, 0.006, Math.abs(u - top)) * band,
  );
  return { t: band, trim, retro };
}

function torsoColor(p) {
  const u = p.y;
  const { sx, sz } = frontness(p, u);

  let c = mix3(MCOL.bodyBack, MCOL.body, smoothstep(-0.4, 0.5, sz));

  // 兜帽线：越往上奶白越往中间收，到眉眼处只剩脸正中一块
  const hood = 0.55 + 0.12 * smoothstep(0.70, 0.95, u);
  c = mix3(c, MCOL.cream,
    smoothstep(hood, hood + 0.13, sz) * smoothstep(0.985, 0.950, u) * smoothstep(0.295, 0.330, u));

  const v = vestAt(p, u, sx, sz);
  c = mix3(c, MCOL.vest, v.t);
  c = mix3(c, MCOL.reflective, v.retro);
  c = mix3(c, MCOL.vestTrim, v.trim * v.t);

  return c;
}

// 四肢不参与肚皮和背心的分区，否则腿上会长出一块奶白
function limbColor(p, pawAt, pawR, pawCol) {
  const { sz } = frontness(p, p.y);
  let c = mix3(MCOL.bodyBack, MCOL.body, smoothstep(-0.4, 0.5, sz));
  if (pawAt) c = mix3(c, pawCol, smoothstep(pawR, pawR * 0.62, p.distanceTo(pawAt)));
  return c;
}

// 眼皮用同一套阈值画在巩膜和瞳孔两个球上，切线才对得上；
// 分开做的话要么瞳孔被埋一半，要么眼皮悬在眼睛前面。
// dx 用 |p.x| 减固定半距，不能再乘左右号——乘了左眼恒等于压到底，
// 两只眼的眼皮就不是同一条弧线。
function lidEdge(p) {
  const dx = Math.abs(p.x) - EYE.cx;
  return EYE.cy + LID - 0.020 * Math.min(1, (dx / 0.046) ** 2);
}

// 眼皮和头顶同色，不加一道睫毛线的话眼睛整块糊进脸里，缩到游戏里就看不见
// 白眼珠和奶白脸只差一点，远景里必须沿椭球侧影线再勾一圈边
function eyeShade(p, base, rim = false) {
  const thr = lidEdge(p);
  const lid = smoothstep(thr, thr + 0.007, p.y);
  const lash = smoothstep(0.0075, 0.0015, Math.abs(p.y - thr));
  const c = mix3(mix3(base, MCOL.body, lid), MCOL.lash, lash * 0.9);
  if (!rim) return c;
  const dx = (Math.abs(p.x) - EYE.cx) / EYE.rx;
  const dy = (p.y - EYE.cy) / EYE.ry;
  return mix3(c, MCOL.lash, smoothstep(0.66, 0.92, Math.min(1, Math.hypot(dx, dy))));
}

// 每个部件带上归属标签再交给蒙皮：合并之后就问不出这一片肉是胳膊还是肚子了
function buildParts() {
  const parts = [];
  const add = (g, part, fn) => parts.push({ g: paint(g, fn), part });

  add(buildLoft(TORSO, { radial: 44, perSpan: 6, capAxial: [0.036, 0.072] }), 'torso', torsoColor);

  for (const s of [1, -1]) {
    const side = s > 0 ? 'R' : 'L';
    add(
      buildLoft(ARM.map(([x, y, z, r]) => [s * x, y, z, r, r]), { radial: 24, perSpan: 6, capAxial: [0.062, 0.054] }),
      `arm${side}`, (p) => limbColor(p, PAW[s > 0 ? 0 : 1], 0.076, MCOL.mitten));
    add(
      buildLoft(LEG.map(([x, y, z, rx, rz]) => [s * x, y, z, rx, rz]), { radial: 22, perSpan: 5, capAxial: [0.048, 0.056] }),
      `leg${side}`, (p) => limbColor(p, SOLE[s > 0 ? 0 : 1], 0.088, MCOL.ear));

    const eye = new THREE.SphereGeometry(1, 30, 22);
    eye.scale(EYE.rx, EYE.ry, EYE.rz);
    eye.translate(s * EYE.cx, EYE.cy, EYE.cz);
    add(eye, 'head', (p) => eyeShade(p, MCOL.sclera, true));

    // 瞳孔只有眼白的一半高，留出白眼珠才有那副没睡醒的样子
    const pupil = new THREE.SphereGeometry(1, 22, 18);
    pupil.scale(0.024, 0.030, 0.011);
    pupil.translate(s * EYE.cx, EYE.cy - 0.004, EYE.cz + EYE.rz + 0.002);
    add(pupil, 'head', (p) => eyeShade(p, MCOL.pupil));

    // 头顶两个小耳突，只是鼓一下，不做独立的耳朵
    const ear = new THREE.SphereGeometry(1, 16, 12);
    ear.scale(0.034, 0.026, 0.030);
    ear.translate(s * EAR_X, EAR_U, profileAt(EAR_U).z + 0.010);
    add(ear, 'head', () => MCOL.ear);
  }

  add(buildLoft(MOUTH, { radial: 8, perSpan: 10 }), 'head', () => MCOL.mouth);
  return parts;
}

// 脚底坐地 + 缩放到 heightM，返回这个拟合矩阵，骨骼也走同一个
function fitOf(parts, heightM) {
  const probe = mergeGeometries(parts.map((p) => p.g), false);
  probe.computeBoundingBox();
  const bb = probe.boundingBox;
  const k = heightM / (bb.max.y - bb.min.y);
  const m = new THREE.Matrix4().makeScale(k, k, k);
  m.multiply(new THREE.Matrix4().makeTranslation(0, -bb.min.y, 0));
  return { m, k, minY: bb.min.y };
}

export function buildMascotGeometry(heightM = HEIGHT_M) {
  const parts = buildParts();
  const { m } = fitOf(parts, heightM);
  const g = mergeGeometries(parts.map((p) => p.g.clone().applyMatrix4(m)), false);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

export { buildParts, fitOf };
