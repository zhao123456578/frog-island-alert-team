@echo off
chcp 65001 >nul
cd /d "%~dp0"
set PORT=8137
where py >nul 2>nul
if %errorlevel%==0 goto :py
where python >nul 2>nul
if %errorlevel%==0 goto :python
where node >nul 2>nul
if %errorlevel%==0 goto :node
echo 未找到 py / python / node 任一运行时，请安装后重试，或自行用本地服务器打开本目录。
pause
goto :eof
:py
start /b py -m http.server %PORT%
goto :open
:python
start /b python -m http.server %PORT%
goto :open
:node
start /b node -e "const h=require('http'),f=require('fs'),p=require('path');h.createServer((q,s)=>{let u=decodeURIComponent(q.url.split('?')[0]);if(u==='/'||u==='')u='/index.html';const fp=p.join(process.cwd(),u);f.readFile(fp,(e,d)=>{if(e){s.statusCode=404;s.end('404');return;}const t={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.png':'image/png','.jpg':'image/jpeg','.glb':'model/gltf-binary','.obj':'text/plain','.wav':'audio/wav','.mp3':'audio/mpeg','.json':'application/json','.css':'text/css'}[p.extname(fp)]||'application/octet-stream';s.setHeader('Content-Type',t);s.end(d);});}).listen(8137);"
goto :open
:open
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:%PORT%/index.html"
echo 本地服务已启动（端口 %PORT%），保持本窗口打开；关闭窗口即停服。
echo 室外驾驶直接访问 http://127.0.0.1:%PORT%/outdoor.html?from=factory^&act=3
pause >nul