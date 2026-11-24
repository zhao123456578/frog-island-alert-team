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
      const a = new Uint8ClampedArray(w * h);
      for (let i = 0; i < w * h; i++) a[i] = px[i * 4 + 3];
      // 1px 邻域 alpha bleed：透明像素取邻域内最不透明邻居的 RGB
      for (let y = 0; y < h; y++) {
        for (let i0 = 0; i0 < w; i0++) {
          const i = y * w + i0;
          if (a[i] >= 250) continue;
          let ba = 0, br = 0, bg = 0, bb = 0;
          for (let dy = -1; dy <= 1; dy++) {
            const ny = y + dy; if (ny < 0 || ny >= h) continue;
            for (let dx = -1; dx <= 1; dx++) {
              const nx = i0 + dx; if (nx < 0 || nx >= w) continue;
              const j = ny * w + nx;
              if (a[j] > ba) { ba = a[j]; const o = j * 4; br = px[o]; bg = px[o + 1]; bb = px[o + 2]; }
            }
          }
          if (ba > 0 && a[i] < ba) { const o = i * 4; px[o] = br; px[o + 1] = bg; px[o + 2] = bb; }
        }
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
  if (!texture || !texture.image || cache.has(texture.image)) return Promise.resolve(texture);
  return bleedCanvas(texture.image).then(() => { texture.needsUpdate = true; return texture; });
}

/* 材质补丁：alpha < 0.30 直接 discard（不依赖普通透明混合），残留半透明像素
   按 alpha 压暗 rgb（预乘修正），避免边缘泛灰/泛黑。 */
function patch(mat, threshold) {
  const th = threshold === undefined ? 0.30 : threshold;
  mat.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <alphatest_fragment>",
        "#include <alphatest_fragment>\n" +
        "if (diffuseColor.a < " + th.toFixed(3) + ") discard;\n" +
        "diffuseColor.rgb *= smoothstep(" + th.toFixed(3) + ", 0.62, diffuseColor.a);");
  };
  mat.needsUpdate = true;
  return mat;
}

return { process, patch };
})();
