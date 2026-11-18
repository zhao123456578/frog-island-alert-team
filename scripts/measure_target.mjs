import sharp from 'sharp';

const SRC = process.argv[2] || 'refs/nai_frog_03.jpg';
const X0 = +(process.argv[3] || 150), X1 = +(process.argv[4] || 780);
const Y0 = +(process.argv[5] || 110), Y1 = +(process.argv[6] || 880);

const { data, info } = await sharp(SRC).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, CH = info.channels;

// the figure is warm yellow/cream; the background is neutral grey-white
function isFig(x, y) {
  const o = (y * W + x) * CH;
  const r = data[o], g = data[o + 1], b = data[o + 2];
  return r - b > 16 && r > 110;
}

let top = Y1, bot = Y0, left = X1, right = X0;
for (let y = Y0; y < Y1; y++)
  for (let x = X0; x < X1; x++)
    if (isFig(x, y)) {
      if (y < top) top = y; if (y > bot) bot = y;
      if (x < left) left = x; if (x > right) right = x;
    }

const H = bot - top + 1;
console.log(`bbox x ${left}..${right}  y ${top}..${bot}  w=${right - left + 1} h=${H}  aspect(w/h)=${((right - left + 1) / H).toFixed(3)}`);

const cx = (left + right) / 2;
const N = 40;
console.log('\n v(1=crown)   leftX   rightX   width    centerOffset   (all in height units, from figure centreline)');
for (let i = 0; i <= N; i++) {
  const v = 1 - i / N;
  const y = Math.round(top + (1 - v) * (H - 1));
  let lo = -1, hi = -1;
  for (let x = X0; x < X1; x++) if (isFig(x, y)) { if (lo < 0) lo = x; hi = x; }
  if (lo < 0) { console.log(`  ${v.toFixed(3)}      (empty row)`); continue; }
  const l = (lo - cx) / H, r = (hi - cx) / H;
  console.log(`  ${v.toFixed(3)}   ${l.toFixed(3)}   ${r.toFixed(3)}   ${(r - l).toFixed(3)}    ${((l + r) / 2).toFixed(3)}`);
}

// vertical extent of the cream belly
let bTop = Y1, bBot = Y0, bL = X1, bR = X0;
for (let y = top; y <= bot; y++)
  for (let x = left; x <= right; x++) {
    const o = (y * W + x) * CH;
    const r = data[o], g = data[o + 1], b = data[o + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (r > 215 && g > 200 && b > 175 && mx - mn < 55) {
      if (y < bTop) bTop = y; if (y > bBot) bBot = y;
      if (x < bL) bL = x; if (x > bR) bR = x;
    }
  }
if (bBot >= bTop) {
  console.log(`\ncream belly: v ${(1 - (bTop - top) / (H - 1)).toFixed(3)} .. ${(1 - (bBot - top) / (H - 1)).toFixed(3)}`);
  console.log(`             half-width ${(bR - bL) / 2 / H}  centre v ${(1 - ((bTop + bBot) / 2 - top) / (H - 1)).toFixed(3)}`);
}
