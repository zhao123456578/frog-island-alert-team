// 量参考图里"深灰"和"奶白"两块颜色分别出现在哪些高度/横向位置
import sharp from 'sharp';

const IMG = process.argv[2] || 'vibe_images/naiwa_v2_turnaround_1794882525820_a5891f7d.png';
const { info, data } = await sharp(IMG).raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, ch = info.channels;

const seg = (x, y) => {
  const i = (y * W + x) * ch;
  const r = data[i], g = data[i + 1], b = data[i + 2];
  if (r > 235 && g > 235 && b > 235) return 0;   // bg
  if (Math.abs(r - g) < 28 && Math.abs(g - b) < 28 && r < 185) return 2; // dark grey
  if (r > 225 && g > 212 && b < 205) return 1;   // yellow
  if (r > 225 && g > 218 && b > 205) return 3;   // cream
  return 4;
};

const PANELS = {
  FRONT: [90, 597, 903, 809, 345],
  SIDE: [713, 1092, 911, 815, 935],
};

for (const [nm, [p0, p1, bot, fh, axis]] of Object.entries(PANELS)) {
  console.log('== ' + nm + '  (x 相对中轴，身高单位)');
  for (let b = 0; b < 40; b++) {
    const u = (b + 0.5) / 40;
    const y = Math.round(bot - u * (fh - 1));
    const runs = [[], [], [], [], []];
    for (let x = p0; x <= p1; x++) {
      const s = seg(x, y);
      const rr = runs[s];
      if (rr.length && rr[rr.length - 1][1] === x - 1) rr[rr.length - 1][1] = x;
      else rr.push([x, x]);
    }
    const fmt = (s) => runs[s].filter(([a, z]) => z - a >= 2)
      .map(([a, z]) => ((a - axis) / fh).toFixed(3) + '..' + ((z - axis) / fh).toFixed(3)).join(' , ');
    console.log(u.toFixed(3), ' dark[' + fmt(2) + ']  cream[' + fmt(3) + ']');
  }
}
