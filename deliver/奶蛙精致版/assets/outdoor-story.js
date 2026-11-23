'use strict';

const ROADSIDE_S=286, HORDE_START_S=1070, HORDE_COUNT=14;
const driveStory={phase:'roadside',route:'undecided',hit:false,hitT:0,maxDist:0,previousPose:null,models:{},audioError:null,
  passedRoadside:false,forestPhase:'quiet',hordeTime:0,crowdGap:88,capture:false,captureSide:'',endingTime:0,doorOpened:false,doorClosed:false,knock1:false,knock2:false};
if(!q.has('intro'))document.body.classList.add('immersive-drive');

function projectRoadPoint(point,route,guess){
  let best=null;
  for(let s=Math.max(route==='main'?ROAD_S0:FORK_S,guess-70);s<=Math.min(ROAD_S1-1,guess+70);s+=1){
    const r=roadAt(s,route),dx=point.x-r.x,dz=point.z-r.z;
    const d=dx*dx+dz*dz;
    if(!best||d<best.d)best={s,r,d};
  }
  const r=best.r,along=(point.x-r.x)*Math.sin(r.th)-(point.z-r.z)*Math.cos(r.th);
  const s=best.s+Math.max(-1,Math.min(1,along)),p=roadAt(s,route);
  return {s,lat:(point.x-p.x)*Math.cos(p.th)+(point.z-p.z)*Math.sin(p.th),th:p.th,d:best.d};
}
function changeRoadReference(route){
  poseUpdate();
  const world={x:pose.x,z:pose.z,phi:pose.phi},p=projectRoadPoint(world,route,S.dist);
  driveRoute=route;S.dist=p.s;S.distPrev=p.s;S.lateral=p.lat-LANE_LAT;S.psi=world.phi-p.th;
  poseUpdate();
}
function updateRouteChoice(){
  if(driveStory.route!=='undecided')return;
  // 路口以原道路切线积分，松开方向盘才会真正直行，而不是被右弯坐标拖走。
  if(S.dist>=FORK_S&&driveRoute==='main')changeRoadReference('junction');
  if(driveRoute!=='junction')return;
  if(S.dist>FORK_S+24&&S.lateral>1.35){
    driveStory.route='home';changeRoadReference('main');
  }else if(S.dist>=FORK_S+56){
    poseUpdate();
    const main=projectRoadPoint(pose,'main',S.dist),forest=projectRoadPoint(pose,'forest',S.dist);
    const home=Math.abs(main.lat-LANE_LAT)<Math.abs(forest.lat);
    driveStory.route=home?'home':'forest';changeRoadReference(home?'main':'forest');
  }
}

const dirtTex=mkTex(256,512,(ctx,w,h)=>{
  ctx.fillStyle='#40372a';ctx.fillRect(0,0,w,h);
  for(let i=0;i<6000;i++){
    const k=35+Math.random()*45;
    ctx.fillStyle=`rgba(${k+13},${k+5},${k-10},.5)`;
    ctx.fillRect(Math.random()*w,Math.random()*h,1+Math.random()*4,1+Math.random()*7);
  }
  [0.27,0.73].forEach(u=>{
    const g=ctx.createLinearGradient((u-.12)*w,0,(u+.12)*w,0);
    g.addColorStop(0,'#40372a');g.addColorStop(.5,'#27261e');g.addColorStop(1,'#40372a');
    ctx.fillStyle=g;ctx.fillRect((u-.12)*w,0,w*.24,h);
  });
  ctx.fillStyle='rgba(39,48,27,.6)';ctx.fillRect(w*.46,0,w*.08,h);
});
dirtTex.anisotropy=8;
const forestRib=makeRibbon(-3.2,3.2,.045,.045,new THREE.MeshLambertMaterial({map:dirtTex,color:0xc5b997,emissive:0x15150c}));
forestRib.route='forest';forestRib.start=FORK_S;
for(const side of [-1,1]){
  const rb=makeRibbon(side*3.2,side*4.2,.04,-.05,new THREE.MeshLambertMaterial({map:groundTex,color:0x485038,side:THREE.DoubleSide}));
  rb.route='forest';rb.start=FORK_S;
}
const storyProps=[];
function addStoryProp(g,s,lat,route='main',yaw=0){
  g.visible=false;scene.add(g);storyProps.push({g,s,lat,route,yaw});return g;
}
function routeSign(title,sub,s,lat,route){
  const g=new THREE.Group();
  cy(g,.055,.07,2.4,artSteel,0,1.2,0,6);
  artSign(g,artSignTex({w:512,h:192,title,sub,size:54,subSize:27,bg:'#16231c',border:'#829779',fg:'#e6dfc7'}),3.4,1.25,0,2.6,0,0);
  return addStoryProp(g,s,lat,route);
}
routeSign('幸福里 →','住宅区',FORK_S-55,6.5,'main');
routeSign('林区便道','夜间无照明',FORK_S+45,-4.9,'forest');
routeSign('住宅区','前方到家',FINISH_S-70,6.4,'main');
routeSign('林场旧址','停止使用',FINISH_S-65,-5.5,'forest');
const forkLight=new THREE.PointLight(0xb7c3a1,1.7,95,1.5);
forkLight.userData.yb=8;scene.add(forkLight);
for(const s of [FORK_S+40,FORK_S+67,FORK_S+97,FORK_S+124]){
  const g=new THREE.Group();cy(g,.045,.06,1.4,artSteel,0,.7,0,5);
  artSign(g,rallyArrowR,1.15,.95,0,1.6,0,0);addStoryProp(g,s,-5.5,'main');
}

