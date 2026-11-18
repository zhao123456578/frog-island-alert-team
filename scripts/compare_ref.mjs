import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { buildBodyGeometry } from '../src/naiwa_model.mjs';
import { render, edges } from '../src/soft_render.mjs';

const SRC = process.argv[2] || 'vibe_images/naiwa_v2_turnaround_1794882525820_a5891f7d.png';
const OUT = 'output/compare';
mkdirSync(OUT, { recursive: true });

// ---------- reference masks from the turnaround ----------
const { data, info } = await sharp(SRC).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const RW = info.width, RH = info.height, CH = info.channels;

function classify(x, y) {
  const o = (y * RW + x) * CH;
  const r = data[o], g = data[o + 1], b = data[o + 2];
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  if (mn > 232 && mx - mn < 18) return 0;
  return 1;
}

const colHas = new Array(RW).fill(false);
for (let x = 0; x < RW; x++) {
  for (let y = 0; y < RH; y += 3) if (classify(x, y)) { colHas[x] = true; break; }
}
const runs = [];
let s = null;
for (let x = 0; x < RW; x++) {
  if (colHas[x] && s === null) s = x;
  if (!colHas[x] && s !== null) { if (x - s > RW * 0.05) runs.push([s, x]); s = null; }
}
if (s !== null) runs.push([s, RW]);

function refMaskOf([x0, x1]) {
  let top = RH, bot = 0;
  for (let y = 0; y < RH; y++) {
    for (let x = x0; x < x1; x++) if (classify(x, y)) { if (y < top) top = y; if (y > bot) bot = y; break; }
  }
  const h = bot - top + 1;
  const m = new Uint8Array(h * (x1 - x0));
  for (let y = top; y <= bot; y++)
    for (let x = x0; x < x1; x++)
      m[(y - top) * (x1 - x0) + (x - x0)] = classify(x, y);
  return { mask: m, w: x1 - x0, h };
}

// ---------- model masks ----------
// 归一化到身高 1.0，配合正交投影后 u(=y) 与像素行严格线性，轮廓差才是真差
const geo = buildBodyGeometry(1.0);
const CANVAS = { w: 900, h: 1200 };
const ORTHO_H = 1.12;
const VIEWS = [
  { key: 'FRONT', yaw: 0 },
  { key: 'SIDE', yaw: Math.PI / 2 },
  { key: 'BACK', yaw: Math.PI },
];

