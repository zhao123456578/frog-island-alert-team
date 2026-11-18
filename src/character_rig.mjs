import * as THREE from 'three';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

// 骨骼表: [{name, parent, pos}] — 父必须先于子出现
export function buildSkeleton(spec) {
  const byName = new Map();
  const bones = [];
  for (const b of spec) {
    const bone = new THREE.Bone();
    bone.name = b.name;
    bone.position.set(b.pos[0], b.pos[1], b.pos[2]);
    const parent = b.parent ? byName.get(b.parent) : null;
    if (parent) parent.add(bone);
    byName.set(b.name, bone);
    bones.push(bone);
  }
  return { root: bones[0], byName, bones };
}

// parts: [{g, part}] — weightOf 返回 [[骨名, 权重], ...]
export function skinParts(parts, sk, weightOf) {
  const indexOf = new Map(sk.bones.map((b, i) => [b.name, i]));
  const v = new THREE.Vector3();
  for (const { g, part } of parts) {
    const p = g.attributes.position;
    const si = new Uint16Array(p.count * 4);
    const sw = new Float32Array(p.count * 4);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const list = weightOf(part, v)
        .filter(([, w]) => w > 1e-5)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4);
      const sum = list.reduce((s, [, w]) => s + w, 0) || 1;
      for (let j = 0; j < 4; j++) {
        const e = list[j];
        si[i * 4 + j] = e ? indexOf.get(e[0]) : 0;
        sw[i * 4 + j] = e ? e[1] / sum : 0;
      }
    }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  }
  return parts.map((x) => x.g);
}

function eulerTrack(name, dur, n, fn) {
  const times = [], vals = [];
  const e = new THREE.Euler(), q = new THREE.Quaternion();
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * dur;
    const [x, y, z] = fn(t, i / n);
    e.set(x, y, z, 'YXZ');
    q.setFromEuler(e);
    times.push(t);
    vals.push(q.x, q.y, q.z, q.w);
  }
  return new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, times, vals);
}

function vecTrack(name, prop, dur, n, fn) {
  const times = [], vals = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * dur;
    const v = fn(t, i / n);
    times.push(t);
    vals.push(v[0], v[1], v[2]);
  }
  const tr = new THREE.VectorKeyframeTrack(`${name}.${prop}`, times, vals);
  tr.setInterpolation(THREE.InterpolateSmooth);
  return tr;
}

// 压扁时按等体积反推横向：sy 缩 0.9，sx/sz 就得胀 1/sqrt(0.9)
function squashTrack(name, dur, n, syFn) {
  return vecTrack(name, 'scale', dur, n, (t, k) => {
    const sy = syFn(t, k);
    const sxz = 1 / Math.sqrt(sy);
    return [sxz, sy, sxz];
  });
}

export function clip(name, dur, tracks, loop = true) {
  const c = new THREE.AnimationClip(name, dur, tracks);
  // AnimationClip 本身没有 loop 字段，mixer 也不看它；这里只是给上层
  // 标一下哪些是一次性动作，游戏里据此决定播完切回 idle 还是继续循环。
  c.userData.oneShot = !loop;
  return c;
}

export { eulerTrack, vecTrack, squashTrack, smooth, clamp };