const environmentObjects=[];
const environmentBuildings=[[338,-16,15,'main'],[572,17,17,'main'],[1245,-17,15,'main'],[1568,15,16,'main'],[1572,-14,13,'forest']];
const homeLight=new THREE.PointLight(0xffdca0,1.6,38,1.5);
homeLight.userData.yb=5;scene.add(homeLight);
const environmentLoader=new GLTFLoaderNS.GLTFLoader();
const environmentMaterials=new Map();
function prepareEnvironment(root){
  root.traverse(o=>{
    if(!o.isMesh)return;
    const convert=src=>{
      if(environmentMaterials.has(src))return environmentMaterials.get(src);
      const m=new THREE.MeshLambertMaterial({map:src.map,color:0xced3bd,emissive:0x34382b,
        emissiveMap:src.map,side:THREE.DoubleSide,alphaTest:src.transparent?.45:(src.alphaTest||0),transparent:false});
      if(src.map){src.map.magFilter=THREE.NearestFilter;src.map.minFilter=THREE.LinearMipmapLinearFilter;}
      environmentMaterials.set(src,m);return m;
    };
    o.material=Array.isArray(o.material)?o.material.map(convert):convert(o.material);
  });
  const box=new THREE.Box3().setFromObject(root),size=box.getSize(new THREE.Vector3());
  root.position.set(-(box.min.x+box.max.x)/2,-box.min.y,-(box.min.z+box.max.z)/2);
  return {root,height:size.y};
}
function modelInstance(model,s,lat,height,route,yaw){
  const g=new THREE.Group(),copy=model.root.clone(true);g.add(copy);g.scale.setScalar(height/model.height);
  g.visible=false;scene.add(g);environmentObjects.push({g,s,lat,route,yaw});
}
function clearOfRoutes(s,lat,route,clearance){
  if(s>FORK_S-30&&s<SUN_ROAD_S+60&&Math.abs(lat)<17)return false;
  if(environmentBuildings.some(([bs,bl,,br])=>br===route&&Math.abs(s-bs)<25&&lat*bl>0&&Math.abs(lat)<31))return false;
  const p=roadPoint(s,lat,route);
  for(const other of ['main','forest']){
    if(other==='forest'&&s<FORK_S-60)continue;
    const near=projectRoadPoint(p,other,s);
    if(Math.sqrt(near.d)<(other==='main'?5.5:4.2)+clearance)return false;
  }
  return true;
}
/* 树不再用 16 面片的树牌：主脚本里的 window.MFTree 会给出
   "锥形树干 + 分枝 + 叶簇卡"的建模树（同一变体共享几何/贴图）。
   GLB 只留作兜底：万一 MFTree 没加载，仍然能跑。 */
function placeTreeModel(name,model){
  const list=Array.isArray(model)?model:[model];
  const shrub=name==='tree-shrub',variant=name==='tree-large'?1:0;
  for(const route of ['main','forest']){
    const start=route==='main'?150:FORK_S+10,spacing=shrub?13:(route==='forest'?9:14);
    for(let s=start+variant*8;s<FINISH_S+155;s+=spacing){
      for(const side of [-1,1]){
        const seed=Math.abs(Math.sin(s*12.9898+side*78.233+variant*36.7));
        const lat=side*((route==='forest'?5.6:8.0)+seed*(shrub?2.2:11));
        const height=shrub?1.1+seed*1.1:7.0+seed*8;
        if(!clearOfRoutes(s,lat,route,shrub?1:height*.36))continue;
        /* 每个位置在三套色差/树形里轮着取，避免整排一模一样 */
        const one=list[Math.floor(seed*997+s*3.7)%list.length]||list[0];
        modelInstance(one,s,lat,height,route,seed*Math.PI*2);
      }
    }
  }
}
const assetLoads=['tree-pine-large','tree-large','tree-shrub','soviet-house'].map(name=>new Promise(resolve=>{
  if(name!=='soviet-house'&&window.MFTree){
    const kind=name==='tree-pine-large'?'pine':name==='tree-shrub'?'shrub':'broad';
    const base=name==='tree-pine-large'?9091:name==='tree-shrub'?4049:2251;
    const model=[0,1,2].map(v=>window.MFTree.make(kind,base+v));
    driveStory.models[name]=true;driveStory.mftree=true;
    placeTreeModel(name,model);
    resolve();return;
  }
  environmentLoader.load('assets/environment/'+name+'.glb',gltf=>{
    const model=prepareEnvironment(gltf.scene);driveStory.models[name]=true;
    if(name==='soviet-house'){
      environmentBuildings.forEach(([s,lat,h,route])=>modelInstance(model,s,lat,h,route,lat<0?Math.PI/2:-Math.PI/2));
    }else{
      placeTreeModel(name,model);
    }
    resolve();
  },undefined,error=>{driveStory.models[name]=false;console.error('[environment] '+name,error);resolve();});
}));
window.__outdoor.assetsReady=Promise.all(assetLoads);

