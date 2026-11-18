import * as THREE from 'three';
import { buildWorld, STEP_UP } from '../src/game/world.mjs';
import {
  createRun, record, holdTriangle, interact, reachShelter, finalize,
  heatmapRows, cellOf, GRID_N, WORLD_EXTENT,
  PHASE_T, TOTAL_T, DIMS,
} from '../src/game/score.mjs';

const scene = new THREE.Scene();
const w = buildWorld(scene);
const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const nearest = (from, type) => w.points.filter((p) => p.type === type)
  .map((p) => ({ p, dist: d(from, p) })).sort((a, b) => a.dist - b.dist)[0];

// ---- 世界体检 --------------------------------------------------------------
console.log('=== 世界体检 ===');
console.log('interaction points', w.points.length, '| colliders', w.colliders.length,
  '| meshes', scene.children.length);

const byType = {};
for (const p of w.points) (byType[p.type] ||= []).push(p);
for (const [type, list] of Object.entries(byType)) {
  const n = nearest(w.spawn, type);
  console.log(`  ${type.padEnd(9)} ×${list.length}  最近 ${n.p.id.padEnd(12)} ${n.dist.toFixed(1)} m` +
    `  ≈ ${(n.dist / 4.5).toFixed(1)} s 走 / ${(n.dist / 7.5).toFixed(1)} s 跑`);
}

const tri = nearest(w.spawn, 'triangle');
const rt = nearest(tri.p, 'route');
const leg = tri.dist + rt.dist + d(rt.p, w.shelter);
console.log(`  撤离链 出生→${tri.p.id}→${rt.p.id}→避难场所 = ${leg.toFixed(1)} m` +
  `  ≈ ${(leg / 4.5).toFixed(1)} s 走 / ${(leg / 7.5).toFixed(1)} s 跑` +
  `  (evacuate 窗口 ${PHASE_T.evacuate} s)`);

const checks = [
  ['calm 够走到最近燃气阀', d(w.spawn, nearest(w.spawn, 'gas').p) / 4.5 <= PHASE_T.calm],
  ['evacuate 够走完撤离链', leg / 4.5 <= PHASE_T.evacuate],
  ['四个街区都有三角区', w.blocks.every(([bx, bz]) =>
    byType.triangle.some((p) => Math.abs(p.x - bx) < 22 && Math.abs(p.z - bz) < 22))],
  ['每个街区都有电梯陷阱', w.blocks.every(([bx, bz]) =>
    byType.elevator.some((p) => Math.abs(p.x - bx) < 22 && Math.abs(p.z - bz) < 22))],
  ['四个街区动作齐全', ['triangle', 'gas', 'power', 'route'].every((type) =>
    w.blocks.every(([bx, bz]) => byType[type].some((p) => Math.abs(p.x - bx) < 22 && Math.abs(p.z - bz) < 22)))],
  ['交互点没埋进高实体', w.points.every((p) => !w.colliders.some(
    (c) => c.y1 > STEP_UP && Math.abs(p.x - c.x) < c.ex + 1.0 && Math.abs(p.z - c.z) < c.ez + 1.0))],
  ['交互点没出街区', w.points.every((p) =>
    Math.abs(p.x) < 55 && Math.abs(p.z) < 55)],
];

