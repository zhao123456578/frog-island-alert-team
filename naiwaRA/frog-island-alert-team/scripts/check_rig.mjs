import * as THREE from 'three';
import { buildCharacter, makeClips } from '../src/mascot_rig.mjs';

const c = buildCharacter();
console.log('bones', c.bones.map((b) => `${b.name}@${b.position.toArray().map((v) => v.toFixed(3))}`).join(' '));
const g = c.mesh.geometry;
console.log('verts', g.attributes.position.count, 'tris', g.index.count / 3);
console.log('clips', Object.keys(c.clips).join(','));
const bb = g.boundingBox;
console.log('size', (bb.max.x - bb.min.x).toFixed(3), (bb.max.y - bb.min.y).toFixed(3), (bb.max.z - bb.min.z).toFixed(3));

const sw = g.attributes.skinWeight, si = g.attributes.skinIndex;
let maxBones = 0, nan = 0, badSum = 0, unmapped = 0;
for (let i = 0; i < sw.count; i++) {
  let n = 0, sum = 0;
  for (let j = 0; j < 4; j++) {
    const w = sw.getComponent(j);
    if (Number.isNaN(w)) nan++;
    sum += w;
    if (w > 1e-5) { n++; if (si.getComponent(j) >= c.bones.length) unmapped++; }
  }
  if (Math.abs(sum - 1) > 1e-3) badSum++;
  if (n > maxBones) maxBones = n;
}
console.log('maxBonesPerVert', maxBones, 'nan', nan, 'badWeightSum', badSum, 'unmappedIndex', unmapped);

// 把每条 clip 跑到中点，检查网格有没有真的动起来、有没有炸开
const root = new THREE.Group();
root.add(c.mesh);
for (const [name, clipDef] of Object.entries(c.clips)) {
  for (const b of c.bones) { b.position.set(...b.userData.rest ?? (b.userData.rest = b.position.toArray())); b.quaternion.identity(); b.scale.set(1, 1, 1); }
  const mixer = new THREE.AnimationMixer(root);
  const act = mixer.clipAction(clipDef);
  act.play();
  mixer.setTime(clipDef.duration * 0.4);
  root.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  let minY = Infinity, maxY = -Infinity, maxD = 0;
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    c.mesh.getVertexPosition(i, v);
    minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
    maxD = Math.max(maxD, v.distanceTo(new THREE.Vector3().fromBufferAttribute(p, i)));
  }
  console.log(name.padEnd(5), 'y', minY.toFixed(3), '->', maxY.toFixed(3), 'maxDisp', maxD.toFixed(3));
}
