(function (global) {
  "use strict";

  global.createShiftPopulation = function (ctx) {
    const THREE = global.THREE, scene = ctx.scene, camera = ctx.camera;
    const S = ctx.state || {}, audio = ctx.audio;
    const colliders = ctx.colliders || [], objects = ctx.objects || [];
    if (!THREE || !scene || !camera) throw new Error("ShiftPopulation: scene/camera/THREE required");
    const group = new THREE.Group(), roomGroup = new THREE.Group(), downGroup = new THREE.Group();
    group.name = "夜班奶蛙群"; roomGroup.name = "摸鱼房新增奶蛙"; downGroup.name = "围栏倒地半身群";
    group.add(roomGroup, downGroup); scene.add(group);
    const room = [], fallen = [], batches = [], errors = [];
    const loading = { room: "loading", halfbody: "loading" };
    const modelInfo = { skinned: null, triangles: 0, materials: 0 };
    let started = false, clock = 0, downPoseTime = 0, roomUpdates = 0;
    let seed = 13713;
    function random() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    function smooth(a, b, v) { const u = clamp((v - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); }
    const distance = (p, x, z) => Math.hypot(p.x - x, p.z - z);
    const inRoom = p => p.x >= -21 && p.x <= -13 && p.z >= -84 && p.z <= -68;
    const frustum = new THREE.Frustum(), projection = new THREE.Matrix4();
    const sphere = new THREE.Sphere(new THREE.Vector3(), 1.35);
    const downSphere = new THREE.Sphere(new THREE.Vector3(-0.4, 0.65, -76.65), 5.7);
    const downFade = { value: 0 };
    const scratch = new THREE.Matrix4();

    // Opaque dithering avoids sorting/double-sided transparency passes during distance fades.
    function fadeMaterial(source, uniform) {
      const mat = source.clone(), original = source.onBeforeCompile;
      const originalKey = source.customProgramCacheKey.call(source);
      mat.onBeforeCompile = function (shader, renderer) {
        original.call(mat, shader, renderer);
        shader.uniforms.uShiftPopulationFade = uniform;
        shader.fragmentShader = "uniform float uShiftPopulationFade;\n" + shader.fragmentShader.replace(
          "#include <clipping_planes_fragment>",
          "#include <clipping_planes_fragment>\nif (uShiftPopulationFade < 0.999 && fract(52.9829189 * fract(dot(floor(gl_FragCoord.xy), vec2(0.06711056, 0.00583715)))) >= uShiftPopulationFade) discard;"
        );
      };
      mat.customProgramCacheKey = () => originalKey + ":shift-population-fade-v1";
      return mat;
    }

    const roomPositions = [
      [-19.60, -79.70], [-19.65, -76.45], [-19.60, -73.00], [-19.50, -69.70],
      [-18.25, -80.00], [-18.10, -76.40], [-18.90, -71.35], [-18.05, -69.80],
      [-14.75, -79.70], [-14.80, -77.30], [-14.80, -74.75], [-14.80, -72.20],
      [-14.95, -69.65], [-16.10, -76.65], [-16.25, -73.30], [-16.25, -70.45]
    ];
    roomPositions.forEach(p => colliders.push({ type: "cyl", x: p[0], z: p[1], r: 0.45, h: 0.68, sight: false }));
    function buildRoom() {
      roomPositions.forEach((p, i) => {
        const height = 1.45 + random() * 0.25, actor = global.FrogActor.create(height);
        const fade = { value: 0 }, materials = new Map();
        actor.root.name = "摸鱼奶蛙·群 " + (i + 1);
        actor.root.position.set(p[0], 0.015, p[1]);
        actor.root.rotation.y = Math.atan2(p[0] + 17.2, p[1] + 75.5) + (random() - 0.5) * 1.5;
        actor.root.traverse(mesh => {
          if (!mesh.isMesh) return;
          const own = source => {
            if (!materials.has(source)) materials.set(source, fadeMaterial(source, fade));
            return materials.get(source);
          };
          mesh.material = Array.isArray(mesh.material) ? mesh.material.map(own) : own(mesh.material);
          mesh.castShadow = false; mesh.receiveShadow = false;
        });
        const mode = ["idle", "sit", "idle", "play"][i % 4];
        if (mode !== "idle") actor.root.position.y += height * 0.024;
        actor.update(0.2 + random() * 0.8, mode, 0.28 + random() * 0.28);
        actor.root.visible = false;
        roomGroup.add(actor.root); objects.push({ name: actor.root.name, obj: actor.root });
        room.push({ actor, fade, mode, height, amount: 0.28 + random() * 0.25,
          speed: 0.68 + random() * 0.32, poseTime: random() * 0.15, anchor: i % 3 === 0 });
      });
    }

    function loadHalfbody() {
      return new Promise((resolve, reject) => {
        if (!global.GLTFLoader || !global.MILKFROG_HALF_B64) {
          reject(new Error("ShiftPopulation: preload GLTFLoader and milkfrog_halfbody_data.js")); return;
        }
        try {
          const text = global.atob(global.MILKFROG_HALF_B64), bytes = new Uint8Array(text.length);
          for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
          new global.GLTFLoader().parse(bytes.buffer, "", resolve, reject);
        } catch (err) { reject(err); }
      });
    }

    function buildHalfbody(gltf) {
      const source = gltf.scene, parts = [];
      source.updateMatrixWorld(true);
      source.traverse(mesh => { if (mesh.isMesh) parts.push(mesh); });
      modelInfo.skinned = parts.some(mesh => mesh.isSkinnedMesh || mesh.geometry.attributes.skinIndex);
      if (!parts.length || modelInfo.skinned || parts.some(mesh => Object.keys(mesh.geometry.morphAttributes).length)) {
        throw new Error("ShiftPopulation: halfbody must be the static, non-skinned down reference");
      }
      const box = new THREE.Box3().setFromObject(source), center = box.getCenter(new THREE.Vector3());
      const normalize = new THREE.Matrix4().makeTranslation(-center.x, -box.min.y, -center.z);
      const localParts = parts.map(mesh => ({ mesh, matrix: new THREE.Matrix4().multiplyMatrices(normalize, mesh.matrixWorld) }));
      const positions = [
        [-1.24, -73.55], [0.37, -73.45], [-0.56, -74.70], [-1.10, -75.75],
        [0.38, -75.50], [-0.48, -76.80], [-1.23, -77.35], [0.30, -77.65],
        [-0.60, -78.25], [-1.15, -79.60], [0.40, -79.45], [-0.10, -80.00]
      ];
      const shapes = [[1.13, 0.83, 0.77], [0.72, 1.16, 0.96], [0.91, 0.91, 0.83], [1.02, 1.09, 0.72]];
      const tints = [[1, 0.97, 0.87], [0.88, 0.99, 0.90], [0.97, 0.90, 0.86], [0.91, 0.94, 1]];
      const vertex = new THREE.Vector3(), bounds = new THREE.Box3();
      positions.forEach((p, i) => {
        const shape = shapes[i % shapes.length], variation = 0.90 + random() * 0.13;
        const scale = new THREE.Vector3(shape[0], shape[1], shape[2]).multiplyScalar(variation);
        const rotation = new THREE.Euler((random() - 0.5) * 0.18, random() * Math.PI * 2, (random() - 0.5) * 0.14, "YXZ");
        const base = new THREE.Matrix4().compose(new THREE.Vector3(), new THREE.Quaternion().setFromEuler(rotation), scale);
        bounds.makeEmpty();
        // Measure actual vertices once: tilted bodies touch the floor, not an empty bounding-box corner.
        localParts.forEach(part => {
          scratch.multiplyMatrices(base, part.matrix);
          const attr = part.mesh.geometry.attributes.position;
          for (let j = 0; j < attr.count; j++) bounds.expandByPoint(vertex.fromBufferAttribute(attr, j).applyMatrix4(scratch));
        });
        const x = clamp(p[0], -2.07 - bounds.min.x, 1.30 - bounds.max.x);
        const z = clamp(p[1], -80.75 - bounds.min.z, -72.55 - bounds.max.z);
        base.setPosition(x, 0.014 - bounds.min.y, z);
        const marker = new THREE.Group(); marker.name = "倒地半身奶蛙 " + (i + 1);
        marker.position.set(x, 0.014, z); marker.userData.populationInstance = i;
        downGroup.add(marker); objects.push({ name: marker.name, obj: marker });
        fallen.push({ x, z, base, matrix: base.clone(), scale: scale.toArray(), yaw: rotation.y,
          tint: new THREE.Color().fromArray(tints[i % tints.length]), phase: random() * Math.PI * 2,
          speed: 0.75 + random() * 0.65 });
      });
      localParts.forEach(part => {
        const materials = Array.isArray(part.mesh.material) ? part.mesh.material : [part.mesh.material];
        const owned = materials.map(sourceMat => {
          const mat = fadeMaterial(sourceMat, downFade);
          if (mat.roughness !== undefined) mat.roughness = Math.min(0.9, mat.roughness + 0.1);
          if (mat.metalness !== undefined) mat.metalness = 0;
          return mat;
        });
        const mesh = new THREE.InstancedMesh(part.mesh.geometry, Array.isArray(part.mesh.material) ? owned : owned[0], fallen.length);
        mesh.name = "倒地群·材质批 " + (batches.length + 1);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = true;
        fallen.forEach((actor, i) => {
          mesh.setMatrixAt(i, scratch.multiplyMatrices(actor.matrix, part.matrix));
          mesh.setColorAt(i, actor.tint);
        });
        downGroup.add(mesh); batches.push({ mesh, local: part.matrix });
        modelInfo.triangles += (mesh.geometry.index ? mesh.geometry.index.count : mesh.geometry.attributes.position.count) / 3;
        modelInfo.materials += owned.length;
      });
      downGroup.visible = false;
    }

    function failed(key, err) { loading[key] = "error"; errors.push(key + ": " + (err.message || String(err))); }
    const roomReady = Promise.resolve().then(() => {
      if (!global.FrogActor) throw new Error("ShiftPopulation: FrogActor required");
      return global.FrogActor.ready;
    }).then(() => { buildRoom(); loading.room = "ready"; }).catch(err => failed("room", err));
    const halfReady = loadHalfbody().then(gltf => { buildHalfbody(gltf); loading.halfbody = "ready"; }).catch(err => failed("halfbody", err));
    const ready = Promise.all([roomReady, halfReady]).then(() => status());

    const voices = [
      { id: "sfx_frog_laugh_raw", loop: false, rate: 0.78, offset: 0.12, gain: 0.082, x: -19.55, z: -79.55, zone: "room", wait: 0.4 },
      { id: "sfx_frog_laugh_raw", loop: false, rate: 0.88, offset: 0.31, gain: 0.074, x: -14.85, z: -77.15, zone: "room", wait: 2.7 },
      { id: "sfx_frog_laugh_raw", loop: false, rate: 0.97, offset: 0.47, gain: 0.086, x: -18.15, z: -72.85, zone: "room", wait: 5.1 },
      { id: "sfx_frog_laugh_raw", loop: false, rate: 1.07, offset: 0.63, gain: 0.072, x: -19.45, z: -69.85, zone: "room", wait: 7.6 },
      { id: "sfx_frog_laugh_raw", loop: false, rate: 1.16, offset: 0.76, gain: 0.078, x: -15.05, z: -71.15, zone: "room", wait: 10.2 },
      { id: "sfx_breath", loop: true, rate: 0.73, offset: 0.53, gain: 0.022, x: -18.6, z: -74.4, zone: "room" }
    ];
    voices.forEach((v, i) => Object.assign(v, { a: null, volume: 0, retry: 0, pending: false, seek: null,
      age: 0, length: 0, serial: i, pan: 0, spatial: null }));
    const MAX_VOICE_GAIN = 0.16, listenDirection = new THREE.Vector3();
    let spatialFailed = false,audioAcc = 0,audioSuspended = false;
    function held() { return !started || S.started === false || !!S.pause || !!document.hidden || !audio || !!audio.muted; }
    function tracked(a, on) {
      if (!audio || !audio.playing) return;
      if (on) audio.playing.add(a); else audio.playing.delete(a);
    }
    function seekVoice(v) {
      if (v.seek === null || !v.a || !Number.isFinite(v.a.duration) || v.a.duration <= 0) return;
      try { v.a.currentTime = clamp(v.seek, 0, 0.92) * v.a.duration; v.seek = null; } catch (_) { /* Metadata may still be pending. */ }
    }
    function bindSpatial(v, a) {
      if (v.spatial || spatialFailed) return;
      if (global.MFAudio) {
        const n = MFAudio.attach(a, "voice", 0);
        if (n) { v.spatial = n; MFAudio.setGain(a, 0); a.volume = 1; return; }
      }
      spatialFailed = true;
    }
    function createVoice(v) {
      if (v.a || !audio || !audio.ready || v.retry > 0) return;
      v.retry = 3;
      if (!audio.srcOf(v.id)) return;
      const result = v.loop ? audio.loop(v.id, 0) : audio.play(v.id, 0);
      const a = result && (result.a || result);
      if (!a) return;
      v.a = a; v.retry = 0; a.volume = 0; a.loop = v.loop; a.playbackRate = v.rate;
      a.preservesPitch = false; a.webkitPreservesPitch = false;
      bindSpatial(v, a);
      a.muted = held(); v.seek = v.offset;
      a.addEventListener("loadedmetadata", () => seekVoice(v));
      a.addEventListener("error", () => { v.retry = 8; });
      seekVoice(v);
      if (held()) { a.pause(); tracked(a, false); }
    }
    function resumeVoice(v) {
      const a = v.a;
      if (!a || !a.paused || v.pending || v.retry > 0 || a.error) return;
      v.pending = true; tracked(a, true);
      try {
        Promise.resolve(a.play()).then(() => {
          v.pending = false;
          if (held()) { a.pause(); tracked(a, false); }
        }, () => { v.pending = false; v.retry = 2; tracked(a, false); });
      } catch (_) { v.pending = false; v.retry = 2; tracked(a, false); }
    }
    function applyVoice(v) {
      if (!v.a) return;
      if (v.spatial && global.MFAudio) {
        MFAudio.setGain(v.a, clamp(v.volume, 0, v.gain));
        MFAudio.setPan(v.a, v.pan);
        v.a.volume = 1;
      } else v.a.volume = clamp(v.volume, 0, v.gain);
    }
    function suspendAudio() {
      voices.forEach(v => {
        v.volume = 0;
        if (v.a) {
          applyVoice(v); v.a.muted = true; v.a.pause(); tracked(v.a, false);
        }
      });
    }
    function attenuation(v, p) {
      if (v.nearest) {
        const west = distance(p, -17.6, -75.5) < distance(p, -0.5, -76.2);
        v.zone = west ? "room" : "pen"; v.x = west ? -18.6 : -0.55; v.z = west ? -74.4 : -76.2;
      }
      let d = distance(p, v.x, v.z), wall = 1;
      if (v.zone === "room" && !inRoom(p)) {
        const doorDistance = distance(p, -13, -82.4);
        d = Math.max(d, doorDistance + Math.hypot(v.x + 13, v.z + 82.4));
        wall = p.x >= -13 && p.z < -78 && p.z > -89 ? 0.44 : 0.10;
      } else if (v.zone === "pen" && p.x < -13) wall = 0.10;
      if (p.x < -13 && p.z > -68 && p.z < -56) wall *= 0.22;
      const falloff = 1 / (1 + Math.pow(d / 7.5, 2));
      return wall * falloff * (1 - smooth(25, 42, d));
    }
    function updateAudio(dt) {
      if (held() || dt <= 0) { suspendAudio(); return; }
      camera.getWorldDirection(listenDirection);
      const forwardLength = Math.hypot(listenDirection.x, listenDirection.z) || 1;
      const rightX = -listenDirection.z / forwardLength, rightZ = listenDirection.x / forwardLength;
      voices.forEach((v, i) => {
        v.retry = Math.max(0, v.retry - dt);
        const spatial = attenuation(v, camera.position);
        const dx = v.x - camera.position.x, dz = v.z - camera.position.z;
        v.pan = clamp((dx * rightX + dz * rightZ) / (Math.hypot(dx, dz) || 1), -0.85, 0.85);
        let envelope = 0.82 + 0.10 * Math.sin(clock * (0.29 + i * 0.07) + i * 2.1);
        if (!v.loop) {
          if (v.length <= 0) {
            v.wait -= dt;
            if (v.wait <= 0 && spatial > 0.035 && audio.ready) {
              v.age = 0; v.length = 1.7 + random() * 1.7; v.serial++;
              v.offset = 0.10 + (v.serial * 0.137 % 0.72);
              createVoice(v); v.seek = v.offset; seekVoice(v); resumeVoice(v);
            }
          } else {
            v.age += dt;
            if (v.age >= v.length) {
              v.length = 0; v.wait = 4.8 + random() * 8.5;
              if (v.a) { v.a.pause(); tracked(v.a, false); }
            }
          }
          envelope = v.length > 0 ? smooth(0, 0.35, v.age) * (1 - smooth(v.length - 0.65, v.length, v.age)) : 0;
        } else createVoice(v);
        const target = v.gain * spatial * envelope;
        v.volume += (target - v.volume) * (1 - Math.exp(-dt * (target > v.volume ? 3.2 : 6)));
        if (!v.a) return;
        v.a.muted = false;
        if ((v.loop || v.length <= 0) && v.volume < 0.0005 && target < 0.0005) {
          applyVoice(v); v.a.pause(); tracked(v.a, false);
        } else { tracked(v.a, true); resumeVoice(v); }
      });
      const total = voices.reduce((sum, v) => sum + v.volume, 0), scale = total > MAX_VOICE_GAIN ? MAX_VOICE_GAIN / total : 1;
      voices.forEach(v => { v.volume *= scale; applyVoice(v); });
    }
    document.addEventListener("visibilitychange", () => { if (document.hidden) suspendAudio(); });
    global.addEventListener("pagehide", suspendAudio);

    function update(t, dt) {
      dt = Number.isFinite(dt) ? clamp(dt, 0, 0.25) : 0;
      if (!S.pause && !document.hidden && S.started !== false) clock += dt;
      audioAcc += dt;
      if (held()) {
        if (!audioSuspended) { updateAudio(0); audioSuspended = true; }
      } else {
        audioSuspended = false;
        if (audioAcc >= 0.05) { updateAudio(audioAcc); audioAcc = 0; }
      }
      group.visible = S.showChar !== false;
      roomUpdates = 0;
      if (S.pause || document.hidden) return;
      camera.updateMatrixWorld();
      frustum.setFromProjectionMatrix(projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      room.forEach(f => {
        const root = f.actor.root, d = distance(camera.position, root.position.x, root.position.z);
        const target = 1 - smooth(f.anchor ? 29 : 18, f.anchor ? 42 : 27, d);
        f.fade.value += (target - f.fade.value) * (1 - Math.exp(-dt * 4));
        sphere.center.set(root.position.x, root.position.y + 0.75, root.position.z);
        root.visible = f.fade.value > 0.004 && frustum.intersectsSphere(sphere);
        if (!root.visible || d > 30) { f.poseTime = 0; return; }
        const interval = d < 10 ? 0.10 : d < 18 ? 0.28 : 0.75;
        f.poseTime += dt;
        if (f.poseTime >= interval) {
          f.actor.update(Math.min(1, f.poseTime * f.speed), f.mode, f.amount);
          f.poseTime = 0; roomUpdates++;
        }
      });
      const d = distance(camera.position, -0.4, -76.65);
      downFade.value += (1 - smooth(23, 36, d) - downFade.value) * (1 - Math.exp(-dt * 3));
      downGroup.visible = fallen.length > 0 && downFade.value > 0.004 && frustum.intersectsSphere(downSphere);
      downPoseTime += dt;
      const interval = d < 12 ? 1 / 12 : 0.3;
      if (downGroup.visible && d < 26 && downPoseTime >= interval) {
        downPoseTime %= interval;
        fallen.forEach(f => {
          const breath = 1 + Math.sin(clock * f.speed + f.phase) * 0.017;
          f.matrix.copy(f.base);
          const e = f.matrix.elements;
          e[1] *= breath; e[5] *= breath; e[9] *= breath;
          e[13] = 0.014 + (e[13] - 0.014) * breath;
        });
        batches.forEach(batch => {
          fallen.forEach((f, i) => batch.mesh.setMatrixAt(i, scratch.multiplyMatrices(f.matrix, batch.local)));
          batch.mesh.instanceMatrix.needsUpdate = true;
        });
      } else if (!downGroup.visible) downPoseTime = 0;
    }
    function start() {
      started = true;
      if (!held()) voices.forEach(v => { if (v.loop) createVoice(v); });
    }
    function status() {
      return {
        started, ready: loading.room === "ready" && loading.halfbody === "ready", loading: { ...loading }, errors: errors.slice(),
        room: { count: room.length, visible: room.filter(f => f.actor.root.visible).length, updatedLastFrame: roomUpdates,
          positions: room.map(f => [f.actor.root.position.x, f.actor.root.position.y, f.actor.root.position.z]),
          colliderRadius: 0.28, modes: room.map(f => f.mode) },
        fallen: { count: fallen.length, visible: downGroup.visible ? fallen.length : 0, batches: batches.length,
          source: "assets/milkfrog_halfbody_data.js", ...modelInfo,
          positions: fallen.map(f => [f.x, 0.014, f.z]), fade: downFade.value },
        audio: { held: held(), muted: !!(audio && audio.muted),
          volume: voices.reduce((sum, v) => sum + (v.a && !v.a.paused && !v.a.muted ? v.volume : 0), 0),
          maxGain: MAX_VOICE_GAIN, spatial: !!global.MFAudio, layers: voices.map(v => ({ id: v.id, loop: v.loop,
            rate: v.rate, zone: v.zone, source: [v.x, v.z], pan: v.pan, active: v.length > 0,
            loaded: !!v.a, playing: !!(v.a && !v.a.paused), tracked: !!(v.a && audio.playing && audio.playing.has(v.a)),
            volume: v.volume, time: v.a ? v.a.currentTime : 0, error: v.a && v.a.error ? v.a.error.code : null })) }
      };
    }
    return { ready, start, update, status };
  };
})(window);
