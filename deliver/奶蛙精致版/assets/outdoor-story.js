'use strict';

const ROADSIDE_S=286, HORDE_START_S=1070, HORDE_COUNT=14;
const driveStory={phase:'roadside',route:'undecided',hit:false,hitT:0,maxDist:0,previousPose:null,models:{},audioError:null,
  passedRoadside:false,forestPhase:'quiet',hordeTime:0,crowdGap:88,capture:false,endingTime:0,doorOpened:false,doorClosed:false};
if(FROM_FACTORY||q.has('shot')||q.has('direct'))document.body.classList.add('immersive-drive');

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
const assetLoads=['tree-pine-large','tree-large','tree-shrub','soviet-house'].map(name=>new Promise(resolve=>{
  environmentLoader.load('assets/environment/'+name+'.glb',gltf=>{
    const model=prepareEnvironment(gltf.scene);driveStory.models[name]=true;
    if(name==='soviet-house'){
      environmentBuildings.forEach(([s,lat,h,route])=>modelInstance(model,s,lat,h,route,lat<0?Math.PI/2:-Math.PI/2));
    }else{
      const shrub=name==='tree-shrub',variant=name==='tree-large'?1:0;
      for(const route of ['main','forest']){
        const start=route==='main'?160:FORK_S+14,spacing=shrub?19:(route==='forest'?12:19);
        for(let s=start+variant*8;s<FINISH_S+155;s+=spacing){
          for(const side of [-1,1]){
            const seed=Math.abs(Math.sin(s*12.9898+side*78.233+variant*36.7));
            const lat=side*((route==='forest'?5.8:8.5)+seed*(shrub?2.5:10));
            const height=shrub?1.1+seed:6.5+seed*6;
            if(!clearOfRoutes(s,lat,route,shrub?1:height*.38))continue;
            modelInstance(model,s,lat,height,route,seed*Math.PI*2);
          }
        }
      }
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

const horde=[],crowdTextures=[];
let passenger=null,passengerVoice=null;
function initHorde(){
  if(!sunSpriteOK||horde.length)return;
  // 图集变换放在每张纸片的 UV 中，所有追逐者只共享两张 GPU 纹理。
  sunTextures.forEach(texture=>{const t=texture.clone();t.offset.set(0,0);t.repeat.set(1,1);t.needsUpdate=true;crowdTextures.push(t);});
  const make=(height,crop)=>{
    const g=new THREE.Group(),mat=new THREE.MeshBasicMaterial({map:crowdTextures[0],transparent:true,alphaTest:.36,
      side:THREE.DoubleSide,depthWrite:true,color:0xadb4a2});
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(height*SUN_ATLAS.fw/crop,height),mat);
    mesh.position.y=height/2;g.add(mesh);g.visible=false;scene.add(g);
    return {g,mesh,crop,frame:-1,voice:null,start:null};
  };
  for(let i=0;i<HORDE_COUNT;i++)horde.push(make(1.82+(i%3)*.06,SUN_ATLAS.fh));
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
  driveStory.capture=true;driveStory.forestPhase='surround';driveStory.endingTime=0;
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
    const actor=horde[i],gap=driveStory.crowdGap+i*2.8;
    actor.g.visible=true;
    placeRoad(actor.g,S.dist-gap,(i%5-2)*1.08+Math.sin(tnow*1.6+i)*.14,0,'forest');
    actor.g.position.y+=Math.abs(Math.sin(tnow*8.4+i))*.06;faceHorde(actor);
    frameHorde(actor,Math.floor(tnow*(13+i%3)+i*7));hordeVoice(actor,i,.9);
  }
  if(driveStory.crowdGap<=6.5)beginForestCapture();
}
function updateForestEnding(dt){
  if(!driveStory.capture||S.ended)return;
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
  if(phase==='rear'){
    S.chaserGap=Math.max(36,Math.min(78,S.dist-ROADSIDE_S+24));
    S.chaserSpeed=DIFF==='easy'?18.5:21.5;
    playChaser('run');
  }
  if(phase==='ahead'||phase==='roadside')playChaser('idle');
}
function updateDriveStory(dt,tnow){
  ensureSunAudio();
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
      if(S.chaserHitT>0)S.chaserHitT=Math.max(0,S.chaserHitT-dt);
      const chaseT=Math.max(0,Math.min(1,(progress-ROADSIDE_S)/800));
      const chaseTarget=DIFF==='easy'
        ?20.6+2.0*chaseT
        :23.6+2.6*chaseT;
      S.chaserSpeed+=(chaseTarget-S.chaserSpeed)*Math.min(1,dt*(DIFF==='easy'?.55:.82));
      if(driveStory.phase==='fading'){
        S.chaserGap=Math.min(210,S.chaserGap+dt*16);
      }else{
        S.chaserGap=Math.max(6,Math.min(88,S.chaserGap+(S.speed-S.chaserSpeed)*dt*(DIFF==='easy'?.58:.84)));
      }
      if(S.chaserPin)S.chaserGap=13;
      if(S.chaserGap<=6.45&&S.chaserHitT<=0&&driveStory.phase!=='fading'){
        /* 这不是装饰性追逐：掉速到被追上时会真的挨一下，随后获得一次甩脱窗口。 */
        S.chaserHitT=1.15;S.chaserGap=18;S.chaserSpeed=Math.max(9,S.speed-0.4);
        S.speed=Math.max(0,S.speed-2.8);S.headShakeT=.38;S.rollImpact=.028;S.hudJitterT=.42;S.glitchT=.12;
        flash(.16,true);thud();playChaser('catch');
        radioSay('它撞上来了——油门别松！');
      }
      S.chaserStage=S.chaserGap<20?3:S.chaserGap<34?2:1;
      S.chaserEye=Math.max(0,Math.min(1,(45-S.chaserGap)/34));
      const shoulder=4.65+(LANE_LAT+.45-4.65)*sm01(ROADSIDE_S+3,ROADSIDE_S+48,progress);
      placeRoad(chaserRoot,S.dist-S.chaserGap,shoulder+Math.sin(tnow)*.1,0,'main');
      envelope=driveStory.phase==='fading'?1-sm01(625,755,progress):1;
      heartbeatTick(dt,S.chaserGap<32,S.chaserGap<16?.56:.82);
      if(S.chaserHitT<=0&&chaserState==='catch')playChaser('run');
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
        S.headShakeT=.3;S.rollImpact=.025;S.bobV-=.22;thud();playChaser('stumble');
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
  rWarnEl.classList.remove('on');
  if(!S.chaserOn)rDangerEl.classList.remove('on');
  elFinishGuide.classList.remove('on');
  if(S.ended)rDangerEl.classList.remove('on');
  scene.fog.density=forest?.016:.0115;
}
window.__outdoor.story=()=>({phase:driveStory.phase,route:driveStory.route,reference:driveRoute,hit:driveStory.hit,
  fork:FORK_S,sun:SUN_ROAD_S,roadside:ROADSIDE_S,passedRoadside:driveStory.passedRoadside,
  forestPhase:driveStory.forestPhase,gap:driveStory.crowdGap,chaserGap:S.chaserGap,chaserSpeed:S.chaserSpeed,capture:driveStory.capture,endingTime:driveStory.endingTime,
  crowd:horde.map(a=>({visible:a.g.visible,position:a.g.position.toArray(),voice:a.voice?{distance:a.voice.distance,clip:SUN_VOICES[a.voice.last],gain:a.voice.gain.gain.value}:null})),
  passenger:passenger?{visible:passenger.g.visible,position:passenger.g.position.toArray()}:null,
  models:{...driveStory.models},instances:environmentObjects.length,
  audio:sunAudio?{state:actx.state,distance:sunAudio.distance,envelope:sunAudio.envelope,gain:sunAudio.gain.gain.value,
    position:{x:sunAudio.panner.positionX.value,z:sunAudio.panner.positionZ.value},spatial:sunAudio.panner.panningModel,
    variants:sunBuffers.length,voices:spatialVoices.length,playing:spatialVoices.reduce((n,v)=>n+v.sources.size,0)}:null,error:driveStory.audioError});
