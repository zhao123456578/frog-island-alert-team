import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { buildBodyGeometry } from '../src/naiwa_model.mjs';
import { render, edges } from '../src/soft_render.mjs';

const SRC = process.argv[2] || 'refs/nai_frog_03.jpg';
const X0 = +(process.argv[3] || 200), X1 = +(process.argv[4] || 730);
const Y0 = +(process.argv[5] || 130), Y1 = +(process.argv[6] || 860);
const YAW = (+(process.argv[7] || 25)) * Math.PI / 180;
const OUT = 'output/compare';
mkdirSync(OUT, { recursive: true });

const { data, info } = await sharp(SRC).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const RW = info.width, CH = info.channels;

function isFig(x, y) {
  const o = (y * RW + x) * CH;
  return data[o] - data[o + 2] > 16 && data[o] > 110;
}

let top = Y1, bot = Y0, left = X1, right = X0;
for (let y = Y0; y < Y1; y++)
  for (let x = X0; x < X1; x++)
    if (isFig(x, y)) {
      if (y < top) top = y; if (y > bot) bot = y;
      if (x < left) left = x; if (x > right) right = x;
    }
const RH = bot - top + 1, RWID = right - left + 1;

function refRow(v) {
  const y = Math.round(top + (1 - v) * (RH - 1));
  let lo = -1, hi = -1;
  for (let x = X0; x < X1; x++) if (isFig(x, y)) { if (lo < 0) lo = x; hi = x; }
  return lo < 0 ? null : [(lo - left) / RH - RWID / 2 / RH, (hi - left) / RH - RWID / 2 / RH];
}

const refMask = new Uint8Array(RH * RWID);
for (let y = 0; y < RH; y++)
  for (let x = 0; x < RWID; x++)
    refMask[y * RWID + x] = isFig(left + x, top + y) ? 1 : 0;

// ---------- model ----------
const geo = buildBodyGeometry(1.0);
const CANVAS = { w: 1400, h: 1400 };
const ORTHO_H = 1.20;
const { mask: mm } = render(geo, {
  w: CANVAS.w, h: CANVAS.h, yaw: YAW, pitch: 0, dist: 4,
  target: { x: 0, y: 0.5, z: 0 }, shade: false, orthoHeight: ORTHO_H,
});

function bbox(mask, w, h) {
  let x0 = w, x1 = 0, y0 = h, y1 = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (mask[y * w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return { x0, x1, y0, y1 };
}
function cropTo(mask, w, h, bb) {
  const cw = bb.x1 - bb.x0 + 1, ch = bb.y1 - bb.y0 + 1;
  const out = new Uint8Array(cw * ch);
  for (let y = 0; y < ch; y++)
    for (let x = 0; x < cw; x++)
      out[y * cw + x] = mask[(bb.y0 + y) * w + bb.x0 + x];
  return { mask: out, w: cw, h: ch };
}
const model = cropTo(mm, CANVAS.w, CANVAS.h, bbox(mm, CANVAS.w, CANVAS.h));

const CANON_H = 900;
function resize(mask, w, h, nw, nh) {
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
  for (let y = 0; y < sheetH; y++)
    for (let x = 0; x < bw; x++) {
      if (!edge[y * bw + x]) continue;
      for (let dy = 0; dy <= 1; dy++)
        for (let dx = 0; dx <= 1; dx++) {
          const px = x + off + dx, py = y + dy;
          if (px < 0 || px >= sheetW || py >= sheetH) continue;
          const o = (py * sheetW + px) * 3;
          rgb[o] = color[0]; rgb[o + 1] = color[1]; rgb[o + 2] = color[2];
        }
    }
}
function halfRows(mask, w, h) {
  const rows = new Array(h);
  for (let y = 0; y < h; y++) {
    let lo = w, hi = -1;
    for (let x = 0; x < w; x++) if (mask[y * w + x]) { if (x < lo) lo = x; if (x > hi) hi = x; }
    rows[y] = hi < lo ? null : [lo / h - w / 2 / h, hi / h - w / 2 / h];
  }
  return rows;
}

const rw = Math.round(RWID * (CANON_H / RH));
const mw = Math.round(model.w * (CANON_H / model.h));
const refBig = resize(refMask, RWID, RH, rw, CANON_H);
const modBig = resize(model.mask, model.w, model.h, mw, CANON_H);

const sheetW = 760;
const rgb = Buffer.alloc(sheetW * CANON_H * 3, 255);
drawEdges(rgb, sheetW, CANON_H, edges(refBig, rw, CANON_H), rw, [225, 40, 40]);
drawEdges(rgb, sheetW, CANON_H, edges(modBig, mw, CANON_H), mw, [20, 150, 60]);
await sharp(rgb, { raw: { width: sheetW, height: CANON_H, channels: 3 } })
  .png().toFile(`${OUT}/target_yaw${Math.round(YAW * 180 / Math.PI)}.png`);

const rr = halfRows(refBig, rw, CANON_H);
const mr = halfRows(modBig, mw, CANON_H);
console.log(`yaw=${Math.round(YAW * 180 / Math.PI)}°  ref aspect=${(RWID / RH).toFixed(3)}  model=${(model.w / model.h).toFixed(3)}`);
console.log('  v      ref L    ref R   |  mod L   mod R   |  Δw');
let sum = 0, n = 0, worst = 0, worstV = 0;
for (let i = 0; i <= 40; i++) {
  const v = 1 - i / 40;
  const y = CANON_H - 1 - Math.round(v * (CANON_H - 1));
  const a = rr[y], b = mr[y];
  if (!a || !b) continue;
  const dw = Math.abs((a[1] - a[0]) - (b[1] - b[0]));
  sum += dw; n++;
  if (dw > worst) { worst = dw; worstV = v; }
  console.log(`  ${v.toFixed(3)}  ${a[0].toFixed(3)}  ${a[1].toFixed(3)}   |  ${b[0].toFixed(3)}  ${b[1].toFixed(3)}   |  ${dw.toFixed(3)}`);
}
console.log(`\nmean |Δwidth| = ${(sum / n).toFixed(4)}  worst = ${worst.toFixed(3)} at v=${worstV.toFixed(2)}  rows=${n}`);
