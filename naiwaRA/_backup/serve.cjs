const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.wav': 'audio/wav', '.glb': 'model/gltf-binary', '.png': 'image/png', '.m4a': 'audio/mp4', '.json': 'application/json', '.md': 'text/plain; charset=utf-8' };
http.createServer((req, res) => {
  if (req.method === 'POST' && req.url.startsWith('/_save')) {
    const name = new URL(req.url, 'http://x').searchParams.get('name') || 'shot';
    let body = ''; req.on('data', c => body += c); req.on('end', () => {
      const b64 = body.replace(/^data:image\/png;base64,/, '');
      const out = path.join(ROOT, '_backup', name.replace(/[^\w.\-]/g, '_') + '.png');
      fs.writeFile(out, Buffer.from(b64, 'base64'), e => { res.writeHead(e ? 500 : 200); res.end(e ? 'err' : 'ok'); });
    }); return;
  }
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/' || p === '') p = '/index.html';
  const f = path.resolve(ROOT, '.' + p);
  if (!f.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': mime[path.extname(f)] || 'application/octet-stream' }); res.end(d);
  });
}).listen(8765, () => console.log('serving ' + ROOT + ' on 8765'));