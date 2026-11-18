const V3 = (x, y, z) => ({ x, y, z });
const sub = (a, b) => V3(a.x - b.x, a.y - b.y, a.z - b.z);
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a, b) => V3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
const norm = (a) => { const l = Math.hypot(a.x, a.y, a.z) || 1; return V3(a.x / l, a.y / l, a.z / l); };

const L1 = norm(V3(0.55, 0.72, 0.42));
const L2 = norm(V3(-0.62, 0.28, -0.45));

const toSrgb = (c) => {
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(v * 255)));
};

/**
 * Software rasteriser — no GPU needed, used for automated shape checks.
 * Returns shaded RGB plus a boolean coverage mask.
 */
export function render(geometry, {
  w, h, yaw, pitch, dist,
  fovDeg = 34,
  target = V3(0, 0.75, 0),
  shade = true,
  orthoHeight = 0,
}) {
  const pos = geometry.attributes.position.array;
  const nor = geometry.attributes.normal.array;
  const col = geometry.attributes.color.array;
  const idx = geometry.index.array;

  const ortho = orthoHeight > 0;
  const eye = V3(
    target.x + dist * Math.cos(pitch) * Math.sin(yaw),
    target.y + dist * Math.sin(pitch),
    target.z + dist * Math.cos(pitch) * Math.cos(yaw)
  );
  const fwd = norm(sub(target, eye));
  const right = norm(cross(fwd, V3(0, 1, 0)));
  const up = cross(right, fwd);
  // ortho keeps screen rows exactly linear in world height, which the
  // silhouette measurements rely on; perspective does not.
  const f = ortho ? h / orthoHeight : (h / 2) / Math.tan((fovDeg * Math.PI) / 180 / 2);

  const rgb = new Uint8Array(w * h * 3);
  const mask = new Uint8Array(w * h);
  const depth = new Float32Array(w * h).fill(-Infinity);

  const cache = new Float32Array(pos.length);
  for (let i = 0; i < pos.length; i += 3) {
    const d = sub(V3(pos[i], pos[i + 1], pos[i + 2]), eye);
    const cz = dot(d, fwd);
    if (ortho) {
      cache[i] = w / 2 + dot(d, right) * f;
      cache[i + 1] = h / 2 - dot(d, up) * f;
      cache[i + 2] = -cz;
      continue;
    }
    cache[i] = w / 2 + (dot(d, right) / cz) * f;
    cache[i + 1] = h / 2 - (dot(d, up) / cz) * f;
    cache[i + 2] = cz > 1e-6 ? 1 / cz : -Infinity;
  }

  const triCount = idx.length / 3;
  for (let t = 0; t < triCount; t++) {
    const i0 = idx[t * 3] * 3, i1 = idx[t * 3 + 1] * 3, i2 = idx[t * 3 + 2] * 3;
    const ax = cache[i0], ay = cache[i0 + 1], az = cache[i0 + 2];
    const bx = cache[i1], by = cache[i1 + 1], bz = cache[i1 + 2];
    const cx = cache[i2], cy = cache[i2 + 1], cz = cache[i2 + 2];
    if (!isFinite(az) || !isFinite(bz) || !isFinite(cz)) continue;

    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (area === 0) continue;
    const inv = 1 / area;

    let minX = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
    let maxX = Math.min(w - 1, Math.ceil(Math.max(ax, bx, cx)));
    let minY = Math.max(0, Math.floor(Math.min(ay, by, cy)));
    let maxY = Math.min(h - 1, Math.ceil(Math.max(ay, by, cy)));
    if (maxX < minX || maxY < minY) continue;

    const n0 = V3(nor[i0], nor[i0 + 1], nor[i0 + 2]);
    const n1 = V3(nor[i1], nor[i1 + 1], nor[i1 + 2]);
    const n2 = V3(nor[i2], nor[i2 + 1], nor[i2 + 2]);
    const c0 = V3(col[i0], col[i0 + 1], col[i0 + 2]);
    const c1 = V3(col[i1], col[i1 + 1], col[i1 + 2]);
    const c2 = V3(col[i2], col[i2 + 1], col[i2 + 2]);

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5 - ax, py = y + 0.5 - ay;
        const u = (px * (cy - ay) - py * (cx - ax)) * inv;
        const v = (py * (bx - ax) - px * (by - ay)) * inv;
        const ww = 1 - u - v;
        if (u < 0 || v < 0 || ww < 0) continue;

        const iz = ww * az + u * bz + v * cz;
        const di = y * w + x;
        if (iz <= depth[di]) continue;
        depth[di] = iz;
        mask[di] = 1;

        let nx = ww * n0.x + u * n1.x + v * n2.x;
        let ny = ww * n0.y + u * n1.y + v * n2.y;
        let nz = ww * n0.z + u * n1.z + v * n2.z;
        const nl = Math.hypot(nx, ny, nz) || 1;
        nx /= nl; ny /= nl; nz /= nl;

        // The loft builds outward normals by construction and the primitives
        // come with them, so no view-side flip is needed. Flipping per pixel
        // instead jumps brightness wherever n·fwd crosses zero, which is what
        // drew a hard ridge across the back and under the chin.
        let r = ww * c0.x + u * c1.x + v * c2.x;
        let g = ww * c0.y + u * c1.y + v * c2.y;
        let b = ww * c0.z + u * c1.z + v * c2.z;

        if (shade) {
          const d1 = Math.max(0, nx * L1.x + ny * L1.y + nz * L1.z);
          const d2 = Math.max(0, nx * L2.x + ny * L2.y + nz * L2.z);
          const s = 0.30 + 0.16 * (ny * 0.5 + 0.5) + 1.05 * d1 + 0.34 * d2;
          r *= s; g *= s; b *= s;
        }
        const o = di * 3;
        // attributes.color is linear (see paint()), lighting is done in linear,
        // so the byte write is where the sRGB transfer belongs.
        rgb[o] = toSrgb(r); rgb[o + 1] = toSrgb(g); rgb[o + 2] = toSrgb(b);
      }
    }
  }
  return { rgb, mask };
}

/** Trace the boundary of a coverage mask; returns a Uint8Array edge map. */
export function edges(mask, w, h) {
  const e = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (mask[i] !== mask[i - 1] || mask[i] !== mask[i + 1] ||
          mask[i] !== mask[i - w] || mask[i] !== mask[i + w]) e[i] = 1;
    }
  }
  return e;
}
