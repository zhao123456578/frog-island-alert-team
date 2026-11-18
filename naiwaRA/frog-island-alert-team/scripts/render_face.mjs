import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { render } from '../src/soft_render.mjs';

// 脸部特写：软件光栅器按 orthoHeight 取景，把 u0.70-1.00 的头占满画面。
const W = 620, H = 620;
const OUT = 'output/preview/mascot';
mkdirSync(OUT, { recursive: true });

const mod = await import('../src/mascot_model.mjs');
const g = mod.buildMascotGeometry();

const views = [
  { name: '正面 FACE', yaw: 0, ortho: 0.86, cy: 1.02 },
  { name: '3/4 视角', yaw: Math.PI * 0.24, ortho: 0.86, cy: 1.02 },
];

const layers = [];
const LABEL = 34, GAP = 26, PAD = 30;

for (let i = 0; i < views.length; i++) {
  const v = views[i];
  const { rgb, mask } = render(g, {
    w: W, h: H, yaw: v.yaw, pitch: 0.05, dist: 3.2,
    orthoHeight: v.ortho,
    target: { x: 0, y: v.cy, z: 0 },
  });
  for (let p = 0; p < W * H; p++) {
    if (!mask[p]) {
      const t = Math.floor(p / W) / H;
      rgb[p * 3] = 238 - Math.round(16 * t);
      rgb[p * 3 + 1] = 240 - Math.round(15 * t);
      rgb[p * 3 + 2] = 244 - Math.round(11 * t);
    }
  }
  const png = await sharp(Buffer.from(rgb), { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
  const label = await sharp(Buffer.from(
    `<svg width="${W}" height="${LABEL}"><text x="0" y="23" font-family="Segoe UI, Arial" font-size="19" fill="#3b4252">${v.name}</text></svg>`
  )).png().toBuffer();
  const left = PAD + i * (W + GAP);
  layers.push({ input: label, left, top: PAD });
  layers.push({ input: png, left, top: PAD + LABEL });
}

const sheetW = PAD * 2 + W * 2 + GAP;
const sheetH = PAD * 2 + (H + LABEL) + GAP;
await sharp({ create: { width: sheetW, height: sheetH, channels: 3, background: { r: 255, g: 255, b: 255 } } })
  .composite(layers).png().toFile(`${OUT}/face.png`);
console.log(`wrote ${OUT}/face.png`, `${sheetW}x${sheetH}`);
