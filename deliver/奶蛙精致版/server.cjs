'use strict';
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawn}=require('node:child_process');
const root=__dirname;
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8',
  '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon',
  '.glb':'model/gltf-binary','.gltf':'model/gltf+json','.obj':'text/plain; charset=utf-8','.txt':'text/plain; charset=utf-8',
  '.css':'text/css; charset=utf-8','.wav':'audio/wav','.mp3':'audio/mpeg','.m4a':'audio/mp4','.ogg':'audio/ogg'};
const server=http.createServer(async(req,res)=>{
  /* v4.3：?shot= 调试模式会把 PNG POST 到 /_save。以前静态服务器只收 GET，
     控制台会多出一条 405。这里接收并存到系统临时目录，不污染试玩包。 */
  if(req.url&&req.url.startsWith('/_save')){
    const chunks=[];
    req.on('data',c=>chunks.push(c));
    req.on('end',()=>{
      try{
        const name=new URL(req.url,'http://127.0.0.1').searchParams.get('name')||'shot.png';
        const safe=String(name).replace(/[^a-zA-Z0-9_.-]/g,'_').slice(-80);
        fs.writeFileSync(path.join(os.tmpdir(),'mf_shot_'+safe),Buffer.concat(chunks));
      }catch(e){}
      res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8'}).end('saved');
    });
    return;
  }
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405,{Allow:'GET, HEAD'}).end();return;}
  let rel;
  try{rel=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname).replace(/^\/+/, '');}
  catch{res.writeHead(400).end('Bad path');return;}
  const file=path.resolve(root,rel||'index.html');
  if(!file.startsWith(root+path.sep)||rel.includes('\0')||rel.split(/[\\/]/).includes('_runtime')){
    res.writeHead(403).end('Forbidden');return;
  }
  const type=types[path.extname(file).toLowerCase()];
  if(!type){res.writeHead(404).end('Not found');return;}
  let stat;
  try{stat=await fs.promises.stat(file);if(!stat.isFile())throw new Error('Not a file');}
  catch{res.writeHead(404).end('Not found');return;}
  let start=0,end=stat.size-1,status=200;
  if(req.headers.range){
    const match=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
    if(match){start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),end):end;}
    if(!match||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=stat.size){
      res.writeHead(416,{'Content-Range':'bytes */'+stat.size}).end();return;
    }
    status=206;
  }
  const headers={'Content-Type':type,'Content-Length':end-start+1,'Accept-Ranges':'bytes',
    'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'};
  if(status===206)headers['Content-Range']=`bytes ${start}-${end}/${stat.size}`;
  res.writeHead(status,headers);
  if(req.method==='HEAD'||stat.size===0){res.end();return;}
  const stream=fs.createReadStream(file,{start,end});
  stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
});
let port=8138;
for(const arg of process.argv.slice(2))if(arg.startsWith('--port=')){
  port=Number(arg.slice(7));
  if(!Number.isInteger(port)||port<0||port>65535)throw new Error('Invalid port');
}
let retries=0;
server.on('error',error=>{
  if(error.code==='EADDRINUSE'&&retries++<10){port=port<65535?port+1:0;server.listen(port,'127.0.0.1');}
  else{console.error('启动失败：'+error.message);process.exitCode=1;}
});
server.on('listening',()=>{
  const url='http://127.0.0.1:'+server.address().port+'/start.html';
  console.log('\n奶蛙：午夜奶厂 + 夜班归途 · 整合试玩 Demo v4.4\n'+url+'\n\n从封面「开始游戏」进入，或点「关卡目录」直接选章节。\n请保持此窗口打开；关闭窗口或按 Ctrl+C 停止。\n');
  if(!process.argv.includes('--no-open')){
    const child=spawn('rundll32.exe',['url.dll,FileProtocolHandler',url],{windowsHide:true,stdio:'ignore'});
    child.on('error',()=>console.log('请手动在浏览器打开上方地址。'));
  }
});
process.on('SIGINT',()=>{server.close();server.closeAllConnections();});
server.listen(port,'127.0.0.1');
