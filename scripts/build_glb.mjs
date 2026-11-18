import * as THREE from 'three';
import { writeFileSync, mkdirSync } from 'node:fs';
import { buildCharacter } from '../src/mascot_rig.mjs';

// GLTFExporter 只用 FileReader 把 Blob 变成 ArrayBuffer
if (!globalThis.FileReader) {
  globalThis.FileReader = class {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then(
        (b) => { this.result = b; this.onloadend?.(); },
        (e) => this.onerror?.(e)
      );
    }
  };
}

const c = buildCharacter();
c.mesh.castShadow = true;

const root = new THREE.Group();
root.name = 'Mascot_Rig';
root.add(c.mesh);

const clips = Object.values(c.clips);
const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
const glb = await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: false, animations: clips });

mkdirSync('output', { recursive: true });
writeFileSync('output/mascot.glb', Buffer.from(glb));

const bb = c.mesh.geometry.boundingBox;
console.log('vertices', c.mesh.geometry.attributes.position.count,
  'triangles', Math.round(c.mesh.geometry.index.count / 3),
  'bones', c.bones.length, 'clips', clips.map((x) => x.name).join(','));
console.log('size m =',
  (bb.max.x - bb.min.x).toFixed(3), (bb.max.y - bb.min.y).toFixed(3), (bb.max.z - bb.min.z).toFixed(3));
console.log('wrote output/mascot.glb', (glb.byteLength / 1024).toFixed(0) + ' KB');

// 回读一遍：导出能不能被自己的加载器吃回去，才算真的能用
const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
const loader = new GLTFLoader();
const parsed = await new Promise((res, rej) => loader.parse(glb, '', res, rej));
let skinned = null, verts = 0;
parsed.scene.traverse((o) => { if (o.isSkinnedMesh && !skinned) { skinned = o; verts = o.geometry.attributes.position.count; } });
console.log('reload: animations', parsed.animations.map((a) => `${a.name}(${a.duration.toFixed(2)}s,${a.tracks.length}trk)`).join(' '));
console.log('reload: skinnedMesh', !!skinned, 'verts', verts, 'skeleton bones', skinned ? skinned.skeleton.bones.length : 0);
