import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildSkeleton, skinParts, clip, eulerTrack, vecTrack, squashTrack, smooth } from './character_rig.mjs';
import { buildParts, fitOf, ARM, LEG, HEIGHT_M } from './mascot_model.mjs';

const TAU = Math.PI * 2;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const seg = (t, a, b) => clamp01((t - a) / (b - a));

// 分段曲线：给一串 [时间, 值]，段内用 smoothstep 插值。
// 跳跃落地这种非周期动作靠正弦拼不出来，只能按关键帧写。
function curve(t, pts) {
  if (t <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (t <= pts[i][0]) {
      const [t0, v0] = pts[i - 1], [t1, v1] = pts[i];
      return v0 + (v1 - v0) * smooth(t0, t1, t);
    }
  }
  return pts[pts.length - 1][1];
}

const HIP_U = 0.30, CHEST_U = 0.55, HEAD_U = 0.76;

export const BONE_NAMES = ['root', 'hips', 'spine', 'chest', 'head', 'armL', 'armR', 'legL', 'legR'];

export function buildCharacter(heightM = HEIGHT_M) {
  const parts = buildParts();
  const { m, k, minY } = fitOf(parts, heightM);
  const fy = (u) => (u - minY) * k;
  for (const p of parts) p.g.applyMatrix4(m);

  // 肩和髋的骨节直接取建模时的第一站，这样模型一改站位骨骼跟着走
  const sh = [ARM[0][0] * k, fy(ARM[0][1]), ARM[0][2] * k];
  const hip = [LEG[0][0] * k, fy(LEG[0][1]), LEG[0][2] * k];
  const sk = buildSkeleton([
    { name: 'root', pos: [0, 0, 0] },
    { name: 'hips', parent: 'root', pos: [0, fy(HIP_U), 0] },
    { name: 'spine', parent: 'hips', pos: [0, 0, 0] },
    { name: 'chest', parent: 'spine', pos: [0, fy(CHEST_U) - fy(HIP_U), 0] },
    { name: 'head', parent: 'chest', pos: [0, fy(HEAD_U) - fy(CHEST_U), 0] },
    { name: 'armR', parent: 'chest', pos: [sh[0], sh[1] - fy(CHEST_U), sh[2]] },
    { name: 'armL', parent: 'chest', pos: [-sh[0], sh[1] - fy(CHEST_U), sh[2]] },
    { name: 'legR', parent: 'hips', pos: [hip[0], hip[1] - fy(HIP_U), hip[2]] },
    { name: 'legL', parent: 'hips', pos: [-hip[0], hip[1] - fy(HIP_U), hip[2]] },
  ]);

  // 权重一律按最终空间的 y 分段。胳膊腿几乎是垂着的，沿 y 插值和沿
  // 骨轴插值差别看不出来，省掉一套胶囊距离计算。
  function weightOf(part, p) {
    const y = p.y;
    if (part === 'torso') {
      if (y <= fy(HIP_U)) return [['hips', 1]];
      if (y < fy(CHEST_U)) {
        const t = smooth(fy(HIP_U) - 0.012, fy(HIP_U) + 0.012, y);
        return [['spine', t], ['hips', 1 - t]];
      }
      if (y < fy(HEAD_U)) {
        const t = smooth(fy(CHEST_U) - 0.012, fy(CHEST_U) + 0.012, y);
        return [['chest', t], ['spine', 1 - t]];
      }
      const t = smooth(fy(HEAD_U) - 0.012, fy(HEAD_U) + 0.012, y);
      return [['head', t], ['chest', 1 - t]];
    }
    if (part === 'armL' || part === 'armR') {
      const t = smooth(fy(0.655), fy(0.700), y);
      return [[part, 1 - t], ['chest', t]];
    }
    if (part === 'legL' || part === 'legR') {
      const t = smooth(fy(0.362), fy(0.318), y);
      return [[part, t], ['hips', 1 - t]];
    }
    return [['head', 1]];
  }

  const g = mergeGeometries(skinParts(parts, sk, weightOf), false);
  g.computeBoundingBox();
  g.computeBoundingSphere();

  const mesh = new THREE.SkinnedMesh(
    g,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, name: 'MascotSkin' })
  );
  mesh.name = 'Mascot';
  sk.root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(sk.bones);
  mesh.add(sk.root);
  mesh.bind(skeleton, new THREE.Matrix4());

  return { mesh, skeleton, bones: sk.bones, byName: sk.byName, clips: makeClips() };
}

