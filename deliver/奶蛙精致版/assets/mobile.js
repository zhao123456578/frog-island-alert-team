(function(){
  'use strict';
  const params=new URLSearchParams(location.search);
  const ua=navigator.userAgent||'';
  const isIOS=/iPhone|iPad|iPod/i.test(ua)||(/Macintosh/.test(ua)&&navigator.maxTouchPoints>1);
  const isWeChat=/MicroMessenger/i.test(ua);
  const isQoder=/Qoder/i.test(ua);
  const isTouch=('ontouchstart' in window)||navigator.maxTouchPoints>0||params.has('touch')||
    (window.matchMedia&&matchMedia('(pointer: coarse)').matches)||/Android|iPhone|iPad|iPod|Mobile|HarmonyOS/i.test(ua);
  const standalone=(window.matchMedia&&matchMedia('(display-mode: standalone)').matches)||window.navigator.standalone===true;
  const joysticks=[];
  let rotateRoot=null,clipRoot=null,lastPortrait=null,lastWidth=0,lastHeight=0,requesting=false;
  function physicalViewport(){
    const vv=window.visualViewport;
    return {width:vv&&vv.width>0?vv.width:window.innerWidth,height:vv&&vv.height>0?vv.height:window.innerHeight};
  }
  function rotated(){const p=physicalViewport();return isTouch&&p.height>p.width;}
  function viewport(){
    const p=physicalViewport(),portrait=isTouch&&p.height>p.width;
    return portrait?{width:p.height,height:p.width,physicalWidth:p.width,physicalHeight:p.height,portrait:true,rotated:true}:
      {width:p.width,height:p.height,physicalWidth:p.width,physicalHeight:p.height,portrait:false,rotated:false};
  }
  function isLandscape(){return isTouch?true:physicalViewport().width>physicalViewport().height;}
  function ensureRotateRoot(){
    if(!isTouch||!document.body)return;
    if(!clipRoot){
      clipRoot=document.createElement('div');
      clipRoot.id='mf-viewport-clip';
      for(const node of Array.from(document.body.childNodes)){
        if(node.nodeType===1&&node.id==='qoder-sites-watermark')continue;
        clipRoot.appendChild(node);
      }
      document.body.appendChild(clipRoot);
    }
    if(!rotateRoot){
      rotateRoot=document.createElement('div');
      rotateRoot.id='mf-landscape-root';
      for(const node of Array.from(clipRoot.childNodes))rotateRoot.appendChild(node);
      clipRoot.appendChild(rotateRoot);
    }
  }
  function point(e){
    if(!rotated())return {x:e.clientX,y:e.clientY};
    return {x:e.clientY,y:window.innerWidth-e.clientX};
  }
  function motion(e){
    const x=e.movementX||0,y=e.movementY||0;
    return rotated()?{x:y,y:-x}:{x,y};
  }
  function sync(){
    const physical=physicalViewport(),portrait=isTouch&&physical.height>physical.width;
    const vp=portrait?{width:physical.height,height:physical.width}:physical;
    ensureRotateRoot();
    window.__mfOrientationBlocked=false;
    window.__mfViewport={...vp,physicalWidth:physical.width,physicalHeight:physical.height,portrait,rotated:portrait};
    document.documentElement.style.setProperty('--mf-vw',vp.width+'px');
    document.documentElement.style.setProperty('--mf-vh',vp.height+'px');
    if(document.body){
      document.body.classList.toggle('mf-touch',isTouch);
      document.body.classList.toggle('mf-portrait',portrait);
      document.body.classList.toggle('mf-landscape',!portrait);
      document.body.classList.toggle('mf-compact',vp.height<=500);
      document.body.classList.toggle('mf-ultra-compact',vp.height<=360);
    }
    if(vp.width!==lastWidth||vp.height!==lastHeight){
      lastWidth=vp.width;lastHeight=vp.height;
      window.dispatchEvent(new CustomEvent('mf:viewportchange',{detail:{...vp,landscape:true,portrait,rotated:portrait,isTouch}}));
    }
    if(lastPortrait!==portrait){
      lastPortrait=portrait;
      window.dispatchEvent(new CustomEvent('mf:orientationchange',{detail:{blocked:false,isTouch,landscape:true,portrait,rotated:portrait}}));
    }
  }
  function queueSync(){sync();}
  async function lockOrientation(){
    if(!screen.orientation||!screen.orientation.lock)return false;
    try{await screen.orientation.lock('landscape');return true;}catch(e){
      try{await screen.orientation.lock('landscape-primary');return true;}catch(err){return false;}
    }
  }
  async function requestLandscape(){
    if(!isTouch||requesting)return false;
    requesting=true;
    const candidates=[document.documentElement,document.body,document.getElementById('view')].filter(Boolean);
    for(const el of candidates){
      if(!el.requestFullscreen)continue;
      try{
        const pending=document.fullscreenElement?null:el.requestFullscreen();
        lockOrientation();
        if(pending)await pending;
        break;
      }catch(e){}
    }
    const locked=await lockOrientation();
    sync();requesting=false;
    return locked;
  }
  document.addEventListener('fullscreenchange',()=>{if(document.fullscreenElement&&isTouch)lockOrientation();});
  function continueLandscape(){sync();return true;}
  function createJoystick(options){
    const opts=options||{};
    const root=opts.element||document.createElement('div');
    if(!opts.element){
      root.className='mf-joystick';
      document.body.appendChild(root);
    }
    root.classList.add('mf-joystick');
    root.innerHTML='<div class="mf-joy-base" role="group" aria-label="虚拟摇杆"><div class="mf-joy-ring"></div><div class="mf-joy-knob"></div></div>';
    const base=root.querySelector('.mf-joy-base'),knob=root.querySelector('.mf-joy-knob');
    let pointer=null,cx=0,cy=0,radius=42,value={x:0,y:0};
    function emit(x,y,active){
      value={x,y};
      knob.style.transform='translate(calc(-50% + '+(x*radius).toFixed(1)+'px),calc(-50% + '+(y*radius).toFixed(1)+'px))';
      root.classList.toggle('active',!!active);
      base.setAttribute('aria-valuetext',active?'水平 '+(x*100).toFixed(0)+'，前后 '+(-y*100).toFixed(0):'居中');
      if(typeof opts.onChange==='function')opts.onChange({x,y,magnitude:Math.min(1,Math.hypot(x,y)),active:!!active});
    }
    function reset(){
      if(pointer!==null){
        try{if(base.hasPointerCapture(pointer))base.releasePointerCapture(pointer);}catch(e){}
      }
      pointer=null;emit(0,0,false);
    }
    base.addEventListener('pointerdown',e=>{
      if(e.pointerType==='mouse'&&e.button!==0)return;
      if(pointer!==null||(opts.enabled&&!opts.enabled()))return;
      e.preventDefault();
      const r=base.getBoundingClientRect();
      const center=point({clientX:r.left+r.width/2,clientY:r.top+r.height/2});
      cx=center.x;cy=center.y;radius=Math.max(24,(rotated()?r.height:r.width)*.34);
      pointer=e.pointerId;
      try{base.setPointerCapture(e.pointerId);}catch(err){}
      move(e);
    });
    function move(e){
      if(pointer===null||e.pointerId!==pointer)return;
      e.preventDefault();
      const p=point(e);
      let x=(p.x-cx)/radius,y=(p.y-cy)/radius;
      const len=Math.hypot(x,y);
      if(len>1){x/=len;y/=len;}
      if(Math.hypot(x,y)<.12){x=0;y=0;}
      emit(x,y,true);
    }
    base.addEventListener('pointermove',move);
    ['pointerup','pointercancel','lostpointercapture'].forEach(type=>base.addEventListener(type,e=>{
      if(pointer!==null&&e.pointerId===pointer)reset();
    }));
    base.addEventListener('contextmenu',e=>e.preventDefault());
    window.addEventListener('blur',reset);
    document.addEventListener('visibilitychange',()=>{if(document.hidden)reset();});
    const api={element:root,reset,value:()=>({...value})};
    joysticks.push(api);
    emit(0,0,false);
    return api;
  }
  window.MFMobile={isTouch,isIOS,isWeChat,isQoder,requestLandscape,sync,continueLandscape,viewport,point,motion,rotated,createJoystick,
    resetJoysticks:()=>joysticks.forEach(j=>j.reset())};
  window.addEventListener('resize',queueSync,{passive:true});
  window.addEventListener('orientationchange',queueSync,{passive:true});
  window.addEventListener('pageshow',queueSync,{passive:true});
  if(window.visualViewport)window.visualViewport.addEventListener('resize',queueSync,{passive:true});
  if(window.matchMedia){
    const q=matchMedia('(orientation: portrait)');
    if(q.addEventListener)q.addEventListener('change',queueSync);else if(q.addListener)q.addListener(queueSync);
  }
  if(screen.orientation&&screen.orientation.addEventListener)screen.orientation.addEventListener('change',queueSync);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sync,{once:true});else sync();
  sync();
})();