const SUN_VOICES=['roar','attitude','window','property','again','revive','whatever','sumimasen','notmybiz','eat'];
let sunAudio=null,sunAudioLoading=false,sunBuffers=[],voiceSerial=0;
const spatialVoices=[];
const listenerForward=new THREE.Vector3(),listenerUp=new THREE.Vector3();
function createSunVoice(volume,delay){
  const filter=actx.createBiquadFilter(),gain=actx.createGain(),panner=actx.createPanner();
  filter.type='lowpass';filter.frequency.value=1800;gain.gain.value=0;
  panner.panningModel='HRTF';panner.distanceModel='inverse';panner.refDistance=9;panner.maxDistance=240;panner.rolloffFactor=1.15;
  filter.connect(gain);gain.connect(panner);panner.connect(actx.destination);
  const voice={filter,gain,panner,volume,distance:0,envelope:0,nextAt:actx.currentTime+delay,last:-1,sources:new Set(),index:voiceSerial++};
  spatialVoices.push(voice);return voice;
}
async function ensureSunAudio(){
  if(!actx||sunAudio||sunAudioLoading||S.ended||NOCHASER)return;
  sunAudioLoading=true;
  try{
    sunBuffers=await Promise.all(SUN_VOICES.map(async name=>{
      const response=await fetch('assets/chaser/sunxiaochuan_'+name+'.wav');
      if(!response.ok)throw new Error(name+' '+response.status);
      return actx.decodeAudioData(await response.arrayBuffer());
    }));
    if(S.ended)return;
    sunAudio=createSunVoice(.86,0);
  }catch(error){driveStory.audioError=String(error);console.error('[sun-audio]',error);}
}
function stopSunAudio(){
  for(const voice of spatialVoices){
    for(const source of voice.sources){source.stop();source.disconnect();}
    voice.sources.clear();voice.filter.disconnect();voice.gain.disconnect();voice.panner.disconnect();
  }
  spatialVoices.length=0;sunAudio=null;
}
function updateVoiceListener(){
  if(!actx)return;
  const listener=actx.listener;
  camera.getWorldDirection(listenerForward);listenerUp.set(0,1,0).applyQuaternion(camera.quaternion);
  listener.positionX.value=camera.position.x;listener.positionY.value=camera.position.y;listener.positionZ.value=camera.position.z;
  listener.forwardX.value=listenerForward.x;listener.forwardY.value=listenerForward.y;listener.forwardZ.value=listenerForward.z;
  listener.upX.value=listenerUp.x;listener.upY.value=listenerUp.y;listener.upZ.value=listenerUp.z;
}
function positionSunVoice(voice,p,envelope,height=1.45){
  if(!voice)return;
  const {panner,gain,filter}=voice,t=actx.currentTime;
  panner.positionX.value=p.x;panner.positionY.value=p.y+height;panner.positionZ.value=p.z;
  const distance=Math.hypot(p.x-camera.position.x,p.y+height-camera.position.y,p.z-camera.position.z);
  const audible=S.dozing||S.ended||document.hidden?0:envelope;
  gain.gain.setTargetAtTime(audible*voice.volume,t,.14);
  filter.frequency.setTargetAtTime(Math.max(650,7800/(1+distance*.035))*(p.z>0?.72:1),t,.18);
  voice.distance=distance;voice.envelope=audible;
  if(audible<=.01||t<voice.nextAt||actx.state!=='running'||voice.sources.size)return;
  if(spatialVoices.reduce((n,v)=>n+v.sources.size,0)>=6)return;
  let clip=(voice.last+1+Math.floor(Math.random()*(sunBuffers.length-1)))%sunBuffers.length;
  const source=actx.createBufferSource();source.buffer=sunBuffers[clip];source.playbackRate.value=.94+Math.random()*.12;
  source.connect(filter);voice.sources.add(source);voice.last=clip;
  voice.nextAt=t+source.buffer.duration/source.playbackRate.value+(voice===sunAudio?.28:.5+Math.random()*1.8);
  source.onended=()=>{voice.sources.delete(source);source.disconnect();};source.start();
}
function updateSunAudio(envelope){
  updateVoiceListener();positionSunVoice(sunAudio,chaserRoot.position,envelope);
  if(S.dozing)for(const voice of spatialVoices)voice.gain.gain.setTargetAtTime(0,actx.currentTime,.08);
}
addEventListener('pointerdown',()=>{if(S.started&&!S.ended)initAudio();});
addEventListener('visibilitychange',()=>{
  if(!actx||S.ended)return;
  if(document.hidden)actx.suspend();else if(S.started)actx.resume();
});

