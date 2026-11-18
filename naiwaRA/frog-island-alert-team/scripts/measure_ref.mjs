import sharp from 'sharp';
import { readFileSync } from 'node:fs';

const SRC = process.argv[2] || 'vibe_images/naiwa_v2_turnaround_1794882525820_a5891f7d.png';
const { data, info } = await sharp(SRC).removeAlpha().raw()
  .toBuffer({ resolveWithObject: true });

const W = info.width, H = info.height;
const px = (x, y) => {
  const o = (y * W + x) * info.channels;
  return [data[o], data[o + 1], data[o + 2]];
};

function classify(x, y) {
  const [r, g, b] = px(x, y);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  if (mn > 232 && mx - mn < 18) return 'bg';
  if (mx - mn < 30 && mx < 160) return 'grey';
  if (b > 180 && r > 200) return 'cream';
  return 'yellow';
}

// split the sheet into character blobs by scanning columns for non-bg content
const colHas = new Array(W).fill(false);
for (let x = 0; x < W; x++) {
  for (let y = 0; y < H; y += 3) {
    if (classify(x, y) !== 'bg') { colHas[x] = true; break; }
  }
}
const runs = [];
let s = null;
for (let x = 0; x < W; x++) {
  if (colHas[x] && s === null) s = x;
  if (!colHas[x] && s !== null) { if (x - s > W * 0.05) runs.push([s, x]); s = null; }
}
if (s !== null) runs.push([s, W]);
console.log('panels:', runs.length, JSON.stringify(runs));

const PANEL_NAMES = ['FRONT', 'SIDE', 'BACK'];

for (let pi = 0; pi < Math.min(runs.length, 3); pi++) {
  const [x0, x1] = runs[pi];

  let top = H, bot = 0;
  for (let y = 0; y < H; y++) {
    let hit = false;
    for (let x = x0; x < x1; x++) { if (classify(x, y) !== 'bg') { hit = true; break; } }
    if (hit) { if (y < top) top = y; if (y > bot) bot = y; }
  }
  const heightPx = bot - top;

  const rows = [];
  const step = Math.max(1, Math.round(heightPx / 40));
  for (let y = top; y <= bot; y += step) {
    let minAll = x1, maxAll = x0, minCream = x1, maxCream = x0, minGrey = x1, maxGrey = x0;
    for (let x = x0; x < x1; x++) {
      const c = classify(x, y);
      if (c === 'bg') continue;
      if (x < minAll) minAll = x;
      if (x > maxAll) maxAll = x;
      if (c === 'cream') { if (x < minCream) minCream = x; if (x > maxCream) maxCream = x; }
      if (c === 'grey') { if (x < minGrey) minGrey = x; if (x > maxGrey) maxGrey = x; }
    }
    if (maxAll < minAll) continue;
    // normalised: 0 at feet, 1 at crown
    const v = 1 - (y - top) / heightPx;
    rows.push({
      v,
      lo: (minAll - x0) / heightPx,
      hi: (maxAll - x0) / heightPx,
      cream: maxCream >= minCream ? [(minCream - x0) / heightPx, (maxCream - x0) / heightPx] : null,
      grey: maxGrey >= minGrey ? [(minGrey - x0) / heightPx, (maxGrey - x0) / heightPx] : null,
    });
  }

  console.log('\n===== ' + PANEL_NAMES[pi] + ' (px height ' + heightPx + ') =====');
  console.log('v     lo..hi   width   cream            grey');
  for (const r of rows) {
    const wdt = (r.hi - r.lo).toFixed(3);
    const cr = r.cream ? r.cream.map((n) => n.toFixed(3)).join('..') : '-';
    const gr = r.grey ? r.grey.map((n) => n.toFixed(3)).join('..') : '-';
    console.log(r.v.toFixed(3), (r.lo.toFixed(3) + '..' + r.hi.toFixed(3)).padEnd(14), wdt.padEnd(8), cr.padEnd(16), gr);
  }
}
