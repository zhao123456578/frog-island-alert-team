// 把三视图参考图按"身高单位"输出轮廓：u=离脚底/身高, x=离中轴/身高(正=右或前)
import sharp from 'sharp';

const IMG = process.argv[2] || 'vibe_images/naiwa_v2_turnaround_1794882525820_a5891f7d.png';
const KIND = process.argv[3] || 'front'; // front | side | back
const ROWS = Number(process.argv[4] || 40);

const { info, data } = await sharp(IMG).raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, ch = info.channels;

const isBg = (x, y) => {
  const i = (y * W + x) * ch;
  return data[i] > 235 && data[i + 1] > 235 && data[i + 2] > 235;
};

// 自动切出三个面板
const colOn = [];
for (let x = 0; x < W; x++) {
  let on = false;
  for (let y = 0; y < H; y += 3) if (!isBg(x, y)) { on = true; break; }
  colOn.push(on);
}
const panels = [];
let s = -1;
for (let x = 0; x <= W; x++) {
  const on = x < W && colOn[x];
  if (on) { if (s < 0) s = x; }
  else if (s >= 0) { if (x - s > 150) panels.push([s, x - 1]); s = -1; }
}
const idx = { front: 0, side: 1, back: 2 }[KIND];
const [p0, p1] = panels[idx];

// 面板内 figure 的包围盒
let top = H, bot = -1;
for (let y = 0; y < H; y++) {
  for (let x = p0; x <= p1; x++) if (!isBg(x, y)) { top = Math.min(top, y); bot = Math.max(bot, y); break; }
}
const fh = bot - top + 1;
console.log(`# ${KIND} panel=[${p0},${p1}] figure top=${top} bot=${bot} heightPx=${fh}`);

const rowRuns = (u) => {
  const y = Math.round(bot - u * (fh - 1));
  const runs = [];
  let a = -1;
  for (let x = p0; x <= p1 + 1; x++) {
    const on = x <= p1 && !isBg(x, y);
    if (on) { if (a < 0) a = x; }
    else if (a >= 0) { if (x - a >= 3) runs.push([a, x - 1]); a = -1; }
  }
  return runs;
};

// 侧视：用脚踝(u≈0.10)的中心当固定中轴，正值=前突方向
let axis = null;
if (KIND === 'side') {
  const r = rowRuns(0.10);
  axis = (r[0][0] + r[r.length - 1][1]) / 2;
  // 前方向由 figure 最宽处偏向哪侧决定
  let sumL = 0, nL = 0, sumR = 0, nR = 0;
  for (let b = 15; b < 30; b++) { const rr = rowRuns(b / ROWS); if (!rr.length) continue; sumL += rr[0][0] - axis; nL++; sumR += rr[rr.length - 1][1] - axis; nR++; }
  if (Math.abs(sumR / nR) > Math.abs(sumL / nL)) axis = axis; // 保持
  console.log(`# side axis px=${axis.toFixed(1)} (正值=+x 方向)`);
}
console.log('# u   runs (height-units)');

for (let b = 0; b < ROWS; b++) {
  const u = (b + 0.5) / ROWS;
  const runs = rowRuns(u);
  if (!runs.length) { console.log(u.toFixed(3), '  (empty)'); continue; }
  const cx = axis ?? (runs[0][0] + runs[runs.length - 1][1]) / 2;
  const parts = runs.map(([r0, r1]) => `${((r0 - cx) / fh).toFixed(3)}..${((r1 - cx) / fh).toFixed(3)}`);
  const ext = [runs[0][0], runs[runs.length - 1][1]].map((v) => ((v - cx) / fh).toFixed(3));
  console.log(u.toFixed(3), ' span=' + ext.join(','), ' ' + parts.join(' | '));
}