/* v4.4 分层音：outdoor 页面没有全局 audio/AudioSys，直接从 manifest 的 wav 路径懒加载，
   按 actx 时钟做冷却，避免每帧播放爆音；结局时统一停掉常驻音源。 */
const storySfx={buf:new Map(),pending:new Map(),cool:Object.create(null),active:new Set()};
const STORY_SFX_SRC={sfx_heartbeat:'player/sfx_heartbeat.wav',sfx_breath:'player/sfx_breath.wav',
  amb_distant_whispers:'ambience/amb_distant_whispers.wav',amb_factory_drone:'ambience/amb_factory_drone.wav'};
function storySfxLoad(id){
  if(storySfx.buf.has(id))return Promise.resolve(storySfx.buf.get(id));
  if(storySfx.pending.has(id))return storySfx.pending.get(id);
  const p=fetch('assets/audio/'+STORY_SFX_SRC[id]).then(r=>r.ok?r.arrayBuffer():Promise.reject(new Error(id)))
    .then(ab=>actx.decodeAudioData(ab)).then(b=>{storySfx.buf.set(id,b);storySfx.pending.delete(id);return b;})
    .catch(()=>{storySfx.pending.delete(id);return null;});
  storySfx.pending.set(id,p);return p;
}
function storySfxPlay(id,vol,rate,cooldown){
  if(!actx||S.ended||document.hidden||actx.state!=='running'||!STORY_SFX_SRC[id])return;
  const now=actx.currentTime;
  if((storySfx.cool[id]||0)>now)return;
  storySfx.cool[id]=now+(cooldown||1);
  const play=b=>{
    if(!b||S.ended)return;
    const src=actx.createBufferSource(),g=actx.createGain();
    src.buffer=b;src.playbackRate.value=rate||1;g.gain.value=vol;
    src.connect(g);g.connect(actx.destination);storySfx.active.add(src);
    src.onended=()=>{storySfx.active.delete(src);src.disconnect();g.disconnect();};
    src.start();
  };
  const b=storySfx.buf.get(id);
  if(b)play(b);else storySfxLoad(id).then(play);
}
function storySfxStopAll(){
  for(const src of storySfx.active){try{src.stop();}catch(e){}src.disconnect();}
  storySfx.active.clear();
}

