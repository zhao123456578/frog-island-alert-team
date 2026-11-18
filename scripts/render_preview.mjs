import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { render } from '../src/soft_render.mjs';

// MODEL=mascot renders the original 稳稳 mascot; the default stays on 奶蛙.
const WHICH = process.env.MODEL || 'naiwa';
const mod = await import(`../src/${WHICH}_model.mjs`);
const build = mod.buildMascotGeometry || mod.buildBodyGeometry;
const OUT = WHICH === 'naiwa' ? 'output/preview' : `output/preview/${WHICH}`;

const g = build();
console.log('model', WHICH, 'triangles', g.index.count / 3);

const PW = Number(process.env.PW) || 420, PH = Number(process.env.PH) || 560;
const views = [
  { name: '正面 FRONT', file: 'front', yaw: 0, pitch: 0.06 },
  { name: '侧面 SIDE', file: 'side', yaw: Math.PI / 2, pitch: 0.06 },
  { name: '背面 BACK', file: 'back', yaw: Math.PI, pitch: 0.06 },
  { name: '3/4 视角', file: 'three4', yaw: Math.PI * 0.28, pitch: 0.16 },
];

mkdirSync(OUT, { recursive: true });

const GAP = 26, PAD = 34, LABEL = 30;
const sheetW = PAD * 2 + PW * 2 + GAP;
const sheetH = PAD * 2 + (PH + LABEL) * 2 + GAP;

const overlays = [];
for (let i = 0; i < views.length; i++) {
  const v = views[i];
  const { rgb } = render(g, { w: PW, h: PH, yaw: v.yaw, pitch: v.pitch, dist: 3.15 });

  // flat light-grey backdrop behind the shaded pixels (renderer leaves 0 outside)
  for (let p = 0; p < PW * PH; p++) {
    if (rgb[p * 3] === 0 && rgb[p * 3 + 1] === 0 && rgb[p * 3 + 2] === 0) {
      const t = Math.floor(p / PW) / PH;
      rgb[p * 3] = 238 - Math.round(16 * t);
      rgb[p * 3 + 1] = 240 - Math.round(15 * t);
      rgb[p * 3 + 2] = 244 - Math.round(11 * t);
    }
  }

  const png = await sharp(Buffer.from(rgb), { raw: { width: PW, height: PH, channels: 3 } })
    .png().toBuffer();
  await sharp(png).toFile(`${OUT}/${v.file}.png`);

  const label = Buffer.from(
    `<svg width="${PW}" height="${LABEL}"><text x="0" y="21" font-family="Segoe UI, Arial" font-size="19" fill="#3b4252">${v.name}</text></svg>`
  );
  const labelPng = await sharp(label).png().toBuffer();

  const left = PAD + (i % 2) * (PW + GAP);
  const top = PAD + Math.floor(i / 2) * (PH + LABEL + GAP);
  overlays.push({ input: labelPng, left, top });
  overlays.push({ input: png, left, top: top + LABEL });
}

await sharp({ create: { width: sheetW, height: sheetH, channels: 3, background: { r: 255, g: 255, b: 255 } } })
  .composite(overlays).png().toFile(`${OUT}/sheet.png`);
console.log(`wrote ${OUT}/sheet.png`, sheetW + 'x' + sheetH);
