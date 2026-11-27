/* 纸片 sprite 黑边修复（v4.5）
 * 问题：透明 PNG 图集在 GPU 双线性采样时，边缘像素会混到帧外透明区域的"黑底 RGB"，
 *      叠加 alphaTest 后仍然留下一圈黑边/黑框，看起来像脸贴在黑方块上。
 * 修法（三层）：
 *   1. alpha bleed：CPU 端把不透明像素的 RGB 渗入 1px 邻近透明/半透明像素，
 *      让边缘混合永远发生在"有效颜色"之间，而不是和黑色混色；
 *   2. alpha discard：材质 onBeforeCompile 里 alpha < 0.30 直接 discard，
 *      半透明垃圾边不再进入颜色缓冲；
 *   3. 边缘预乘修正：rgb *= alpha 的近似去黑边（对被 discard 后残留的
 *      低 alpha 像素再压暗一次，避免灰白亮框）。
 * 使用：window.MFSpriteFix.process(texture) -> Promise<Texture>（返回同尺寸 CanvasTexture）
 *      window.MFSpriteFix.patch(material)   -> 原材质（挂上 onBeforeCompile）
 */
window.MFSpriteFix = (function () {
"use strict";

const cache = new Map(); // img -> Promise<canvas>
const processed = new WeakSet();

function bleedCanvas(img) {
  let p = cache.get(img);
  if (p) return p;
  p = new Promise(resolve => {
    const w = img.width, h = img.height;
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const x = c.getContext("2d", { willReadFrequently: true });
    x.drawImage(img, 0, 0);
    try {
      const d = x.getImageData(0, 0, w, h), px = d.data;
      let rowA = new Uint8ClampedArray(w * 4), rowB = new Uint8ClampedArray(w * 4), rowC = new Uint8ClampedArray(w * 4);
      function horizontalRow(y, out) {
        if (y < 0 || y >= h) { out.fill(0); return; }
        const base = y * w * 4;
        for (let ix = 0; ix < w; ix++) {
          let ba = 0, br = 0, bg = 0, bb = 0;
          for (let dx = -1; dx <= 1; dx++) {
            const nx = ix + dx; if (nx < 0 || nx >= w) continue;
            const o = base + nx * 4, a = px[o + 3];
            if (a > ba) { ba = a; br = px[o]; bg = px[o + 1]; bb = px[o + 2]; }
          }
          const k = ix * 4; out[k] = ba; out[k + 1] = br; out[k + 2] = bg; out[k + 3] = bb;
        }
      }
      rowA.fill(0); horizontalRow(0, rowB);
      for (let y = 0; y < h; y++) {
        horizontalRow(y + 1, rowC);
        const base = y * w * 4;
        for (let ix = 0; ix < w; ix++) {
          const o = base + ix * 4, srcA = px[o + 3];
          if (srcA >= 250) continue;
          let ba = 0, br = 0, bg = 0, bb = 0;
          const k = ix * 4;
          if (rowA[k] > ba) { ba = rowA[k]; br = rowA[k + 1]; bg = rowA[k + 2]; bb = rowA[k + 3]; }
          if (rowB[k] > ba) { ba = rowB[k]; br = rowB[k + 1]; bg = rowB[k + 2]; bb = rowB[k + 3]; }
          if (rowC[k] > ba) { ba = rowC[k]; br = rowC[k + 1]; bg = rowC[k + 2]; bb = rowC[k + 3]; }
          if (ba > srcA) {
            px[o] = br; px[o + 1] = bg; px[o + 2] = bb;
            if (srcA === 0) px[o + 3] = 1;
          }
        }
        const swap = rowA; rowA = rowB; rowB = rowC; rowC = swap;
      }
      x.putImageData(d, 0, 0);
    } catch (e) { /* 跨域等异常时退回原图 */ }
    resolve(c);
  });
  cache.set(img, p);
  return p;
}

/* 把已加载的 Texture 的 image 换成 bleed 后的 canvas；原地修改，克隆共享同一 image */
function process(texture) {
  if (!texture || !texture.image || processed.has(texture.image)) return Promise.resolve(texture);
  const source = texture.image;
  return bleedCanvas(source).then(canvas => {
    texture.image = canvas;
    processed.add(source);
    processed.add(canvas);
    texture.needsUpdate = true;
    return texture;
  });
}

/* 材质补丁：alpha < 0.30 直接 discard（不依赖普通透明混合），残留半透明像素
   按 alpha 压暗 rgb（预乘修正），避免边缘泛灰/泛黑。 */
function patch(mat, threshold) {
  const th = threshold === undefined ? 0.30 : threshold;
  mat.onBeforeCompile = shader => {
    const token = "#include <alphatest_fragment>";
    if (!shader.fragmentShader.includes(token)) { console.warn("MFSpriteFix: alphaTest shader hook missing"); return; }
    shader.fragmentShader = shader.fragmentShader.replace(token,
      token + "\n" +
      "if (diffuseColor.a < " + th.toFixed(3) + ") discard;\n" +
      "diffuseColor.rgb *= smoothstep(" + th.toFixed(3) + ", 0.62, diffuseColor.a);");
  };
  mat.needsUpdate = true;
  return mat;
}

return { process, patch };
})();
