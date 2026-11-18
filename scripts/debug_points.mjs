import * as THREE from 'three';
import { buildWorld, STEP_UP } from '../src/game/world.mjs';

const s = new THREE.Scene();
const w = buildWorld(s);
for (const p of w.points) {
  const hits = w.colliders.filter((c) => c.y1 > STEP_UP &&
    Math.abs(p.x - c.x) < c.ex + 1.0 && Math.abs(p.z - c.z) < c.ez + 1.0);
  if (!hits.length) continue;
  const boxes = hits.map((c) =>
    `box(${c.x.toFixed(1)},${c.z.toFixed(1)}) ${(c.ex * 2).toFixed(1)}x${(c.ez * 2).toFixed(1)} h${(c.y1 - c.y0).toFixed(2)}`
  ).join(' | ');
  console.log(p.id.padEnd(14), p.type.padEnd(9), `(${p.x.toFixed(1)},${p.z.toFixed(1)})`, '->', boxes);
}