const horde=[],crowdTextures=[];
let passenger=null,passengerVoice=null;
function initHorde(){
  if(!sunSpriteOK||horde.length)return;
  // 图集变换放在每张纸片的 UV 中，所有追逐者只共享两张 GPU 纹理。
  sunTextures.forEach(texture=>{const t=texture.clone();t.offset.set(0,0);t.repeat.set(1,1);t.needsUpdate=true;crowdTextures.push(t);});
  /* v4.4：每人独立步伐相位；身高按序号单调递减，近大远小多一层层次。 */
  const make=(height,crop,index=0)=>{
    const g=new THREE.Group(),mat=new THREE.MeshBasicMaterial({map:crowdTextures[0],transparent:true,alphaTest:.36,
      side:THREE.DoubleSide,depthWrite:true,color:0xadb4a2});
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(height*SUN_ATLAS.fw/crop,height),mat);
    mesh.position.y=height/2;g.add(mesh);g.visible=false;scene.add(g);
    return {g,mesh,crop,frame:-1,voice:null,start:null,phase:index*2.399963,stride:7.2+(index%4)*.85};
  };
  for(let i=0;i<HORDE_COUNT;i++)horde.push(make(1.94-i*.016,SUN_ATLAS.fh,i));
  passenger=make(.99,320);passenger.mesh.material.fog=false;passenger.mesh.material.color.setHex(0xb6b9a9);
  const fill=new THREE.PointLight(0xc5ba91,.35,3,1.5);fill.position.set(.45,1.55,.15);passenger.g.add(fill);
}
function frameHorde(actor,frame){
  frame=((frame%SUN_ATLAS.count)+SUN_ATLAS.count)%SUN_ATLAS.count;
  if(actor.frame===frame)return;
  const sheet=Math.floor(frame/SUN_ATLAS.perSheet),local=frame%SUN_ATLAS.perSheet,tex=crowdTextures[sheet];
  const x=((local%SUN_ATLAS.cols)*SUN_ATLAS.cellW+SUN_ATLAS.pad)/tex.image.width;
  const y=(Math.floor(local/SUN_ATLAS.cols)*SUN_ATLAS.cellH+SUN_ATLAS.pad)/tex.image.height;
  const w=SUN_ATLAS.fw/tex.image.width,h=actor.crop/tex.image.height,uv=actor.mesh.geometry.attributes.uv;
  uv.setXY(0,x,1-y);uv.setXY(1,x+w,1-y);uv.setXY(2,x,1-y-h);uv.setXY(3,x+w,1-y-h);uv.needsUpdate=true;
  if(actor.mesh.material.map!==tex){actor.mesh.material.map=tex;actor.mesh.material.needsUpdate=true;}
  actor.frame=frame;
}
function faceHorde(actor){actor.g.rotation.y=Math.atan2(camera.position.x-actor.g.position.x,camera.position.z-actor.g.position.z);}
function hordeVoice(actor,index,envelope,height){
  if(!sunAudio)return;
  if(!actor.voice)actor.voice=createSunVoice(.16,index*.19);
  positionSunVoice(actor.voice,actor.g.position,envelope,height);
}
function beginForestCapture(){
  driveStory.capture=true;driveStory.captureSide='forest';driveStory.forestPhase='surround';driveStory.endingTime=0;
  S.camMode='cockpit';S.drowsy=12;S.dozing=false;S.recoilV=0;S.slipV=0;
  for(const key in keys)keys[key]=false;
  look.yaw=look.ty=look.pitch=look.tp=0;look.drag=false;
  horde.forEach(actor=>{actor.start=actor.g.position.clone();});
}
function updateForestHorde(dt,tnow){
  initHorde();
  if(!horde.length||NOCHASER||S.ended||driveStory.route!=='forest')return;
  if(driveStory.forestPhase==='quiet'&&S.dist>=HORDE_START_S){
    driveStory.forestPhase='chase';driveStory.crowdGap=88;driveStory.hordeTime=0;
  }
  if(driveStory.forestPhase!=='chase')return;
  driveStory.hordeTime+=dt;
  driveStory.crowdGap=Math.max(4,driveStory.crowdGap-Math.max(5,33-S.speed+driveStory.hordeTime*.22)*dt);
  for(let i=0;i<horde.length;i++){
    /* v4.4：纵深错落 + 独立步伐相位，头肩起伏与左右摆动各不相同。 */
    const actor=horde[i],gap=driveStory.crowdGap+i*2.8+Math.sin(i*1.7)*1.1;
    const swing=Math.sin(tnow*actor.stride*.5+actor.phase)*.13;
    const bob=Math.abs(Math.sin(tnow*actor.stride+actor.phase))*.085;
    actor.g.visible=true;
    placeRoad(actor.g,S.dist-gap,(i%5-2)*1.08+swing+Math.sin(tnow*1.6+i)*.14,0,'forest');
    actor.g.position.y+=bob;faceHorde(actor);
    /* 近处人声大、远处小；再叠一层随最近人群距离衰减的低频嗡鸣。 */
    const voiceEnv=Math.max(.25,.98-i*.045-Math.max(0,driveStory.crowdGap-20)*.014);
    frameHorde(actor,Math.floor(tnow*(13+i%3)+i*7));hordeVoice(actor,i,voiceEnv);
  }
  storySfxPlay('amb_distant_whispers',.04+.11*Math.max(0,1-(driveStory.crowdGap-4)/46),1,9);
  if(driveStory.crowdGap<=6.5)beginForestCapture();
}
function updateForestEnding(dt){
  if(!driveStory.capture||driveStory.captureSide!=='forest'||S.ended)return;
  const t=driveStory.endingTime+=dt,step=sm01(0,3.4,t);
  S.camMode='cockpit';S.drowsy=12;
  camera.position.set(DRIVER_X,1.26+Math.sin(t*1.9)*.004,.22);
  camera.rotation.order='YXZ';
  camera.rotation.set(.03*sm01(5.8,8.1,t),-.5*Math.PI*sm01(5.8,8.1,t)+.58*sm01(.7,1.4,t)*(1-sm01(2.1,3.2,t)),0);
  camera.fov=59;camera.updateProjectionMatrix();
  updateVoiceListener();
  for(let i=0;i<horde.length;i++){
    const actor=horde[i],side=i%2?1:-1,row=Math.floor(i/2);
    const x=side*(1.47+(row%2)*.23),z=-1.45+row*.78;
    actor.g.position.lerpVectors(actor.start,new THREE.Vector3(x,0,z),step);
    actor.g.visible=!(i===1&&t>3.65);faceHorde(actor);frameHorde(actor,t<3.4?Math.floor(t*14+i*5):40+i%4);
    hordeVoice(actor,i,actor.g.visible?(t<5.8?.85:.20):0);
  }
  if(t>=3.4&&passenger){
    driveStory.forestPhase=t<5.8?'boarding':'look';
    if(!driveStory.doorOpened){driveStory.doorOpened=true;tone(240,.14,'square',.035,100);thud();}
    passenger.g.visible=true;
    const enter=sm01(3.4,5.8,t);
    passenger.g.position.set(1.65-1.19*enter,.63+.16*Math.sin(enter*Math.PI),.26);
    passenger.g.rotation.y=-Math.PI/2;
    frameHorde(passenger,40);
    if(sunAudio&&!passengerVoice)passengerVoice=createSunVoice(.24,0);
    positionSunVoice(passengerVoice,passenger.g.position,t>5.4?1:0,.70);
    if(t>=5.8&&!driveStory.doorClosed){driveStory.doorClosed=true;thud();}
  }
  if(t>=9.8){driveStory.forestPhase='done';finish('同乘');}
}

