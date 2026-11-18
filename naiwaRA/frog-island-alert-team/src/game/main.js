import * as THREE from 'three';
import { buildWorld, ACTION } from './world.mjs';
import { Player } from './player.mjs';
import * as S from './score.mjs';

const $ = (id) => document.getElementById(id);
const ui = {
  phase: $('phase'), dot: $('phase').querySelector('.dot'), label: $('phase').querySelector('b'), clock: $('phase').querySelector('.t'),
  prompt: $('prompt'), promptTxt: $('prompt').querySelector('.txt'), toast: $('toast'),
  banner: $('banner'), big: $('banner').querySelector('.big'), sub: $('banner').querySelector('.sub'),
  checklist: $('checklist'), vignette: $('vignette'), trap: $('trap'),
  intro: $('intro'), result: $('result'), canvas: $('view'),
};

const PHASE_CN = { calm: '自由探索', alert: '地震预警', shake: '剧烈晃动', evacuate: '撤离', done: '演练结束' };
const PHASE_COL = { calm: '#2fbf71', alert: '#f0902a', shake: '#d94b3b', evacuate: '#3b82c4', done: '#9aa7b5' };

const renderer = new THREE.WebGLRenderer({ canvas: ui.canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9db4cb);
scene.fog = new THREE.Fog(0x9db4cb, 78, 205);

const hemi = new THREE.HemisphereLight(0xdce8f5, 0x4a5260, 1.05);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d8, 1.5);
sun.position.set(38, 52, 22);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -56; sun.shadow.camera.right = 56;
sun.shadow.camera.top = 56; sun.shadow.camera.bottom = -56;
sun.shadow.camera.far = 160;
sun.shadow.bias = -0.0012;
scene.add(sun);

const world = buildWorld(scene);
const camera = new THREE.PerspectiveCamera(56, 1, 0.1, 400);

const G = {
  run: null, player: null, started: false, over: false,
  frozen: 0, near: null, prevPhase: '', toastT: 0, bannerT: 0, hudT: 0,
  camYaw: 0, camPitch: 0.36, camDist: 9.4,
  keys: new Set(),
};

// ---- 输入 ----------------------------------------------------------------
addEventListener('keydown', (e) => {
  if (e.code === 'Space') e.preventDefault();
  G.keys.add(e.code);
  if (e.code === 'KeyE') tryInteract();
});
addEventListener('keyup', (e) => G.keys.delete(e.code));
addEventListener('blur', () => G.keys.clear());

let drag = null;
ui.canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; ui.canvas.setPointerCapture(e.pointerId); });
ui.canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  G.camYaw -= (e.clientX - drag.x) * 0.0055;
  G.camPitch = Math.min(1.05, Math.max(0.06, G.camPitch + (e.clientY - drag.y) * 0.004));
  drag = { x: e.clientX, y: e.clientY };
});
ui.canvas.addEventListener('pointerup', () => { drag = null; });
ui.canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  G.camDist = Math.min(18, Math.max(4.5, G.camDist + Math.sign(e.deltaY) * 0.8));
}, { passive: false });

function inputVector() {
  const k = G.keys;
  const ax = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
  const az = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
  // 相机在角色身后，前进方向就是视线在水平面上的投影
  const fx = -Math.sin(G.camYaw), fz = -Math.cos(G.camYaw);
  const rx = -fz, rz = fx;
  const wx = fx * az + rx * ax, wz = fz * az + rz * ax;
  return { fwd: -wz, side: wx, run: k.has('ShiftLeft') || k.has('ShiftRight') };
}

// ---- 交互 ----------------------------------------------------------------
function nearest(points, pos, filter = () => true) {
  let best = null, bd = Infinity;
  for (const p of points) {
    if (!filter(p)) continue;
    const d = Math.hypot(pos.x - p.x, pos.z - p.z);
    if (d < p.radius && d < bd) { bd = d; best = p; }
  }
  return best;
}

function toast(text, bad = false) {
  ui.toast.textContent = text;
  ui.toast.classList.toggle('bad', !!bad);
  ui.toast.style.opacity = '1';
  G.toastT = 3.2;
}

