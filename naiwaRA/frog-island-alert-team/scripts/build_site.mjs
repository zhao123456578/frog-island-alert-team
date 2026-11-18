// 组装可直接部署的 site/：游戏源码 + 资源 + 自包含的 three 依赖闭包。
// 依赖用递归解析而不是硬编码清单 —— 之前只拷 three.module.js 漏了它
// import 的 three.core.js，线上就是一个 404 白屏。
import {
  cpSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync, statSync,
} from 'node:fs';
import { dirname, join, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'site');
const three = join(root, 'node_modules/three');
const SRC = join(root, 'src/game');

const SPEC = /(?:from|import)\s*['"]([^'"]+)['"]/g;

// 按行取依赖并做可行性过滤：GLTFLoader 里有 `console.warn(\`… from "srgb-linear" to …\`)`
// 这种句子，全局正则会把模板字符串里的短语当成模块名。只保留看起来真的是模块的
// 相对路径、three 和能在 node_modules 里落地的包名。
const looksLikeModule = (s) => s.startsWith('.') || s.startsWith('/')
  || s === 'three' || s.startsWith('three/') || existsSync(join(root, 'node_modules', s));

function specsOf(text) {
  const list = [];
  for (const line of text.split('\n')) {
    if (/^\s*(\*|\/\/|\/\*)/.test(line)) continue;
    for (const m of line.matchAll(SPEC)) if (looksLikeModule(m[1])) list.push(m[1]);
  }
  return list;
}

function destOf(absSrc) {
  const rel = relative(three, absSrc).split(/[\\/]/).join('/');
  if (!rel.startsWith('..')) return join(out, 'vendor/three', rel);
  throw new Error(`依赖跳出 three 包：${absSrc}`);
}

function walk(spec, fromFile, seen) {
  let abs;
  if (spec === 'three') abs = join(three, 'build/three.module.js');
  else if (spec.startsWith('three/addons/')) abs = join(three, 'examples/jsm', spec.slice('three/addons/'.length));
  else if (spec.startsWith('three/')) abs = join(three, spec.slice('three/'.length));
  else if (spec.startsWith('./') || spec.startsWith('../')) abs = resolve(dirname(fromFile), spec);
  else if (spec.startsWith('/') || isAbsolute(spec)) return; // 站点内绝对/相对路径，随源码一起拷
  else throw new Error(`没有映射的裸模块：${spec}（来自 ${relative(root, fromFile)}）`);

  if (!abs.endsWith('.js')) abs += '.js';
  if (!existsSync(abs)) throw new Error(`找不到 ${abs}`);
  if (seen.has(abs)) return;
  seen.add(abs);

  const dst = destOf(abs);
  mkdirSync(dirname(dst), { recursive: true });
  cpSync(abs, dst);
  for (const spec of specsOf(readFileSync(dst, 'utf8'))) walk(spec, abs, seen);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

for (const f of readdirSync(SRC)) {
  const s = join(SRC, f);
  if (statSync(s).isFile()) cpSync(s, join(out, f));
}

const glb = join(root, 'output/mascot.glb');
if (!existsSync(glb)) throw new Error('缺少 output/mascot.glb，先跑 node scripts/build_glb.mjs');
mkdirSync(join(out, 'assets'), { recursive: true });
cpSync(glb, join(out, 'assets/mascot.glb'));

const seen = new Set();
walk('three', join(out, 'noop.js'), seen);
for (const f of readdirSync(out)) {
  if (!/\.(js|mjs)$/.test(f)) continue;
  const text = readFileSync(join(out, f), 'utf8');
  // 自己的源码用严格模式：跳过注释行但不做可行性过滤，引入任何新依赖都必须显式映射
  const own = text.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).flatMap((l) => [...l.matchAll(SPEC)].map((m) => m[1]));
  for (const spec of own) {
    if (!spec.startsWith('three') && !spec.startsWith('.')) throw new Error(`${f} 引用了 ${spec}`);
    if (spec.startsWith('three')) walk(spec, join(out, f), seen);
  }
}

// 入口 HTML 里的 <script src> 也要真的存在
const html = readFileSync(join(out, 'index.html'), 'utf8');
for (const m of html.matchAll(/(?:src|href)="(\.\/[^"]+)"/g)) {
  const p = join(out, m[1].slice(2));
  if (!existsSync(p)) throw new Error(`index.html 引用的 ${m[1]} 不在站点里`);
}
// importmap 的映射目标是 JSON 字符串，上面那条正则看不见，单独查
const imap = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
for (const [k, v] of Object.entries(imap)) {
  const p = join(out, v.slice(2));
  if (!existsSync(v.endsWith('/') ? p : p)) throw new Error(`importmap 的 ${k} → ${v} 落空`);
}

const files = [];
(function scan(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) scan(p);
    else files.push([relative(out, p).split(/[\\/]/).join('/'), statSync(p).size]);
  }
})(out);
files.sort((a, b) => b[1] - a[1]);
const kb = (n) => (n / 1024).toFixed(0).padStart(6) + ' KB';

console.log('site/ 内容：');
for (const [p, n] of files) console.log(`  ${kb(n)}  ${p}`);
console.log(`  ${kb(files.reduce((s, f) => s + f[1], 0))}  合计 ${files.length} 个文件`);
console.log(`three 依赖闭包 ${seen.size} 个模块，全部来自 node_modules/three`);
writeFileSync(join(out, 'build-info.json'), JSON.stringify({
  builtAt: new Date().toISOString(),
  three: JSON.parse(readFileSync(join(three, 'package.json'), 'utf8')).version,
  files: Object.fromEntries(files),
}, null, 2));
