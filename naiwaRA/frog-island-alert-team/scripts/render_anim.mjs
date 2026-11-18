import * as THREE from 'three';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { render } from '../src/soft_render.mjs';
import { buildCharacter } from '../src/mascot_rig.mjs';

const FRAME_W = Number(process.env.FW) || 300;
const FRAME_H = Number(process.env.FH) || 380;
const N = Number(process.env.N) || 6;
const YAW = Number(process.env.YAW) || 0.62;
const OUT = 'output/preview/mascot/anim';
mkdirSync(OUT, { recursive: true });

const c = buildCharacter();
const root = new THREE.Group();
root.add(c.mesh);
const bindPos = c.mesh.geometry.attributes.position;
const colAttr = c.mesh.geometry.attributes.color;
const idxAttr = c.mesh.geometry.index;
const restPos = c.bones.map((b) => b.position.toArray());
const v = new THREE.Vector3();

// 每帧把骨骼复位、推进到 t、再在 CPU 上跑一遍蒙皮，喂给软件光栅器。
// 没有 GPU，WebGL 那套 SkinnedMesh 着色在这里用不上。
function posedGeometry(mixer, act, t) {
  for (let i = 0; i < c.bones.length; i++) {
    c.bones[i].position.fromArray(restPos[i]);
    c.bones[i].quaternion.identity();
    c.bones[i].scale.set(1, 1, 1);
  }
  act.reset().play();
  mixer.setTime(t);
  root.updateMatrixWorld(true);

  const p = new Float32Array(bindPos.count * 3);
  for (let i = 0; i < bindPos.count; i++) {
    v.fromBufferAttribute(bindPos, i);
    c.mesh.applyBoneTransform(i, v);
    p[i * 3] = v.x; p[i * 3 + 1] = v.y; p[i * 3 + 2] = v.z;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.setAttribute('color', colAttr);
  g.setIndex(idxAttr);
  g.computeVertexNormals();
  return g;
}

const GAP = 16, PAD = 26, LAB = 34;
const order = ['idle', 'walk', 'run', 'jump', 'land', 'wave'];
const sheetW = PAD * 2 + N * FRAME_W + (N - 1) * GAP;
const rowH = LAB + FRAME_H;
const sheetH = PAD * 2 + order.length * rowH + (order.length - 1) * GAP;
const layers = [];
let cursorY = PAD;

for (const name of order) {
  const clip = c.clips[name];
  const oneShot = !!clip.userData.oneShot;
  const mixer = new THREE.AnimationMixer(root);
  const act = mixer.clipAction(clip, root, oneShot ? THREE.LoopOnce : THREE.LoopRepeat);
  act.clampWhenFinished = true;

  const label = await sharp(Buffer.from(
    `<svg width="${sheetW}" height="${LAB}"><text x="0" y="24" font-family="Segoe UI, Arial" font-size="20" fill="#3b4252">` +
    `${name} — ${oneShot ? '单次' : '循环'} ${clip.duration.toFixed(2)}s · ${clip.tracks.length} 条轨道</text></svg>`
  )).png().toBuffer();
  layers.push({ input: label, left: PAD, top: cursorY });

  for (let i = 0; i < N; i++) {
    const t = (i / (N - 1)) * clip.duration;
    const g = posedGeometry(mixer, act, t);
    const { rgb } = render(g, {
      w: FRAME_W, h: FRAME_H, yaw: YAW, pitch: 0.08, dist: 3.4, target: { x: 0, y: 0.78, z: 0 },
    });
    for (let q = 0; q < FRAME_W * FRAME_H; q++) {
      if (rgb[q * 3] === 0 && rgb[q * 3 + 1] === 0 && rgb[q * 3 + 2] === 0) {
        const f = Math.floor(q / FRAME_W) / FRAME_H;
        rgb[q * 3] = 238 - Math.round(16 * f);
        rgb[q * 3 + 1] = 240 - Math.round(15 * f);
        rgb[q * 3 + 2] = 244 - Math.round(11 * f);
      }
    }
    const png = await sharp(Buffer.from(rgb), { raw: { width: FRAME_W, height: FRAME_H, channels: 3 } })
      .composite([{
        input: Buffer.from(
          `<svg width="${FRAME_W}" height="30"><text x="8" y="21" font-family="Segoe UI, Arial" font-size="18" fill="#ffffff">t=${t.toFixed(2)}s</text></svg>`),
        left: 0, top: 0,
      }])
      .png().toBuffer();
    layers.push({ input: png, left: PAD + i * (FRAME_W + GAP), top: cursorY + LAB });
  }
  cursorY += rowH + GAP;
  console.log('row', name, 'y', (cursorY - rowH).toFixed(0));
}

await sharp({ create: { width: sheetW, height: sheetH, channels: 3, background: { r: 255, g: 255, b: 255 } } })
  .composite(layers).png().toFile(`${OUT}/filmstrip.png`);
console.log(`wrote ${OUT}/filmstrip.png`, `${sheetW}x${sheetH}`);