function storyStage(phase){
  if(driveStory.phase===phase)return;
  driveStory.phase=phase;
  if(phase==='rear'){S.chaserGap=Math.max(9,S.dist-ROADSIDE_S);playChaser('run');}
  if(phase==='ahead'||phase==='roadside')playChaser('idle');
}
function updateDriveStory(dt,tnow){
  if(S.ended)storySfxStopAll();
  ensureSunAudio();
  if(driveStory.capture){updateSunAudio(0);return;}
  driveStory.maxDist=Math.max(driveStory.maxDist,S.dist);
  const progress=driveStory.maxDist;
  let envelope=0;
  if(!NOCHASER&&!S.ended){
    if(progress>ROADSIDE_S+3)driveStory.passedRoadside=true;
    if(!driveStory.hit&&driveStory.phase!=='passed'){
      if(progress>=800)storyStage('ahead');
      else if(progress>=755)storyStage('silence');
      else if(progress>=625)storyStage('fading');
      else if(driveStory.passedRoadside)storyStage('rear');
      else storyStage('roadside');
    }
    if(driveStory.phase==='roadside'){
      placeRoad(chaserRoot,ROADSIDE_S,4.65,0,'main');playChaser('idle');envelope=.75;
    }
    if(driveStory.phase==='rear'||driveStory.phase==='fading'){
      S.chaserOn=true;
      /* 难度：默认 1.1×；从工厂带着 80+ 愤怒出来时 1.8×，追得更凶 */
      const chaseScale=(HANDOFF&&Number(HANDOFF.anger)>=80)?1.8:1.1;
      S.chaserGap=Math.max(0,Math.min(88,S.chaserGap+(S.speed-15)*dt*.36*chaseScale));
      if(driveStory.phase==='fading')S.chaserGap=Math.min(210,S.chaserGap+dt*16);
      if(S.chaserPin)S.chaserGap=13;
      /* 分叉前被追上：他会从右侧上车，坐进副驾驶，游戏结束 */
      if(driveStory.phase==='rear'&&S.chaserGap<=1.7&&S.dist<FORK_S-25&&!S.ended){
        beginRoadsideCapture();return;
      }
      S.chaserStage=S.chaserGap<20?3:2;S.chaserEye=Math.max(0,(38-S.chaserGap)/30);
      const shoulder=4.65+(LANE_LAT+.45-4.65)*sm01(ROADSIDE_S+3,ROADSIDE_S+48,progress);
      placeRoad(chaserRoot,S.dist-S.chaserGap,shoulder+Math.sin(tnow)*.1,0,'main');
      envelope=driveStory.phase==='fading'?1-sm01(625,755,progress):1;
      /* v4.4 追逐三层压迫：远(>8)低频围拢、中(3~8)呼吸低语、近(<3)心跳。
         合成心跳只在 3~18m 兜底，近处改用 sfx_heartbeat，避免两种心跳叠加。 */
      heartbeatTick(dt,driveStory.phase==='rear'&&S.chaserGap>=3&&S.chaserGap<18);
      if(driveStory.phase==='rear'){
        if(S.chaserGap>8)storySfxPlay('amb_factory_drone',.05+.07*Math.max(0,1-(S.chaserGap-8)/40),1,9);
        else if(S.chaserGap>3)storySfxPlay('sfx_breath',.10+.10*(8-Math.max(3,S.chaserGap))/5,1,3.2);
        else{storySfxPlay('sfx_heartbeat',.16+.10*(3-Math.max(0,S.chaserGap))/3,1,1.15);
          S.headShakeT=Math.max(S.headShakeT||0,.06);}  /* v4.4：贴脸时轻微镜头震动 */
      }
    }else{
      S.chaserOn=false;S.chaserEye=0;S.chaserStage=0;heartbeatTick(dt,false);
    }
    if(driveStory.phase==='ahead'){
      placeRoad(chaserRoot,SUN_ROAD_S,LANE_LAT,0,'main');
      envelope=sm01(800,820,progress);
      const previous=driveStory.previousPose||pose,target=roadPoint(SUN_ROAD_S,LANE_LAT,'main');
      const dx=pose.x-previous.x,dz=pose.z-previous.z,den=dx*dx+dz*dz;
      const t=den>0?Math.max(0,Math.min(1,((target.x-previous.x)*dx+(target.z-previous.z)*dz)/den)):0;
      const rx=target.x-(previous.x+t*dx),rz=target.z-(previous.z+t*dz);
      const forward=rx*Math.sin(pose.phi)-rz*Math.cos(pose.phi),side=rx*Math.cos(pose.phi)+rz*Math.sin(pose.phi);
      if(driveStory.route==='home'&&Math.abs(forward)<carHalfL+.3&&Math.abs(side)<carHalfW+.42){
        driveStory.hit=true;driveStory.hitT=.8;driveStory.phase='passed';
        S.headShakeT=.45;S.rollImpact=.03;S.bobV-=.26;thud();playChaser('stumble');
        if(window.carBloodImpact)window.carBloodImpact();
      }else if((driveStory.route==='forest'&&S.dist>FORK_S+115)||(driveStory.route==='home'&&S.dist>SUN_ROAD_S+20)){
        driveStory.phase='passed';
      }
    }
    if(driveStory.hitT>0){
      driveStory.hitT=Math.max(0,driveStory.hitT-dt);
      const t=.8-driveStory.hitT;
      placeRoad(chaserRoot,SUN_ROAD_S+4*t,LANE_LAT+3*t,.8*t,'main');
      chaserRoot.position.y+=Math.sin(t/.8*Math.PI)*1.5;envelope=driveStory.hitT/.8;
    }
  }else {S.chaserOn=false;S.chaserStage=0;S.chaserEye=0;}
  driveStory.previousPose={x:pose.x,z:pose.z};
  chaserRoot.visible=singleSunVisible();
  if(sunBillboard)sunBillboard.material.color.setHex(driveStory.phase==='ahead'||driveStory.phase==='roadside'?0xc4bfa8:0x858e7e);
  chaser.visible=false;chaserRefl.visible=false;updateSunAudio(envelope);
  updateForestHorde(dt,tnow);
}
function singleSunVisible(){
  return !S.ended&&!NOCHASER&&(S.chaserOn||driveStory.phase==='ahead'||driveStory.phase==='roadside'||driveStory.hitT>0);
}
function updateStoryScene(){
  const forest=driveStory.route==='forest';
  placeRoad(forkLight,FORK_S+44,1.8,0,'main');
  forkLight.visible=Math.abs(S.dist-FORK_S)<155;
  placeRoad(homeLight,1568,9,0,'main');homeLight.visible=!forest&&S.dist>1450;
  for(const o of environmentObjects){
    const near=Math.abs(o.s-S.dist)<175;
    o.g.visible=near;
    if(near){placeRoad(o.g,o.s,o.lat,o.yaw,o.route);o.g.visible=Math.abs(o.g.position.x)<180&&o.g.position.z<65;}
  }
  for(const o of storyProps){
    o.g.visible=Math.abs(o.s-S.dist)<170;
    if(o.g.visible)placeRoad(o.g,o.s,o.lat,o.yaw,o.route);
  }
  for(const g of rallyProps){
    const s=S.dist-g.userData.z;
    placeRoad(g,s,0,0,'main');
    g.visible=!forest&&(s<FORK_S-85||s>SUN_ROAD_S+100);
  }
  for(const w of wrecks)if(forest||(w.s>FORK_S-80&&w.s<SUN_ROAD_S+100))w.grp.visible=false;
  for(const L of lamps){
    const s=S.dist-L.z;placeRoad(L.grp,s,L.side*LAMP_LAT,0,'main');
    L.grp.visible=!forest&&(s<FORK_S-35||s>SUN_ROAD_S+70);
  }
  lampLights.forEach((l,i)=>{if(!lampOrder[i]?.grp.visible)l.intensity=0;});
  for(const p of [...gposts,...refls]){
    const s=S.dist-p.userData.z;
    placeRoad(p,s,p.userData.lat,0,'main');
    if(forest||(s>FORK_S-30&&s<SUN_ROAD_S+80))p.visible=false;
  }
  finishGate.visible=false;checkpointSign.visible=false;finish100Sign.visible=false;finish60Sign.visible=false;park.visible=false;
  /* v4.4：rWarn / rDanger / finishGuide 的显示交给 outdoor.html 的 updateRallyHud 全权控制。
     这里原先把刚刚在 update 阶段点亮的 class 又每帧清掉，导致“不要停”和终点引导看不到。 */
  if(S.ended)rDangerEl.classList.remove('on');
  scene.fog.density=forest?.016:.0115;
}