function tryInteract() {
  const p = G.near;
  if (!p || !G.started || G.over) return;
  const run = G.run;

  if (p.type === 'elevator') {
    S.interact(run, p);
    const inShake = run.phase === 'shake' || run.phase === 'alert';
    G.frozen = inShake ? 2.2 : 1.8;
    toast(`电梯不能用 —— ${p.hint}（误用 ${run.elevatorHits} 次）`, true);
    return;
  }
  if (p.type === 'triangle') {
    if (run.phase === 'shake') { toast('已经躲好了，撑过晃动'); return; }
    p.learned = true;
    toast('记住这个位置，晃动一开始就回到这里');
    return;
  }
  if (run.done[p.type]) { toast(`${ACTION[p.type].label}：这局已经处理过了`); return; }
  S.interact(run, p);
  toast(`${ACTION[p.type].label} ✓ ${p.hint}`);
}

// ---- 阶段 --------------------------------------------------------------
function enterPhase(p) {
  const run = G.run;
  if (p === 'alert') {
    banner('⚠ 地 震 预 警', 'P 波已到达，几秒后开始晃动 —— 就近找三角区', 2.8);
  } else if (p === 'shake') {
    banner('开始晃动', '别出门，别下楼，蹲进承重墙角或结实的桌子旁', 2.6);
  } else if (p === 'evacuate') {
    banner('晃动停止', '走楼梯，沿地面箭头撤到路口中央的避难场所', 2.6);
    if (!run.done.gas) toast('还没关燃气：次生火灾多半从这儿起', true);
    else if (!run.done.power) toast('还没断电：电线短路会引燃泄漏的燃气', true);
  } else if (p === 'done') {
    finish();
  }
}

function banner(big, sub, seconds) {
  ui.big.textContent = big; ui.sub.textContent = sub;
  ui.banner.style.opacity = '1';
  G.bannerT = seconds;
}

function finish() {
  G.over = true;
  const sc = S.finalize(G.run);
  ui.trap.style.display = 'none';
  ui.prompt.style.display = 'none';
  $('grade').textContent = sc.grade;
  $('grade').style.color = { A: '#2fbf71', B: '#3b82c4', C: '#f0902a', D: '#d94b3b' }[sc.grade];
  $('total').innerHTML = `${sc.total} <em>/ 100</em>`;
  $('dims').innerHTML = sc.dims.map((d) => {
    const cls = d.value === 0 ? 'zero' : d.value < d.max * 0.6 ? 'low' : '';
    return `<div class="dim" title="${d.why}"><span>${d.label}</span>`
      + `<span class="bar"><i class="${cls}" style="width:${(d.value / d.max) * 100}%"></i></span>`
      + `<span class="v">${d.value}</span></div>`;
  }).join('');

  const L = [];
  if (sc.holdSeconds < 2) L.push(`晃动期间只在三角区待了 ${sc.holdSeconds.toFixed(1)} s（要满 2 s）`);
  if (!sc.evacuated) L.push('没有抵达应急避难场所');
  else L.push(`停晃后 ${sc.evacuatedIn.toFixed(1)} s 抵达避难场所`);
  if (sc.elevatorHits) L.push(`进了 ${sc.elevatorHits} 次电梯`);
  $('legend').innerHTML = heatLegend(L);
  drawHeat(G.run);

  $('log').innerHTML = G.run.log.length
    ? G.run.log.map((e) => `<li class="${e.bad ? 'bad' : ''}"><span class="t">${e.t.toFixed(1)}s</span>${e.text}</li>`).join('')
    : '<li>本局没有任何有效动作。</li>';
  ui.result.classList.remove('hidden');
}

// ---- 热力图 ------------------------------------------------------------
function heatLegend(extra) {
  return `<div><span class="sw" style="background:linear-gradient(90deg,#28467a,#28aaa0,#78cd5a,#f0b43c,#e1503c)"></span>停留时长（低 → 高）</div>`
    + `<div><span class="sw" style="background:#ffffff"></span>撤离路线（白）· 橙色段为晃动期间</div>`
    + `<div><span class="sw" style="background:#2fbf71"></span>中央圆点：应急避难场所</div>`
    + extra.map((t) => `<div>· ${t}</div>`).join('');
}

