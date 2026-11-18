// 避险评分与行为热力图。纯逻辑，不碰 THREE 也不碰 DOM，
// 这样 scripts/check_game.mjs 能在没有 GPU 的情况下把整局跑一遍。

import { ACTION } from './actions.mjs';

export { ACTION };

export const PHASES = ['calm', 'alert', 'shake', 'evacuate', 'done'];

// calm 是自由探索加布景时间，alert 是警报响应窗口，
// shake 期间只能就近避险，evacuate 才是撤离。
export const PHASE_T = { calm: 18, alert: 3, shake: 16, evacuate: 75 };
export const TOTAL_T = PHASE_T.calm + PHASE_T.alert + PHASE_T.shake + PHASE_T.evacuate;

export const DIMS = [
  { key: 'triangle', label: '就近三角区', max: 20, why: '晃动时躲进承重墙角 / 课桌旁的空间' },
  { key: 'gas', label: '关掉燃气', max: 20, why: '震后泄漏的是燃气，越早关阀越好' },
  { key: 'power', label: '拉下总闸', max: 20, why: '电线短路是次生火灾的主要起因' },
  { key: 'route', label: '撤离路线', max: 20, why: '走步行通道到避难场所，不抄近路' },
  { key: 'elevator', label: '电梯误用', max: 20, why: '满分起扣：震时进电梯每格 −7' },
];

// 世界范围 ±60 m 采样成 64×64 的停留时长栅格
export const WORLD_EXTENT = 60;
export const GRID_N = 64;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function createRun() {
  return {
    phase: 'calm',
    phaseT: 0,
    t: 0,
    shakeT: 0,
    // 每个阶段的多长时间，main.js 会把 calm 随机化让预警不可预测；
    // 复制一份而不是改 PHASE_T，免得污染 check_game 的基准。
    limits: { ...PHASE_T },
    hold: { seconds: 0, firstAt: null },
    done: {},
    elevatorHits: 0,
    shelterAt: null,
    shakeEndAt: null,
    path: [],
    log: [],
    grid: new Float32Array(GRID_N * GRID_N),
    score: null,
  };
}

export function totalT(run) {
  const l = run?.limits ?? PHASE_T;
  return l.calm + l.alert + l.shake + l.evacuate;
}

export function cellOf(x, z) {
  const i = Math.floor(((x + WORLD_EXTENT) / (WORLD_EXTENT * 2)) * GRID_N);
  const j = Math.floor(((z + WORLD_EXTENT) / (WORLD_EXTENT * 2)) * GRID_N);
  if (i < 0 || i >= GRID_N || j < 0 || j >= GRID_N) return -1;
  return j * GRID_N + i;
}

/** 每帧唯一入口：采样停留时长、记轨迹点、推进阶段。 */
export function record(run, pos, dt) {
  run.t += dt;
  run.phaseT += dt;
  const c = cellOf(pos.x, pos.z);
  if (c >= 0) run.grid[c] += dt;

  const last = run.path[run.path.length - 1];
  if (!last || run.t - last.t > 0.14 || Math.hypot(pos.x - last.x, pos.z - last.z) > 1.4) {
    run.path.push({ x: pos.x, z: pos.z, t: run.t, phase: run.phase });
    if (run.path.length > 4000) run.path.splice(0, 200);
  }
  advance(run);
}

function advance(run) {
  if (run.phase === 'done') return;
  const limit = run.limits[run.phase];
  if (limit === undefined || run.phaseT < limit) return;
  run.phase = PHASES[PHASES.indexOf(run.phase) + 1];
  run.phaseT = 0;
  if (run.phase === 'shake') run.shakeT = run.t;
  if (run.phase === 'evacuate') run.shakeEndAt = run.t;
  if (run.phase === 'done') finalize(run);
}

/** 晃动期间待在三角区点半径内就累计时长，半径外不累计。 */
export function holdTriangle(run, seconds) {
  if (run.phase !== 'shake' || seconds <= 0) return;
  if (run.hold.firstAt === null) run.hold.firstAt = run.t - run.shakeT;
  run.hold.seconds += seconds;
}

export function interact(run, point) {
  // correct 挂在 ACTION 表上而不是点上——点是 world.mjs 造的，只有 type，
  // 早先直接读 point.correct 永远是 undefined，电梯就被当成正确动作放过了。
  if (ACTION[point.type]?.correct === false) {
    run.elevatorHits += 1;
    run.log.push({ t: run.t, phase: run.phase, id: point.id, text: `进了电梯：${point.hint}`, bad: true });
    return;
  }
  if (run.done[point.type]) return;
  run.done[point.type] = { phase: run.phase, t: run.t, id: point.id };
  run.log.push({ t: run.t, phase: run.phase, id: point.id, text: point.hint });
}

export function reachShelter(run) {
  if (run.shelterAt !== null || run.phase === 'done') return;
  run.shelterAt = run.t;
  run.log.push({ t: run.t, phase: run.phase, id: 'shelter', text: '到达应急避难场所' });
}

export function finalize(run) {
  if (run.score) return run.score;
  const s = {};

  // 三角区：蹲够 2 s 算满，警报后拖过 5 s 才起躲逐步扣分
  const late = run.hold.firstAt === null ? 99 : run.hold.firstAt - 5;
  s.triangle = clamp(Math.round(20 * clamp(run.hold.seconds / 2.0, 0, 1) - clamp(late, 0, 4)), 0, 20);

  // 燃气和电闸在晃动结束前拉掉才算及时，撤离阶段才想起来只给一半
  s.gas = run.done.gas ? (run.done.gas.phase === 'evacuate' ? 10 : 20) : 0;
  s.power = run.done.power ? (run.done.power.phase === 'evacuate' ? 10 : 20) : 0;

  if (run.done.route && run.shelterAt !== null) {
    const dur = run.shelterAt - (run.shakeEndAt ?? run.t);
    s.route = dur <= 25 ? 20 : dur <= 45 ? 15 : dur <= 60 ? 9 : 4;
  } else {
    s.route = 0;
  }

  s.elevator = clamp(20 - 7 * run.elevatorHits, 0, 20);

  const total = s.triangle + s.gas + s.power + s.route + s.elevator;
  run.score = {
    dims: DIMS.map((d) => ({ ...d, value: s[d.key] })),
    total,
    grade: total >= 90 ? 'A' : total >= 75 ? 'B' : total >= 60 ? 'C' : 'D',
    holdSeconds: run.hold.seconds,
    elevatorHits: run.elevatorHits,
    evacuated: run.shelterAt !== null,
    evacuatedIn: run.shelterAt !== null && run.shakeEndAt !== null ? run.shelterAt - run.shakeEndAt : null,
  };
  return run.score;
}

/** 行主序、自下而上的一维数组，直接喂给 ImageData。 */
export function heatmapRows(run) {
  const out = new Float32Array(GRID_N * GRID_N);
  for (let j = 0; j < GRID_N; j++) {
    for (let i = 0; i < GRID_N; i++) {
      out[(GRID_N - 1 - j) * GRID_N + i] = run.grid[j * GRID_N + i];
    }
  }
  return out;
}
