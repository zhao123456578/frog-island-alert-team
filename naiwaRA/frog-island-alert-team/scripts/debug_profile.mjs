import { buildLoft } from '../src/naiwa_model.mjs';

const TORSO = [
  [1.000, 0.020, 0.016, 0.005], [0.975, 0.069, 0.074, 0.004],
  [0.951, 0.084, 0.095, 0.003], [0.926, 0.089, 0.108, 0.000],
  [0.902, 0.094, 0.120, 0.000], [0.877, 0.097, 0.117, -0.013],
  [0.853, 0.102, 0.109, -0.032], [0.828, 0.110, 0.105, -0.043],
  [0.803, 0.121, 0.108, -0.051], [0.779, 0.141, 0.115, -0.053],
  [0.754, 0.170, 0.125, -0.050], [0.730, 0.190, 0.141, -0.045],
  [0.705, 0.208, 0.158, -0.036], [0.681, 0.222, 0.176, -0.026],
  [0.656, 0.232, 0.191, -0.017], [0.631, 0.240, 0.203, -0.010],
  [0.607, 0.246, 0.213, -0.005], [0.582, 0.250, 0.220, -0.001],
  [0.558, 0.250, 0.226, 0.003], [0.533, 0.248, 0.230, 0.004],
  [0.509, 0.246, 0.232, 0.006], [0.484, 0.243, 0.233, 0.007],
  [0.459, 0.238, 0.232, 0.009], [0.435, 0.232, 0.230, 0.009],
  [0.410, 0.226, 0.225, 0.009], [0.386, 0.218, 0.216, 0.008],
  [0.361, 0.208, 0.206, 0.007], [0.337, 0.196, 0.192, 0.006],
  [0.312, 0.180, 0.173, 0.003], [0.287, 0.160, 0.149, -0.002],
  [0.263, 0.135, 0.115, -0.011], [0.238, 0.112, 0.107, -0.014],
  [0.214, 0.092, 0.103, -0.014], [0.190, 0.072, 0.088, -0.016],
];

const g = buildLoft(TORSO.map(([v, rx, rz, z]) => [0, v, z, rx, rz]), { radial: 40, perSpan: 4 });
const p = g.attributes.position;

// bucket vertices by height, report the realised half-extents
const rows = new Map();
for (let i = 0; i < p.count; i++) {
  const y = p.getY(i), x = p.getX(i), z = p.getZ(i);
  const key = Math.round(y * 40) / 40;
  const cur = rows.get(key) || { rx: 0, rz: 0 };
  cur.rx = Math.max(cur.rx, Math.abs(x));
  cur.rz = Math.max(cur.rz, Math.abs(z));
  rows.set(key, cur);
}

const want = new Map(TORSO.map(([v, rx, rz]) => [Math.round(v * 40) / 40, [rx, rz]]));
console.log('v      wantRx realRx   wantRz realRz   errRx%  errRz%');
for (const k of [...rows.keys()].sort((a, b) => b - a)) {
  const r = rows.get(k);
  const w = want.get(k);
  if (!w) continue;
  console.log(
    k.toFixed(2),
    w[0].toFixed(3), r.rx.toFixed(3), '  ',
    w[1].toFixed(3), r.rz.toFixed(3), '   ',
    (((r.rx - w[0]) / w[0]) * 100).toFixed(1).padStart(6),
    (((r.rz - w[1]) / w[1]) * 100).toFixed(1).padStart(7)
  );
}