const RAMP = [[0, 40, 70, 122], [.32, 40, 170, 160], [.58, 120, 205, 90], [.8, 240, 180, 60], [1, 225, 80, 60]];
function ramp(t, out) {
  for (let i = 1; i < RAMP.length; i++) {
    if (t <= RAMP[i][0]) {
      const a = RAMP[i - 1], b = RAMP[i], k = (t - a[0]) / (b[0] - a[0]);
      out[0] = a[1] + (b[1] - a[1]) * k; out[1] = a[2] + (b[2] - a[2]) * k; out[2] = a[3] + (b[3] - a[3]) * k;
      return out;
    }
  }
  const l = RAMP[RAMP.length - 1];
  out[0] = l[1]; out[1] = l[2]; out[2] = l[3];
  return out;
}

function drawHeat(run) {
  const cv = $('heat'), c2 = cv.getContext('2d');
  const N = S.GRID_N, E = S.WORLD_EXTENT, W = cv.width, H = cv.height;
  const rows = S.heatmapRows(run);
  let max = 0;
  for (let i = 0; i < rows.length; i++) if (rows[i] > max) max = rows[i];

  const rgb = new Uint8ClampedArray(N * N * 4), tmp = c2.createImageData(N, N), col = [0, 0, 0];
  for (let i = 0; i < N * N; i++) {
    const t = max > 0 ? rows[i] / max : 0;
    const o = i * 4;
    if (t <= 0) { rgb[o + 3] = 0; continue; }
    ramp(Math.pow(t, 0.55), col);
    rgb[o] = col[0]; rgb[o + 1] = col[1]; rgb[o + 2] = col[2];
    rgb[o + 3] = Math.round(50 + 205 * Math.pow(t, 0.6));
  }
  tmp.data.set(rgb);
  const buf = document.createElement('canvas');
  buf.width = N; buf.height = N;
  buf.getContext('2d').putImageData(tmp, 0, 0);

  const px = (x) => ((x + E) / (2 * E)) * W, pz = (z) => ((z + E) / (2 * E)) * H;
  c2.clearRect(0, 0, W, H);
  c2.fillStyle = '#0d151d'; c2.fillRect(0, 0, W, H);
  c2.drawImage(buf, 0, 0, W, H);

  c2.strokeStyle = 'rgba(255,255,255,.14)'; c2.lineWidth = 2;
  for (const [bx, bz] of world.blocks) c2.strokeRect(px(bx - 17), pz(bz - 17), px(bx + 17) - px(bx - 17), pz(bz + 17) - pz(bz - 17));

  c2.fillStyle = '#2fbf71';
  c2.beginPath(); c2.arc(px(world.shelter.x), pz(world.shelter.z), 9, 0, Math.PI * 2); c2.fill();

  c2.lineWidth = 3.4; c2.lineJoin = 'round'; c2.lineCap = 'round';
  const path = run.path;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    c2.strokeStyle = b.phase === 'shake' ? '#f0902a' : b.phase === 'evacuate' ? '#ffffff' : 'rgba(255,255,255,.55)';
    c2.beginPath(); c2.moveTo(px(a.x), pz(a.z)); c2.lineTo(px(b.x), pz(b.z)); c2.stroke();
  }
  c2.fillStyle = '#eef3f8';
  c2.beginPath(); c2.arc(px(path[0]?.x ?? 0), pz(path[0]?.z ?? 9), 7, 0, Math.PI * 2); c2.fill();
}

// ---- HUD ---------------------------------------------------------------
function buildChecklist() {
  ui.checklist.innerHTML = S.DIMS.map((d) =>
    `<li data-k="${d.key}" title="${d.why}"><span class="mk">·</span><span>${d.label}</span><span class="pt"></span></li>`).join('');
}