/* 分叉前的普通公路：被追上 → 右侧拍门 → 上副驾 → 结束 */
function beginRoadsideCapture(){
  if(driveStory.capture)return;
  driveStory.capture=true;driveStory.captureSide='road';driveStory.endingTime=0;
  driveStory.knock1=driveStory.knock2=driveStory.doorOpened=driveStory.doorClosed=false;
  S.camMode='cockpit';S.dozing=false;S.drowsy=12;S.recoilV=0;S.slipV=0;
  for(const key in keys)keys[key]=false;
  look.yaw=look.ty=look.pitch=look.tp=0;look.drag=false;
  initHorde();
  if(passenger)passenger.g.visible=false;
  chaserRoot.visible=true;
}
function updateRoadsideCapture(dt){
  if(!driveStory.capture||driveStory.captureSide!=='road'||S.ended)return;
  const t=driveStory.endingTime+=dt;
  S.camMode='cockpit';S.drowsy=12;S.dozing=false;
  S.speed=Math.max(0,S.speed-dt*5.5);
  camera.position.set(DRIVER_X,1.26+Math.sin(t*1.7)*.006,.22);
  camera.rotation.order='YXZ';
  const lookRight=-0.62*Math.PI*sm01(0.1,0.9,t)*(1-0.18*sm01(3.0,4.0,t));
  camera.rotation.set(.015,lookRight,Math.sin(t*11)*.006*(t<.9?1:0));
  camera.fov=59;camera.updateProjectionMatrix();
  updateVoiceListener();
  /* v4.4：拍门前后心跳逐步加重，强化“它就在车窗外”的压迫（带冷却）。 */
  if(t<1.3)storySfxPlay('sfx_heartbeat',.16+.06*sm01(0,1.3,t),1,1);
  const approach=sm01(0,1.05,t);
  chaserRoot.visible=t<2.2;
  if(chaserRoot.visible){
    chaserRoot.position.set(2.9-1.25*approach,0,.62-.42*approach);
    chaserRoot.rotation.y=-Math.PI/2+.18;
    sunChaser.rotation.y=0;
    setSunFrame(Math.floor(t*14)%SUN_ATLAS.count);
  }
  if(!driveStory.knock1&&t>=.5){driveStory.knock1=true;metalKnock(.95);S.headShakeT=.12;}
  if(!driveStory.knock2&&t>=.78){driveStory.knock2=true;metalKnock(.85);S.headShakeT=.14;}
  if(t>=1.15&&passenger){
    passenger.g.visible=true;
    const enter=sm01(1.15,2.45,t);
    passenger.g.position.set(1.58-1.12*enter,.60+.10*Math.sin(enter*Math.PI),.26);
    passenger.g.rotation.y=-Math.PI/2;
    frameHorde(passenger,40);
    if(sunAudio&&!passengerVoice)passengerVoice=createSunVoice(.24,0);
    positionSunVoice(passengerVoice,passenger.g.position,t>2.3?1:0,.70);
  }
  if(t>=2.55&&!driveStory.doorClosed){driveStory.doorClosed=true;thud();metalKnock(.55);}
  if(t>=3.8){driveStory.forestPhase='done';finish('同乘');}
}
window.__outdoor.story=()=>({phase:driveStory.phase,route:driveStory.route,reference:driveRoute,hit:driveStory.hit,
  fork:FORK_S,sun:SUN_ROAD_S,roadside:ROADSIDE_S,passedRoadside:driveStory.passedRoadside,
  forestPhase:driveStory.forestPhase,gap:driveStory.crowdGap,capture:driveStory.capture,side:driveStory.captureSide,endingTime:driveStory.endingTime,
  crowd:horde.map(a=>({visible:a.g.visible,position:a.g.position.toArray(),voice:a.voice?{distance:a.voice.distance,clip:SUN_VOICES[a.voice.last],gain:a.voice.gain.gain.value}:null})),
  passenger:passenger?{visible:passenger.g.visible,position:passenger.g.position.toArray()}:null,
  models:{...driveStory.models},instances:environmentObjects.length,
  audio:sunAudio?{state:actx.state,distance:sunAudio.distance,envelope:sunAudio.envelope,gain:sunAudio.gain.gain.value,
    position:{x:sunAudio.panner.positionX.value,z:sunAudio.panner.positionZ.value},spatial:sunAudio.panner.panningModel,
    variants:sunBuffers.length,voices:spatialVoices.length,playing:spatialVoices.reduce((n,v)=>n+v.sources.size,0)}:null,error:driveStory.audioError});