export function makeClips() {
  const idle = 3.4, iw = TAU / idle;
  const wr = 0.96, ww = TAU / wr;
  const ru = 0.62, uw = TAU / ru;
  const av = 0.72, aw = TAU / av;

  const idleClip = clip('idle', idle, [
    squashTrack('spine', idle, 44, (t) => 1 + 0.022 * Math.sin(iw * t)),
    eulerTrack('head', idle, 44, (t) => [
      0.012 * Math.sin(iw * t), 0.030 * Math.sin(TAU * t / 8), 0.018 * Math.sin(iw * t + 1)]),
    eulerTrack('armR', idle, 44, (t) => [0.040 * Math.sin(iw * t), 0, 0.060 + 0.020 * Math.sin(iw * t + 0.5)]),
    eulerTrack('armL', idle, 44, (t) => [0.040 * Math.sin(iw * t + 0.4), 0, -0.060 - 0.020 * Math.sin(iw * t + 0.5)]),
  ]);

  const walkClip = clip('walk', wr, [
    eulerTrack('legR', wr, 48, (t) => [0.40 * Math.sin(ww * t), 0, 0.045]),
    eulerTrack('legL', wr, 48, (t) => [0.40 * Math.sin(ww * t + Math.PI), 0, -0.045]),
    eulerTrack('armR', wr, 48, (t) => [0.30 * Math.sin(ww * t + Math.PI), 0, 0.070]),
    eulerTrack('armL', wr, 48, (t) => [0.30 * Math.sin(ww * t), 0, -0.070]),
    vecTrack('root', 'position', wr, 48, (t) => [0, 0.024 * (0.5 - 0.5 * Math.cos(2 * ww * t)), 0]),
    squashTrack('spine', wr, 48, (t) => 1 - 0.026 * (0.5 - 0.5 * Math.cos(2 * ww * t))),
    eulerTrack('spine', wr, 48, (t) => [0.055, 0.020 * Math.sin(ww * t), 0]),
    eulerTrack('head', wr, 48, (t) => [-0.055 + 0.018 * Math.sin(2 * ww * t), 0, 0]),
  ]);

  const runClip = clip('run', ru, [
    eulerTrack('legR', ru, 44, (t) => [0.86 * Math.sin(uw * t), 0, 0.060]),
    eulerTrack('legL', ru, 44, (t) => [0.86 * Math.sin(uw * t + Math.PI), 0, -0.060]),
    eulerTrack('armR', ru, 44, (t) => [0.70 * Math.sin(uw * t + Math.PI), 0, 0.120]),
    eulerTrack('armL', ru, 44, (t) => [0.70 * Math.sin(uw * t), 0, -0.120]),
    vecTrack('root', 'position', ru, 44, (t) => [0, 0.058 * (0.5 - 0.5 * Math.cos(2 * uw * t)), 0]),
    squashTrack('spine', ru, 44, (t) => 1 - 0.062 * (0.5 - 0.5 * Math.cos(2 * uw * t))),
    eulerTrack('spine', ru, 44, (t) => [0.180, 0.030 * Math.sin(uw * t), 0]),
    eulerTrack('head', ru, 44, (t) => [-0.170 + 0.025 * Math.sin(2 * uw * t), 0, 0]),
  ]);

  const jd = 1.1;
  const jumpClip = clip('jump', jd, [
    squashTrack('spine', jd, 44, (t) => curve(t, [
      [0, 1], [0.16, 0.82], [0.26, 1.16], [0.42, 1.02], [0.70, 1.05], [0.86, 1.10], [0.94, 0.78], [1.1, 1]])),
    vecTrack('root', 'position', jd, 44, (t) => [0, curve(t, [
      [0, 0], [0.16, 0], [0.26, 0.10], [0.55, 0.44], [0.86, 0.04], [0.94, 0], [1.1, 0]]), 0]),
    eulerTrack('legR', jd, 44, (t) => [curve(t, [
      [0, 0], [0.16, 0.28], [0.30, -0.55], [0.62, -0.62], [0.86, 0.34], [0.96, 0.12], [1.1, 0]]), 0, 0.10]),
    eulerTrack('legL', jd, 44, (t) => [curve(t, [
      [0, 0], [0.16, 0.28], [0.30, -0.50], [0.62, -0.58], [0.86, 0.30], [0.96, 0.10], [1.1, 0]]), 0, -0.10]),
    eulerTrack('armR', jd, 44, (t) => [curve(t, [
      [0, 0], [0.16, 0.35], [0.34, -1.40], [0.80, -1.55], [0.98, -0.25], [1.1, 0]]), 0, 1.05]),
    eulerTrack('armL', jd, 44, (t) => [curve(t, [
      [0, 0], [0.16, 0.35], [0.34, -1.40], [0.80, -1.55], [0.98, -0.25], [1.1, 0]]), 0, -1.05]),
  ], false);

  const ld = 0.55;
  const landClip = clip('land', ld, [
    squashTrack('spine', ld, 28, (t) => curve(t, [
      [0, 1.08], [0.12, 0.76], [0.26, 1.06], [0.40, 0.97], [0.55, 1]])),
    vecTrack('root', 'position', ld, 28, (t) => [0, curve(t, [[0, 0.05], [0.12, 0], [0.55, 0]]), 0]),
    eulerTrack('legR', ld, 28, (t) => [curve(t, [[0, 0.30], [0.16, 0.58], [0.55, 0]]), 0, 0.16]),
    eulerTrack('legL', ld, 28, (t) => [curve(t, [[0, 0.30], [0.16, 0.58], [0.55, 0]]), 0, -0.16]),
    eulerTrack('armR', ld, 28, (t) => [curve(t, [[0, -0.80], [0.16, -1.50], [0.46, -0.10], [0.55, 0]]), 0, 0.70]),
    eulerTrack('armL', ld, 28, (t) => [curve(t, [[0, -0.80], [0.16, -1.50], [0.46, -0.10], [0.55, 0]]), 0, -0.70]),
  ], false);

  // 警报呼救：两只手举起来左右摆，身子跟着颠
  const waveClip = clip('wave', av, [
    eulerTrack('armR', av, 32, (t) => [0.25 * Math.sin(aw * t), 0, 1.72 + 0.42 * Math.sin(aw * t)]),
    eulerTrack('armL', av, 32, (t) => [0.25 * Math.sin(aw * t + 0.6), 0, -1.72 - 0.42 * Math.sin(aw * t + 0.6)]),
    squashTrack('spine', av, 32, (t) => 1 - 0.040 * (0.5 - 0.5 * Math.cos(2 * aw * t))),
    vecTrack('root', 'position', av, 32, (t) => [0, 0.035 * (0.5 - 0.5 * Math.cos(2 * aw * t)), 0]),
    eulerTrack('head', av, 32, (t) => [-0.10, 0.12 * Math.sin(aw * t), 0]),
  ]);

  return { idle: idleClip, walk: walkClip, run: runClip, jump: jumpClip, land: landClip, wave: waveClip };
}