function syncHud() {
  const run = G.run;
  const state = {
    triangle: run.hold.seconds >= 2 ? 1 : run.hold.seconds > 0 ? 2 : 0,
    gas: run.done.gas ? 1 : 0, power: run.done.power ? 1 : 0,
    route: run.done.route && run.shelterAt !== null ? 1 : run.done.route ? 2 : run.shelterAt !== null ? 2 : 0,
    elevator: run.elevatorHits ? 3 : 1,
  };
  const mk = { 0: '·', 1: '✓', 2: '…', 3: '✗' };
  const cls = { 0: '', 1: 'on', 2: 'on', 3: 'bad' };
  const note = {
    triangle: run.hold.seconds > 0 ? `${run.hold.seconds.toFixed(1)}s/2s` : '',
    gas: state.gas ? '已关' : '', power: state.power ? '已断' : '',
    route: state.route === 1 ? '已到' : state.route === 2 ? '待撤离' : '',
    elevator: run.elevatorHits ? `${run.elevatorHits} 次` : '未进',
  };
  for (const li of ui.checklist.children) {
    const k = li.dataset.k, s = state[k];
    li.className = cls[s];
    li.querySelector('.mk').textContent = mk[s];
    li.querySelector('.pt').textContent = note[k];
  }
  const total = S.totalT(run);
  const left = run.phase === 'done' ? 0 : Math.max(0, run.limits[run.phase] - run.phaseT);
  ui.label.textContent = PHASE_CN[run.phase];
  ui.dot.style.background = PHASE_COL[run.phase];
  ui.clock.textContent = run.phase === 'done' ? `全程 ${total.toFixed(0)}s`
    : run.phase === 'evacuate' ? `撤离剩余 ${left.toFixed(0)}s` : `${left.toFixed(1)}s`;
}

// ---- 主循环 ------------------------------------------------------------
const target = new THREE.Vector3();

function step(dt) {
  const run = G.run;
  const moving = G.started && !G.over;

  if (G.frozen > 0) {
    G.frozen -= dt;
    ui.trap.style.display = 'flex';
    if (G.frozen <= 0) ui.trap.style.display = 'none';
  }
  const inp = G.frozen > 0 ? { fwd: 0, side: 0, run: false } : inputVector();
  if (G.keys.has('Space') && !G.player.airborne && moving && G.frozen <= 0) G.player.jump();
  G.player.update(dt, moving ? inp : { fwd: 0, side: 0, run: false }, world.colliders);

  if (!moving) return;

  S.record(run, G.player.pos, dt);
  if (run.phase !== G.prevPhase) { G.prevPhase = run.phase; enterPhase(run.phase); }

  G.near = nearest(world.points, G.player.pos);
  if (G.near) {
    ui.prompt.style.display = 'flex';
    ui.promptTxt.textContent = `${ACTION[G.near.type].label} · ${G.near.hint}`;
  } else ui.prompt.style.display = 'none';

  if (run.phase === 'shake' && nearest(world.points, G.player.pos, (p) => p.type === 'triangle')) {
    S.holdTriangle(run, dt);
  }
  if (Math.hypot(G.player.pos.x - world.shelter.x, G.player.pos.z - world.shelter.z) < world.shelter.r) {
    S.reachShelter(run);
  }
}

function render(now) {
  const run = G.run;
  const rumble = run && run.phase === 'shake'
    ? 0.16 * Math.sin(Math.PI * Math.min(1, run.phaseT / S.PHASE_T.shake)) : 0;

  const p = G.player.pos;
  target.set(p.x, p.y + 1.05, p.z);
  const cp = G.camPitch, d = G.camDist;
  camera.position.set(
    p.x + Math.sin(G.camYaw) * d * Math.cos(cp),
    p.y + 0.6 + d * Math.sin(cp),
    p.z + Math.cos(G.camYaw) * d * Math.cos(cp)
  );
  camera.lookAt(target);
  if (rumble > 0) {
    const j = rumble * 3;
    camera.position.x += (Math.random() - .5) * j;
    camera.position.y += (Math.random() - .5) * j;
    camera.rotateZ((Math.random() - .5) * rumble * 0.16);
  }

  ui.vignette.style.opacity = String(rumble > 0 ? 0.34 + 0.2 * Math.sin(now * 0.009) : (run && run.phase === 'alert' ? 0.22 : 0.05));

  const glow = 1 + 0.16 * Math.sin(now * 0.004);
  for (const pt of world.points) {
    const m = pt.marker;
    const done = pt.type === 'elevator' ? false : run?.done[pt.type];
    m.visible = !done;
    if (done) continue;
    const hot = (pt.type === 'triangle' && run && (run.phase === 'shake' || run.phase === 'alert')) || pt === G.near;
    const s = (hot ? 1.22 : 1) * (hot ? glow : 1);
    m.scale.setScalar(s);
    m.userData.beam.material.opacity = (pt === G.near ? 0.42 : hot ? 0.34 : 0.2) * (0.8 + 0.2 * Math.sin(now * 0.005));
  }

  renderer.render(scene, camera);
}

