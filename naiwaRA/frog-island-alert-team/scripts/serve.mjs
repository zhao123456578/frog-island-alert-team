import { createServer } from 'node:http';
import { readFile, mkdirSync, writeFileSync } from 'node:fs';
import { readFile as readFileAsync } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';

// node scripts/serve.mjs [root] [port]
const root = resolve(process.argv[2] || '.');
const port = Number(process.argv[3] || 8099);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
};

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  // 开发用的截图落盘：页面把 canvas.toDataURL() POST 过来，只准写 root/_shots 下的 .png。
  // 无头环境下 in-app browser 没有可见 surface，take_screenshot 用不了，靠这条路取证。
  if (req.method === 'POST' && url.pathname === '/_save') {
    const name = String(url.searchParams.get('name') || '');
    if (!/^[\w.-]+\.png$/.test(name)) { res.writeHead(400).end('bad name'); return; }
    const parts = [];
    let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > 24e6) { res.writeHead(413).end('too big'); return; }
      parts.push(c);
    }
    const text = Buffer.concat(parts).toString('utf8');
    const dir = join(root, '_shots');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, name), Buffer.from(text.slice(text.indexOf(',') + 1), 'base64'));
    res.writeHead(200, { 'content-type': 'text/plain' }).end(`saved _shots/${name}`);
    return;
  }
  const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const file = resolve(join(root, rel));
  // 沙盒到 root 里：先解析成绝对路径再比前缀，相对 root 直接 startsWith 会全 403
  if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403).end('forbidden'); return; }
  try {
    let path = file;
    if (extname(file) === '') {
      // 目录要回 index.html：站点入口就是 /，回 200 空体会让浏览器白屏，误判成站点坏了
      path = join(file, 'index.html');
    }
    const buf = await readFileAsync(path);
    res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(buf);
  } catch (e) {
    res.writeHead(e.code === 'ENOENT' ? 404 : 500).end(e.code === 'ENOENT' ? 'not found' : 'error');
  }
}).listen(port, '127.0.0.1', () => console.log(`serving ${root} on http://127.0.0.1:${port}/`));