function bboxOf(mask, w, h) {
  let x0 = w, x1 = 0, y0 = h, y1 = 0, n = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (mask[y * w + x]) { n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return { x0, x1, y0, y1, n };
}

function crop(mask, w, h, bb) {
  const cw = bb.x1 - bb.x0 + 1, ch = bb.y1 - bb.y0 + 1;
  const out = new Uint8Array(cw * ch);
  for (let y = 0; y < ch; y++)
    for (let x = 0; x < cw; x++)
      out[y * cw + x] = mask[(bb.y0 + y) * w + bb.x0 + x];
  return { mask: out, w: cw, h: ch };
}

// per-row normalised half-width profile, sampled at 40 heights (v = 1 top .. 0 bottom)
function profile(mask, w, h) {
  const rows = [];
  for (let y = 0; y < h; y++) {
    let lo = w, hi = -1;
    for (let x = 0; x < w; x++) if (mask[y * w + x]) { if (x < lo) lo = x; if (x > hi) hi = x; }
    rows.push(hi < lo ? null : [lo, hi]);
  }
  const out = new Array(41).fill(null);
  for (let i = 0; i <= 40; i++) {
    const v = i / 40;                       // 0 = bottom, 1 = top
    const y = Math.round((1 - v) * (h - 1));
    const r = rows[y];
    if (r) out[i] = ((r[1] - r[0] + 1) / h); // width normalised by its own height
  }
  return out;
}

const CANON_H = 900;
const panels = [];

function resizeMask(mask, w, h, nw, nh) {
  const out = new Uint8Array(nw * nh);
  for (let y = 0; y < nh; y++) {
    const sy = Math.min(h - 1, Math.round((y + 0.5) * h / nh - 0.5));
    for (let x = 0; x < nw; x++) {
      const sx = Math.min(w - 1, Math.round((x + 0.5) * w / nw - 0.5));
      out[y * nw + x] = mask[sy * w + sx];
    }
  }
  return out;
}

function drawEdges(rgb, sheetW, sheetH, edge, bw, color) {
  const off = Math.round((sheetW - bw) / 2);
  for (let y = 0; y < sheetH; y++) {
    for (let x = 0; x < bw; x++) {
      if (!edge[y * bw + x]) continue;
      // thicken by one pixel so the two outlines stay readable
      for (let dy = 0; dy <= 1; dy++) {
        for (let dx = 0; dx <= 1; dx++) {
          const px = x + off + dx, py = y + dy;
          if (px < 0 || px >= sheetW || py >= sheetH) continue;
          const o = (py * sheetW + px) * 3;
          rgb[o] = color[0]; rgb[o + 1] = color[1]; rgb[o + 2] = color[2];
        }
      }
    }
  }
}

for (let i = 0; i < VIEWS.length; i++) {
  const view = VIEWS[i];
  const ref = refMaskOf(runs[i]);
  const { mask: mm } = render(geo, {
    w: CANVAS.w, h: CANVAS.h, yaw: view.yaw, pitch: 0, dist: 3.4,
    target: { x: 0, y: 0.5, z: 0 }, shade: false, orthoHeight: ORTHO_H,
  });
  const model = crop(mm, CANVAS.w, CANVAS.h, bboxOf(mm, CANVAS.w, CANVAS.h));
  const refCropped = crop(ref.mask, ref.w, ref.h, bboxOf(ref.mask, ref.w, ref.h));

  const rw = Math.max(1, Math.round(refCropped.w * (CANON_H / refCropped.h)));
  const mw = Math.max(1, Math.round(model.w * (CANON_H / model.h)));
  const refBig = resizeMask(refCropped.mask, refCropped.w, refCropped.h, rw, CANON_H);
  const modBig = resizeMask(model.mask, model.w, model.h, mw, CANON_H);

  const sheetW = 720;
  const rgb = Buffer.alloc(sheetW * CANON_H * 3, 255);
  drawEdges(rgb, sheetW, CANON_H, edges(refBig, rw, CANON_H), rw, [225, 40, 40]);
  drawEdges(rgb, sheetW, CANON_H, edges(modBig, mw, CANON_H), mw, [20, 150, 60]);

  await sharp(rgb, { raw: { width: sheetW, height: CANON_H, channels: 3 } })
    .png().toFile(`${OUT}/${view.key}_silhouette.png`);

  // numeric: width profile difference
  const pr = profile(refCropped.mask, refCropped.w, refCropped.h);
  const pm = profile(model.mask, model.w, model.h);
  let sum = 0, worst = 0, worstV = 0;
  const lines = [];
  for (let k = 0; k <= 40; k++) {
    if (pr[k] === null || pm[k] === null) continue;
    const d = Math.abs(pr[k] - pm[k]);
    sum += d;
    if (d > worst) { worst = d; worstV = k / 40; }
    if (k % 4 === 0) lines.push(`  v=${(k / 40).toFixed(2)}  ref=${pr[k].toFixed(3)}  model=${pm[k].toFixed(3)}  Δ=${d.toFixed(3)}`);
  }
  console.log(`\n=== ${view.key} ===  mean |Δwidth| = ${(sum / 41).toFixed(4)}  worst = ${worst.toFixed(3)} at v=${worstV.toFixed(2)}`);
  console.log(lines.join('\n'));
  console.log(`  ref aspect (w/h) = ${(refCropped.w / refCropped.h).toFixed(3)}  model = ${(model.w / model.h).toFixed(3)}`);
  panels.push(view.key);
}

console.log('\nwrote', OUT, panels.join(', '));