let last = performance.now();
function advance(dt, now, draw = true) {
  if (G.run) {
    step(dt);
    if (G.toastT > 0) { G.toastT -= dt; if (G.toastT <= 0) ui.toast.style.opacity = '0'; }
    if (G.bannerT > 0) { G.bannerT -= dt; if (G.bannerT <= 0) ui.banner.style.opacity = '0'; }
    G.hudT += dt;
    if (G.hudT > 0.1) { G.hudT = 0; syncHud(); }
  }
  if (G.player && draw) render(now);
}
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  advance(dt, now);
}

function resize() {
  // 布局尺寸归 CSS（#view 是 100%×100%），setSize 只改绘制缓冲，所以 updateStyle 留 false。
  // 若不钉住 CSS 盒子，画布会按缓冲尺寸（视口×devicePixelRatio）排版，150% 缩放的屏幕上看不到右下 1/3。
  const w = ui.canvas.clientWidth || innerWidth;
  const h = ui.canvas.clientHeight || innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

async function boot() {
  const gltf = await Player.load('assets/mascot.glb');
  G.player = new Player(gltf, scene);
  G.player.pos.set(world.spawn.x, 0, world.spawn.z);
  G.player.root.position.copy(G.player.pos);

  G.run = S.createRun();
  G.run.limits.calm = 13 + Math.random() * 8;
  buildChecklist();
  syncHud();

  $('start').addEventListener('click', () => {
    ui.intro.classList.add('hidden');
    G.started = true;
    banner('演练开始', '四处看看阀井、配电箱和楼梯在哪，警报随时会响', 3.0);
  });
  $('again').addEventListener('click', () => location.reload());

  requestAnimationFrame(frame);
}

boot().catch((err) => {
  ui.intro.querySelector('.lede').innerHTML =
    `<b style="color:#ffb1a6">资源加载失败：</b>${err?.message ?? err}<br>请在站点根目录打开，或用 node 起一个静态服。`;
  $('start').disabled = true;
});

// 供浏览器端自动化验证使用：无头时 in-app browser 没有可见 surface，
// 靠 shot() 手动渲染一帧再 POST 回本地静态服落盘取证。
window.__game = {
  G, world, S,
  // 无头页面 rAF 不跑，用固定步长手动推进，顺带让验证变成确定性的
  pump: (seconds, dt = 1 / 60, draw = false) => {
    let now = performance.now();
    for (let t = 0; t < seconds; t += dt) { now += dt * 1000; advance(dt, now, draw); }
    return { phase: G.run.phase, t: +G.run.t.toFixed(2) };
  },
  goTo: (id) => {
    const p = world.points.find((q) => q.id === id);
    if (!p) return false;
    G.player.pos.set(p.x, p.surf, p.z);
    G.player.groundY = p.surf;
    G.player.root.position.copy(G.player.pos);
    return true;
  },
  press: () => tryInteract(),
  state: () => ({
    phase: G.run.phase, t: +G.run.t.toFixed(2), hold: +G.run.hold.seconds.toFixed(2),
    done: Object.keys(G.run.done), hits: G.run.elevatorHits, near: G.near?.id ?? null,
    shelter: G.run.shelterAt !== null, y: +G.player.pos.y.toFixed(2), over: G.over,
  }),
  shot: async (name = 'shot', w = 960, h = 600) => {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    render(performance.now());
    const url = ui.canvas.toDataURL('image/png');
    resize();
    const r = await fetch(`/_save?name=${name}.png`, { method: 'POST', body: url });
    return `${r.status} ${name} ${Math.round(url.length / 1024)}KB`;
  },
};
