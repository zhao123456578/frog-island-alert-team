(function (global) {
  "use strict";
  const THREE = global.THREE;
  const CAB = { width: 1.16, depth: 0.64, height: 2.02, doorW: 0.568, doorT: 0.032, faceZ: 0.315 };
  const labelCache = new WeakMap(), materialCache = new WeakMap();
  let surfaceTextures, geometryTemplates;

  function canvasTexture(w, h, paint) {
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    paint(canvas.getContext("2d"), w, h);
    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    return texture;
  }

  function surfaces() {
    if (surfaceTextures) return surfaceTextures;
    let seed = 13;
    const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    const grunge = canvasTexture(128, 128, (ctx, w, h) => {
      ctx.fillStyle = "#c2c5b9"; ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 1700; i++) {
        ctx.fillStyle = i % 3 ? "rgba(32,38,29,0.10)" : "rgba(240,237,209,0.20)";
        ctx.fillRect(random() * w | 0, random() * h | 0, 1 + (random() * 3 | 0), 1 + (random() * 5 | 0));
      }
      for (let i = 0; i < 36; i++) {
        ctx.fillStyle = "rgba(89,54,34,0.18)";
        ctx.fillRect(random() * w | 0, random() * h | 0, 1 + random() * 3, 3 + random() * 23);
      }
    });
    const rust = canvasTexture(64, 64, (ctx, w, h) => {
      ctx.fillStyle = "#acaaa0"; ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 700; i++) {
        ctx.fillStyle = i % 3 ? "rgba(100,56,33,0.32)" : "rgba(43,38,27,0.20)";
        ctx.fillRect(random() * w | 0, random() * h | 0, 1 + random() * 4, 1 + random() * 3);
      }
    });
    const streak = canvasTexture(32, 128, (ctx, w, h) => {
      const gradient = ctx.createLinearGradient(0, 0, 0, h);
      gradient.addColorStop(0, "rgba(96,56,38,0.70)");
      gradient.addColorStop(0.35, "rgba(110,64,42,0.40)");
      gradient.addColorStop(1, "rgba(90,56,40,0)");
      ctx.fillStyle = gradient;
      for (let i = 0; i < 6; i++) ctx.fillRect(3 + random() * 22, 0, 2 + random() * 5, 50 + random() * 78);
    });
    grunge.wrapS = grunge.wrapT = rust.wrapS = rust.wrapT = THREE.RepeatWrapping;
    surfaceTextures = { grunge, rust, streak };
    return surfaceTextures;
  }

  function labels(labelTexture, number) {
    let cache = labelCache.get(labelTexture);
    if (!cache) {
      cache = { warning: labelTexture(["请 勿 躲 藏"], "#d8d2b8", "#7a2a1e", { w: 256, h: 64, size: 34 }), numbers: new Map() };
      labelCache.set(labelTexture, cache);
    }
    if (!cache.numbers.has(number)) {
      const card = labelTexture([number, "STAFF"], "#d8d2b8", "#4a2a20", { w: 96, h: 128, size: 30 });
      const stencil = canvasTexture(64, 64, ctx => {
        ctx.fillStyle = "rgba(232,232,214,0.86)";
        ctx.font = "bold 44px monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(number, 32, 36, 60);
        for (let i = 0; i < 60; i++) ctx.clearRect((i * 23 + 7) % 64, (i * 17 + 3) % 64, 2, 1);
      });
      cache.numbers.set(number, { card, stencil, label: cache.warning });
    }
    return cache.numbers.get(number);
  }

  function materials(psMat, labelTexture, number) {
    let cache = materialCache.get(psMat);
    if (!cache) {
      const tex = surfaces();
      const common = {
        body: psMat({ color: 0x99a096, map: tex.grunge }),
        door: psMat({ color: 0xa6ada1, map: tex.grunge }),
        frame: psMat({ color: 0x606762 }),
        steel: psMat({ color: 0x878e86, map: tex.rust }),
        liner: psMat({ color: 0x3b4136, lit: false, map: tex.grunge }),
        dark: psMat({ color: 0x292e28, lit: false }),
        streak: psMat({ map: tex.streak, transparent: true, opacity: 0.55, lit: false, grunge: false })
      };
      common.streak.depthWrite = false;
      cache = { common, labels: new WeakMap() };
      materialCache.set(psMat, cache);
    }
    const textures = labels(labelTexture, number);
    let result = cache.labels.get(textures);
    if (!result) {
      result = Object.assign({}, cache.common, {
        card: psMat({ map: textures.card, lit: false, grunge: false }),
        label: psMat({ map: textures.label, lit: false, grunge: false }),
        stencil: psMat({ map: textures.stencil, transparent: true, lit: false, grunge: false })
      });
      result.stencil.depthWrite = false;
      cache.labels.set(textures, result);
    }
    return result;
  }

  function batch() {
    const buckets = new Map();
    function add(role, geometry, x, y, z, rz) {
      if (rz) geometry.rotateZ(rz);
      geometry.translate(x, y, z);
      const flat = geometry.index ? geometry.toNonIndexed() : geometry;
      if (!buckets.has(role)) buckets.set(role, { position: [], normal: [], uv: [] });
      const bucket = buckets.get(role);
      for (const key of ["position", "normal", "uv"]) {
        const values = flat.getAttribute(key).array;
        for (let i = 0; i < values.length; i++) bucket[key].push(values[i]);
      }
      if (flat !== geometry) flat.dispose();
      geometry.dispose();
    }
    return {
      add,
      box(role, w, h, d, x, y, z, rz) { add(role, new THREE.BoxGeometry(w, h, d), x, y, z, rz); },
      plane(role, w, h, x, y, z) { add(role, new THREE.PlaneGeometry(w, h), x, y, z); },
      finish() {
        const result = new Map();
        buckets.forEach((attributes, role) => {
          const geometry = new THREE.BufferGeometry();
          for (const key of ["position", "normal", "uv"]) geometry.setAttribute(key, new THREE.Float32BufferAttribute(attributes[key], key === "uv" ? 2 : 3));
          geometry.computeBoundingBox(); geometry.computeBoundingSphere();
          result.set(role, geometry);
        });
        return result;
      }
    };
  }

  function buildBody() {
    const b = batch(), W = CAB.width, D = CAB.depth, H = CAB.height, Z = CAB.faceZ;
    b.box("body", W - 0.02, 1.90, 0.03, 0, 1, -D / 2 + 0.015);
    for (const side of [-1, 1]) b.box("body", 0.035, 1.90, D, side * (W / 2 - 0.0175), 1, 0);
    b.box("body", W, 0.035, D, 0, H - 0.0175, 0);
    b.box("body", W, 0.035, D, 0, 0.095, 0);
    b.box("frame", W - 0.06, 0.06, D - 0.10, 0, 0.03, -0.02);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add("dark", new THREE.CylinderGeometry(0.026, 0.032, 0.045, 6), sx * (W / 2 - 0.07), 0.0225, sz * (D / 2 - 0.07));
    b.box("frame", W + 0.04, 0.022, D + 0.03, 0, 1.999, 0.005);
    b.box("liner", W - 0.10, 1.86, 0.008, 0, 1, -D / 2 + 0.036);
    b.box("liner", W - 0.12, 0.02, 0.44, 0, 1.87, -0.06);
    b.add("steel", new THREE.CylinderGeometry(0.011, 0.011, 1, 6), 0, 1.78, -0.05, Math.PI / 2);
    b.add("steel", new THREE.TorusGeometry(0.028, 0.006, 4, 8, Math.PI * 1.4), 0, 1.80, -0.05, 0.5);
    for (const side of [-1, 1]) b.box("steel", 0.30, 0.012, 0.012, 0, 1.75, -0.05, side * 0.32);
    b.box("liner", 0.05, 1.22, 0.014, 0, 0.72, Z - 0.045);
    b.box("liner", 0.05, 0.47, 0.014, 0, 1.705, Z - 0.045);
    b.box("dark", 0.016, 1.23, 0.030, 0, 0.715, Z);
    b.box("dark", 0.016, 0.48, 0.030, 0, 1.710, Z);
    b.box("frame", W, 0.05, 0.03, 0, 1.975, Z - 0.01);
    b.box("frame", W, 0.05, 0.03, 0, 0.075, Z - 0.01);
    for (const side of [-1, 1]) b.box("frame", 0.03, 1.90, 0.03, side * (W / 2 - 0.015), 1, Z - 0.01);
    return b.finish();
  }

  function buildDoor(side) {
    const b = batch(), W = CAB.doorW, T = CAB.doorT, H0 = 0.10, H1 = 1.95;
    const cutX = 0.528, low = 1.33, high = 1.47, X = x => -side * x, rz = T / 2 + 0.004;
    // 闭门时 x∈(-0.047,0.047)、y∈(1.33,1.47) 为贯穿开口，门板、暗衬与包边均不跨缝。
    for (const [role, depth, z] of [["door", T, 0], ["liner", 0.005, -T / 2 - 0.003]]) {
      b.box(role, W, H1 - high, depth, X(W / 2), (high + H1) / 2, z);
      b.box(role, W, low - H0, depth, X(W / 2), (low + H0) / 2, z);
      b.box(role, cutX, high - low, depth, X(cutX / 2), (low + high) / 2, z);
    }
    b.box("dark", 0.020, high - low + 0.026, T + 0.008, X(cutX - 0.010), 1.40, 0);
    b.box("dark", 0.068, 0.012, T + 0.008, X(W - 0.034), high + 0.006, 0);
    b.box("dark", 0.068, 0.012, T + 0.008, X(W - 0.034), low - 0.006, 0);
    b.box("frame", 0.014, H1 - H0 - 0.02, 0.008, X(0.012), (H0 + H1) / 2, rz);
    b.box("frame", 0.014, low - H0, 0.008, X(W - 0.012), (H0 + low) / 2, rz);
    b.box("frame", 0.014, H1 - high, 0.008, X(W - 0.012), (high + H1) / 2, rz);
    for (const y of [H0 + 0.006, H1 - 0.006]) b.box("frame", W - 0.02, 0.012, 0.008, X(W / 2), y, rz);
    for (let i = 0; i < 6; i++) {
      const y = 0.16 + i * 0.33;
      if (y > 1.20 && y < 1.66) continue;
      for (const x of [0.026, W - 0.026]) b.box("frame", 0.012, 0.012, 0.008, X(x), y, rz + 0.002);
    }
    for (let i = 0; i < 4; i++) b.box("dark", 0.30, 0.012, 0.006, X(0.32), 0.30 + i * 0.045, T / 2 + 0.005);
    b.box("frame", 0.036, 0.15, 0.014, X(0.535), 1.02, T / 2 + 0.008);
    b.box("steel", 0.085, 0.024, 0.026, X(0.50), 1.055, T / 2 + 0.026);
    b.box("steel", 0.022, 0.05, 0.022, X(0.535), 1.055, T / 2 + 0.026);
    b.box("frame", 0.20, 0.02, 0.016, X(0.30), 1.72, -T / 2 - 0.01);
    if (side < 0) b.plane("card", 0.13, 0.17, X(0.43), 1.10, T / 2 + 0.006);
    else {
      b.plane("label", 0.26, 0.065, X(0.31), 1.10, T / 2 + 0.006);
      b.plane("stencil", 0.10, 0.12, X(0.455), 1.80, T / 2 + 0.006);
    }
    for (const [x, top, bottom] of [[0.16, 1.10, 0.12], [0.42, 0.87, 0.12], [0.50, 0.65, 0.12]]) b.plane("streak", 0.05, top - bottom, X(x), (top + bottom) / 2, T / 2 + 0.007);
    for (const y of [0.34, 1.02, 1.72]) b.add("steel", new THREE.CylinderGeometry(0.017, 0.017, 0.10, 6), X(0.004), y, T / 2 - 0.002);
    return b.finish();
  }

  function attach(parent, template, mats) {
    template.forEach((geometry, role) => {
      const mesh = new THREE.Mesh(geometry, mats[role]);
      mesh.name = "hiding-locker-" + role;
      parent.add(mesh);
    });
  }

  global.createHidingLocker = function (options) {
    const { psMat, labelTexture, number = 13 } = options || {};
    if (!THREE || typeof psMat !== "function" || typeof labelTexture !== "function") throw new TypeError("createHidingLocker requires THREE, psMat and labelTexture");
    if (!geometryTemplates) geometryTemplates = { body: buildBody(), left: buildDoor(-1), right: buildDoor(1) };
    const mats = materials(psMat, labelTexture, String(number));
    const root = new THREE.Group(), doors = [], eye = { x: 0, y: 1.4, z: 0.155 };
    root.name = "hiding-locker-" + number;
    attach(root, geometryTemplates.body, mats);
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.name = side < 0 ? "left-door" : "right-door";
      pivot.position.set(side * (CAB.width / 2 - 0.005), 0, CAB.faceZ);
      attach(pivot, side < 0 ? geometryTemplates.left : geometryTemplates.right, mats);
      root.add(pivot); doors.push({ pivot, side });
    }
    root.userData.eye = new THREE.Vector3(eye.x, eye.y, eye.z);
    root.userData.doors = doors;
    return {
      root, doors, eye, width: CAB.width, depth: CAB.depth, height: CAB.height,
      setOpen(value) {
        const numeric = Number(value), amount = Number.isFinite(numeric) ? Math.max(0, Math.min(1, numeric)) : 0;
        for (const door of doors) door.pivot.rotation.y = door.side * 1.80 * amount;
      }
    };
  };
})(window);