// ---- 用同一套规则跑几种打法 ------------------------------------------------
// goalFor(run) 返回一个目标点（世界里的交互点 / 避难场所 / null 表示站着不动）。
// 走到 1.6 m 内就自动触发该点的动作：三角区持续累计时长，其余一次性登记。
function simulate(goalFor, { speed = 4.5, elevator = 0 } = {}) {
  const run = createRun();
  const pts = w.points.map((p) => ({ ...p, used: false }));
  const dt = 1 / 30;
  let pos = { x: w.spawn.x, z: w.spawn.z };
  let lifts = 0;

  for (let s = 0; s < Math.ceil(TOTAL_T / dt) + 3; s++) {
    const g = goalFor(run, pos, pts);
    if (g) {
      const vx = g.x - pos.x, vz = g.z - pos.z, len = Math.hypot(vx, vz);
      const step = speed * dt;
      if (len > 1e-6) pos = { x: pos.x + (vx / len) * Math.min(len, step), z: pos.z + (vz / len) * Math.min(len, step) };
    }
    record(run, pos, dt);

    for (const p of pts) {
      if (d(pos, p) > p.radius || p.used) continue;
      if (p.type === 'triangle') holdTriangle(run, dt);
      else { interact(run, p); p.used = true; }
    }
    if (lifts < elevator && run.phase === 'shake') {
      interact(run, pts.find((p) => p.type === 'elevator'));
      lifts++;
    }
    if (d(pos, w.shelter) < w.shelter.r) reachShelter(run);
    if (run.phase === 'done') break;
  }
  return finalize(run);
}

const find = (pts, id) => pts.find((p) => p.id === id);
const gas = nearest(w.spawn, 'gas').p.id;
const power = nearest(w.spawn, 'power').p.id;

function textbook(run, pos, pts) {
  const t = find(pts, tri.p.id), g = find(pts, gas), pw = find(pts, power), r = find(pts, rt.p.id);
  if (run.phase === 'calm') return !g.used ? g : !pw.used ? pw : t;
  if (run.phase === 'alert' || run.phase === 'shake') return t;
  if (run.phase === 'evacuate') return !r.used ? r : w.shelter;
  return null;
}

const standStill = () => null;

const good = simulate(textbook);
const bad = simulate(standStill);
const lifted = simulate(textbook, { elevator: 3 });

console.log('\n=== 三种打法 ===');
const show = (label, r) => console.log(
  `${label.padEnd(14)} ${String(r.total).padStart(3)} 分 ${r.grade}  ` +
  r.dims.map((x) => `${x.key}=${x.value}`).join(' '));
show('教科书', good);
show('站着不动', bad);
show('多进 3 次电梯', lifted);

console.log('\n=== 断言 ===');
const v = (k) => good.dims.find((x) => x.key === k).value;
const A = [
  ['满分打法 ≥ 85', good.total >= 85],
  ['站着不动 ≤ 20', bad.total <= 20],
  ['站着不动三角区 0', bad.dims.find((x) => x.key === 'triangle').value === 0],
  ['站着不动没撤离', bad.evacuated === false],
  ['三角区拿满', v('triangle') === 20],
  ['燃气拿满', v('gas') === 20],
  ['断电拿满', v('power') === 20],
  ['撤离拿满', v('route') === 20],
  ['电梯不扣分', v('elevator') === 20],
  ['电梯 3 次扣光', lifted.dims.find((x) => x.key === 'elevator').value === 0],
  ['电梯拉低总分', lifted.total < good.total],
  ['五维齐全', good.dims.length === DIMS.length],
  ['总分 = 五维之和', good.total === good.dims.reduce((a, x) => a + x.value, 0)],
  ['每维不超上限', good.dims.every((x) => x.value <= x.max)],
  ['热力图 row0 是北边', (() => {
    const r = createRun();
    record(r, { x: 0, z: 30 }, 2);
    const c = cellOf(0, 30);
    const i = c % GRID_N, j = (c - i) / GRID_N;
    const rows = heatmapRows(r);
    return rows[(GRID_N - 1 - j) * GRID_N + i] === 2 &&
      rows.reduce((a, v) => a + (v > 0 ? 1 : 0), 0) === 1;
  })()],
  ['出界的脚步不入栅格', cellOf(WORLD_EXTENT * 3, 0) === -1],
];
for (const [name, ok] of [...checks, ...A]) console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${name}`);
const failed = [...checks, ...A].filter(([, ok]) => !ok).length;
console.log(failed ? `\n${failed} 项未通过` : '\n全部通过');
process.exit(failed ? 1 : 0);
