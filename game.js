import * as THREE from 'three';
import { loadIbojitchPlayer } from './playerModel.js';
import { WaveTrail } from './waveTrail.js';
import { loadModel, fitModel } from './modelLoader.js';
import { UNPO_CONFIG } from './unpoConfig.js?v=20261007-deathcry';
import { Sound } from './sound.js?v=20261007-charge-growl';
import { MobileDisplay } from './mobileDisplay.js?v=20261007-landscape';

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const overlap = (a, b) => (a.x-b.x)**2 + (a.y-b.y)**2 < (a.radius+b.radius)**2;
const WORLD = { width: 32, height: 18 };
const POWER_UPS = ['energy','wide','missile','quick','pod'];
const POWER_NAMES = {energy:'エネルギーカプセル',wide:'ワイドショット',missile:'ミサイル',quick:'クイックチャージ',pod:'ウィングポッド'};
const POWER_COLORS = {energy:0xff6d93,wide:0x72d9ff,missile:0xffb957,quick:0x7dff8c,pod:0xcb9fff};
const PLAYER_MAX_HP=5;
const MISSILE_INTERVAL=2;
function chargeDamage(ms) {
  if (ms < 200) return 1;
  return ms >= 1500 ? 16 : 2 + Math.floor((ms - 200) / 100);
}
function splitVelocity(vx, vy, side) {
  const angle = side * Math.PI / 6;
  return { vx: vx * Math.cos(angle) - vy * Math.sin(angle), vy: vx * Math.sin(angle) + vy * Math.cos(angle) };
}
// Swept circle check prevents fast wave shots passing through targets between frames.
function bulletHits(bullet, target) {
  const x = bullet.previousX ?? bullet.x, y = bullet.previousY ?? bullet.y;
  const dx = bullet.x - x, dy = bullet.y - y;
  const length = dx * dx + dy * dy;
  const t = length ? clamp(((target.x-x)*dx+(target.y-y)*dy)/length, 0, 1) : 0;
  return overlap({x:x+dx*t,y:y+dy*t,radius:bullet.radius}, target);
}
function hitTime(bullet,target){
  const x=bullet.previousX??bullet.x,y=bullet.previousY??bullet.y;
  const dx=bullet.x-x,dy=bullet.y-y,ox=x-target.x,oy=y-target.y;
  const radius=bullet.radius+target.radius,c=ox*ox+oy*oy-radius*radius;
  if(c<=0)return 0;
  const a=dx*dx+dy*dy,b=2*(ox*dx+oy*dy),disc=b*b-4*a*c;
  if(!a||disc<0)return Infinity;
  const t=(-b-Math.sqrt(disc))/(2*a);
  return t>=0&&t<=1?t:Infinity;
}
// Shared geometry/materials: pooled bullets and enemies never allocate GPU assets per frame.
const geometry = {
  cone: new THREE.ConeGeometry(.55, 1.6, 4),
  box: new THREE.BoxGeometry(1, 1, 1),
  orb: new THREE.IcosahedronGeometry(.6, 0),
  bullet: new THREE.SphereGeometry(.14, 6, 4),
};
const material = {
  hull: new THREE.MeshStandardMaterial({color:0xc9e8ee, metalness:.55, roughness:.35}),
  wing: new THREE.MeshStandardMaterial({color:0x278fa9, metalness:.6, roughness:.4}),
  glow: new THREE.MeshBasicMaterial({color:0x6affec}),
  enemy: [0xff7866,0xc18aff,0xffc05b].map(color=>new THREE.MeshStandardMaterial({color,metalness:.35,roughness:.5,flatShading:true})),
  enemyBullet: new THREE.MeshBasicMaterial({color:0xff576c}),
  structure: new THREE.MeshStandardMaterial({color:0x17334e,roughness:.85,flatShading:true}),
  rock: new THREE.MeshStandardMaterial({color:0x9c8b78,roughness:1,flatShading:true}),
  wave: new THREE.MeshBasicMaterial({color:0x8effff,transparent:true,opacity:.65}),
  quick: new THREE.MeshBasicMaterial({color:0x83ff97}),
  quickAura: new THREE.MeshBasicMaterial({color:0x41ef6a,transparent:true,opacity:.65}),
};
function part(group, geo, mat, x=0,y=0,z=0,sx=1,sy=1,sz=1) {
  const mesh=new THREE.Mesh(geo,mat); mesh.position.set(x,y,z); mesh.scale.set(sx,sy,sz); group.add(mesh); return mesh;
}

class Input {
  constructor() {
    this.keys=new Set(); this.stick={x:0,y:0}; this.firePointers=new Set(); this.stickPointer=null;
    this.shotRequests=[];this.shotStartedAt=null;
    this.chargeMultiplier=1;
    this.pad=document.querySelector('#stick'); this.knob=document.querySelector('#knob'); this.fireButton=document.querySelector('#fire');
    addEventListener('keydown',e=>this.keyDown(e));
    addEventListener('keyup',e=>this.keyUp(e));
    addEventListener('blur',()=>this.clear());
    this.pad.addEventListener('pointerdown',e=>{if(this.stickPointer!==null)return;this.stickPointer=e.pointerId;this.pad.setPointerCapture(e.pointerId);this.moveStick(e);});
    this.pad.addEventListener('pointermove',e=>{if(e.pointerId===this.stickPointer)this.moveStick(e);});
    for(const event of ['pointerup','pointercancel','lostpointercapture'])this.pad.addEventListener(event,e=>{if(e.pointerId===this.stickPointer){this.stickPointer=null;this.stick.x=this.stick.y=0;this.knob.style.transform='';}});
    this.fireButton.addEventListener('pointerdown',e=>{const before=this.firing;this.fireButton.setPointerCapture(e.pointerId);this.firePointers.add(e.pointerId);this.shotChanged(before);this.fireButton.classList.add('active');});
    for(const event of ['pointerup','pointercancel','lostpointercapture'])this.fireButton.addEventListener(event,e=>{const before=this.firing;this.firePointers.delete(e.pointerId);this.shotChanged(before,event!=='pointerup');this.fireButton.classList.toggle('active',this.firePointers.size>0);});
  }
  keyDown(e){
    if(e.target?.closest?.('.sound-controls, #fullscreen, #rotate-guide'))return;
    if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
    // Movement uses held state; OS repeat must never create another press after clear().
    if(e.repeat||this.keys.has(e.code))return;
    const before=this.firing;this.keys.add(e.code);this.shotChanged(before);
  }
  keyUp(e){const before=this.firing;this.keys.delete(e.code);this.shotChanged(before);}
  moveStick(e){const rect=this.pad.getBoundingClientRect();let x=e.clientX-rect.left-rect.width/2,y=e.clientY-rect.top-rect.height/2;const limit=rect.width*.32,length=Math.hypot(x,y);if(length>limit){x*=limit/length;y*=limit/length;}this.stick.x=x/limit;this.stick.y=-y/limit;this.knob.style.transform=`translate(${x}px,${y}px)`;}
  shotChanged(before,cancel=false){if(!before&&this.firing){this.shotStartedAt=performance.now();this.shotRequests.push(1);}else if(before&&!this.firing){const ms=this.chargeMs;if(!cancel&&ms>=200)this.shotRequests.push(chargeDamage(ms));this.shotStartedAt=null;}}
  get chargeMs(){return this.shotStartedAt===null?0:clamp((performance.now()-this.shotStartedAt)*(this.chargeMultiplier??1),0,1500);}
  clear(){this.keys.clear();this.stick.x=this.stick.y=0;this.stickPointer=null;this.firePointers.clear();this.shotStartedAt=null;this.shotRequests.length=0;this.knob.style.transform='';this.fireButton.classList.remove('active');}
  get movement(){let x=Number(this.keys.has('KeyD')||this.keys.has('ArrowRight'))-Number(this.keys.has('KeyA')||this.keys.has('ArrowLeft'))+this.stick.x;let y=Number(this.keys.has('KeyW')||this.keys.has('ArrowUp'))-Number(this.keys.has('KeyS')||this.keys.has('ArrowDown'))+this.stick.y;const length=Math.max(1,Math.hypot(x,y));return {x:x/length,y:y/length};}
  get firing(){return this.keys.has('Space')||this.firePointers.size>0;}
}

class UI {
  constructor(){this.hp=document.querySelector('#hp');this.score=document.querySelector('#score');this.overlay=document.querySelector('#overlay');this.title=document.querySelector('#title');this.message=document.querySelector('#message');this.start=document.querySelector('#start');this.pause=document.querySelector('#pause');}
  update(hp,score){this.hp.textContent='● '.repeat(hp)+'○ '.repeat(5-hp);this.score.textContent=String(score).padStart(6,'0');}
  show(title,message,button){this.title.textContent=title;this.message.textContent=message;this.start.textContent=button;this.overlay.hidden=false;}
  hide(){this.overlay.hidden=true;}
  charge(ms,quick=false){const gauge=document.querySelector('#charge');gauge.value=ms;const power=chargeDamage(ms)+(quick?1:0);document.querySelector('#charge-power').textContent=ms>=1500?`MAX ×${power}`:ms>=200?`×${power}`:'CHARGE';}
  equipment(player){document.querySelector('#equipment').textContent=`W ×${player.wide}  ${player.hasMissile?'M ✓  ':''}${player.quick?'Q ✓  ':''}${player.podCount?`P ×${player.podCount}`:''}`;}
  say(text,duration=2){document.querySelector('#dialogue').textContent=text;this.dialogueTime=duration;}
  tick(dt){this.dialogueTime=Math.max(0,(this.dialogueTime||0)-dt);if(!this.dialogueTime)document.querySelector('#dialogue').textContent='';}
  enemyHealth(enemies,camera){const panel=document.querySelector('#enemy-hp');const enemy=enemies.find(e=>e.isUnpo&&e.active);panel.hidden=!enemy;if(!enemy)return;
    const x=(enemy.x-camera.left)/(camera.right-camera.left)*innerWidth;
    const y=(camera.top-enemy.y-UNPO_CONFIG.socketY-1)/(camera.top-camera.bottom)*innerHeight;
    panel.style.left=`${clamp(x,95,innerWidth-95)}px`;panel.style.top=`${Math.max(12,y)}px`;
    document.querySelector('#enemy-hp-value').textContent=`${enemy.hp} / ${UNPO_CONFIG.maxHp}`;
    document.querySelector('#enemy-hp-fill').style.width=`${clamp(enemy.hp/UNPO_CONFIG.maxHp,0,1)*100}%`;
  }
}

class Player {
  constructor(scene,model){this.mesh=new THREE.Group();this.mesh.add(model);scene.add(this.mesh);this.radius=.48;this.reset();}
  reset(){this.x=-10;this.y=0;this.hp=PLAYER_MAX_HP;this.wide=1;this.hasMissile=false;this.quick=false;this.podCount=0;this.missileCooldown=0;this.history=new FlightHistory(this.x,this.y);this.invulnerable=0;this.cooldown=0;this.mesh.visible=true;this.mesh.position.set(this.x,this.y,0);}
  pickup(type,game){if(type==='energy')this.hp=Math.min(PLAYER_MAX_HP,this.hp+1);if(type==='wide')this.wide=Math.min(3,this.wide+1);if(type==='missile')this.hasMissile=true;if(type==='quick'){this.quick=true;game.input.chargeMultiplier=1.5;}if(type==='pod')this.podCount=Math.min(2,this.podCount+1);game.ui.update(this.hp,game.score);game.ui.say(`${POWER_NAMES[type]} GET!`);game.audio?.effect('pickup',1,this.x);}
  update(dt,input,game){const movement=input.movement;this.x=clamp(this.x+movement.x*10*dt,-15,14.5);this.y=clamp(this.y+movement.y*10*dt,-7.5,7.5);this.invulnerable=Math.max(0,this.invulnerable-dt);this.history.record(this.x,this.y);game.updatePods?.();this.missileCooldown=Math.max(0,this.missileCooldown-dt);
    const shotPressed=input.shotRequests.includes(1);while(input.shotRequests.length){const power=input.shotRequests.shift();const charged=power>1;game.shoot(this.x+1,this.y,charged?30:24,0,false,power+(charged&&this.quick?1:0),{wide:charged?1:this.wide,green:charged&&this.quick});if(!charged)for(const pod of game.pods??[])if(pod.active)game.shoot(pod.x+.5,pod.y,24,0,false,1);if(charged)game.burst(this.x+1,this.y,this.quick?0x7dff8c:0x8effff);}
    if(this.hasMissile&&(input.firing||shotPressed)&&this.missileCooldown<=0){game.shootMissile(this.x+1,this.y);this.missileCooldown=MISSILE_INTERVAL;}
    game.ui.charge(input.chargeMs,this.quick);game.audio?.setCharge(input.chargeMs/1500);this.mesh.position.set(this.x,this.y,0);this.mesh.rotation.x=THREE.MathUtils.lerp(this.mesh.rotation.x,movement.y*.4,dt*10);this.mesh.visible=this.invulnerable<=0||Math.floor(this.invulnerable*16)%2===0;}
  damage(game){if(this.invulnerable>0)return;this.hp--;this.invulnerable=1.4;game.audio?.effect('damage',1,this.x);game.ui.update(this.hp,game.score);game.burst(this.x,this.y,0x65eee1);if(this.hp<=0)game.end();}
}

class Bullet {
  constructor(scene,hostile){this.hostile=hostile;this.mesh=new THREE.Group();this.core=new THREE.Mesh(geometry.bullet,hostile?material.enemyBullet:material.glow);this.mesh.add(this.core);this.lanes=[new THREE.Mesh(geometry.bullet,material.glow),new THREE.Mesh(geometry.bullet,material.glow)];this.lanes.forEach(lane=>{this.mesh.add(lane);lane.visible=false;});this.aura=new THREE.Mesh(geometry.bullet,material.wave);this.mesh.add(this.aura);scene.add(this.mesh);
    this.deactivate();}
  activate(x,y,vx,vy,damage=1,options={}){Object.assign(this,{x,y,previousX:x,previousY:y,vx,vy,damage,energy:damage,isWave:!this.hostile&&damage>1,age:0,active:true,wide:options.wide??1,green:!!options.green});this.updateAppearance();this.mesh.visible=true;this.mesh.position.set(x,y,0);}
  updateAppearance(){const power=this.energy,wave=this.isWave;this.radius=this.hostile?.22:wave?.25+power*.045:.16+.22*((this.wide??1)-1);this.mesh.scale.set(wave?4+power*.35:this.hostile?1.7:2.3,wave?this.radius/.14:this.hostile?1.7:.8,wave?2:1);this.aura.visible=wave;const auraSize=1.15+power*.035;this.aura.scale.set(auraSize,auraSize,auraSize);
    if(this.core){this.core.visible=wave||this.hostile||this.wide!==2;this.core.material=this.green?material.quick:this.hostile?material.enemyBullet:material.glow;this.aura.material=this.green?material.quickAura:material.wave;this.lanes.forEach((lane,i)=>{lane.visible=!wave&&!this.hostile&&this.wide>1;lane.position.y=(i?1:-1)*.275/.8;});}}
  deactivate(){this.active=false;this.mesh.visible=false;}
  update(dt){this.previousX=this.x;this.previousY=this.y;this.x+=this.vx*dt;this.y+=this.vy*dt;this.age+=dt;this.mesh.position.set(this.x,this.y,0);if(Math.abs(this.x)>19||Math.abs(this.y)>11)this.deactivate();}
}

class FlightHistory {
  constructor(x,y){this.xs=new Float32Array(512);this.ys=new Float32Array(512);this.head=0;this.count=0;this.record(x-4,y);this.record(x,y);}
  record(x,y){const previous=(this.head+511)%512;if(this.count&&Math.hypot(x-this.xs[previous],y-this.ys[previous])<.03)return;this.xs[this.head]=x;this.ys[this.head]=y;this.head=(this.head+1)%512;this.count=Math.min(512,this.count+1);}
  behind(distance){let current=(this.head+511)%512;let x=this.xs[current],y=this.ys[current];for(let i=1;i<this.count;i++){const previous=(current+511)%512;const dx=this.xs[previous]-x,dy=this.ys[previous]-y,length=Math.hypot(dx,dy);if(length>=distance)return {x:x+dx*distance/length,y:y+dy*distance/length};distance-=length;current=previous;x=this.xs[current];y=this.ys[current];}return {x,y};}
}

class Missile extends Bullet {
  activate(x,y,target,turnRadius){super.activate(x,y,12,0);this.target=target;this.targetGeneration=target?.generation;this.heading=0;this.turnRadius=turnRadius;this.radius=.22;if(this.core)this.core.material=material.enemyBullet;}
  update(dt){if(this.target?.active&&this.target.generation===this.targetGeneration){const angle=Math.atan2(this.target.y-this.y,this.target.x-this.x);const delta=Math.atan2(Math.sin(angle-this.heading),Math.cos(angle-this.heading));const turn=12/this.turnRadius*dt;this.heading+=clamp(delta,-turn,turn);}this.vx=Math.cos(this.heading)*12;this.vy=Math.sin(this.heading)*12;super.update(dt);this.mesh.rotation.z=this.heading;}
}

class PowerItem {
  constructor(scene){this.mesh=new THREE.Group();this.icon=null;part(this.mesh,geometry.orb,material.glow,0,0,0,.65,.65,.65);scene.add(this.mesh);this.radius=.65;this.deactivate();}
  activate(x,y,type){this.x=x;this.y=y;this.type=type;this.active=true;this.mesh.visible=true;this.mesh.position.set(x,y,0);
    PowerItem.icons??={};if(!PowerItem.icons[type]){const canvas=document.createElement('canvas');canvas.width=canvas.height=64;const ctx=canvas.getContext('2d');ctx.fillStyle='#'+POWER_COLORS[type].toString(16).padStart(6,'0');ctx.beginPath();ctx.roundRect(2,2,60,60,14);ctx.fill();ctx.fillStyle='#101d32';ctx.font='bold 40px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText({energy:'＋',wide:'W',missile:'M',quick:'Q',pod:'P'}[type],32,34);PowerItem.icons[type]=new THREE.SpriteMaterial({map:new THREE.CanvasTexture(canvas),depthTest:false});}
    if(!this.icon){this.icon=new THREE.Sprite();this.icon.scale.set(1,1,1);this.mesh.add(this.icon);}this.icon.material=PowerItem.icons[type];}
  deactivate(){this.active=false;this.mesh.visible=false;}
  update(dt){this.x-=2.5*dt;this.mesh.position.set(this.x,this.y,0);if(this.x<-18)this.deactivate();}
}

class Rock {
  constructor(scene){this.mesh=new THREE.Mesh(geometry.orb,material.rock);scene.add(this.mesh);this.deactivate();}
  activate(x,y,size='large',vx=-2.5,vy=0){this.generation=(this.generation??0)+1;Object.assign(this,{x,y,size,vx,vy,active:true,hp:size==='large'?16:8,radius:size==='large'?1.5:.85});this.mesh.scale.set(this.radius/.6,this.radius/.6,this.radius/.6);this.mesh.rotation.set(Math.random(),Math.random(),Math.random());this.mesh.position.set(x,y,0);this.mesh.visible=true;}
  deactivate(){this.active=false;this.mesh.visible=false;}
  update(dt){this.x+=this.vx*dt;this.y+=this.vy*dt;this.mesh.position.set(this.x,this.y,0);this.mesh.rotation.x+=dt*.3;this.mesh.rotation.y+=dt*.2;if(this.x<-19||Math.abs(this.y)>12)this.deactivate();}
}

class Enemy {
  constructor(scene,type){this.type=type;this.mesh=new THREE.Group();part(this.mesh,geometry.orb,material.enemy[type],0,0,0,1.3,1,1);part(this.mesh,geometry.box,material.enemy[type],.1,0,0,.5,1.8,.3);part(this.mesh,geometry.orb,material.glow,-.45,0,.4,.3,.3,.3);scene.add(this.mesh);this.radius=.65;this.deactivate();}
  activate(y,time,difficulty){this.generation=(this.generation??0)+1;this.active=true;this.x=18;this.y=y;this.baseY=y;this.age=0;this.phase=time;this.hp=this.type===2?3:2;this.speed=4+this.type*.5+difficulty;this.cooldown=1.1+Math.random()*.7;this.mesh.visible=true;this.mesh.position.set(this.x,this.y,-3);}
  deactivate(){this.active=false;this.mesh.visible=false;}
  update(dt,game){this.age+=dt;this.x-=this.speed*dt;if(this.type===1)this.y=clamp(this.baseY+Math.sin(this.age*3+this.phase)*1.7,-7,7);if(this.type===2)this.y+=clamp(game.player.y-this.y,-1,1)*dt*1.8;this.mesh.position.set(this.x,this.y,-3*Math.max(0,1-this.age/.7));this.mesh.rotation.x+=dt*.8;this.mesh.rotation.y=Math.sin(this.age*2)*.35;this.cooldown-=dt;if(this.type===2&&this.cooldown<=0&&this.x<15){let dx=game.player.x-this.x,dy=game.player.y-this.y;const length=Math.max(.01,Math.hypot(dx,dy));game.shoot(this.x-.5,this.y,dx/length*8,dy/length*8,true);this.cooldown=1.8;}if(this.x<-18)this.deactivate();}
}

class UnpoCrystal extends Bullet {
  constructor(scene,model,owner){
    super(scene,true);scene.remove(this.mesh);
    this.mesh=new THREE.Group();this.mesh.add(model);scene.add(this.mesh);
    this.scene=scene;this.owner=owner;this.isCrystal=true;
    this.materials=[];
    model.traverse(obj=>{if(obj.isMesh){const source=Array.isArray(obj.material)?obj.material:[obj.material];const copies=source.map(mat=>{const copy=mat.clone();copy.transparent=true;copy.userData={...copy.userData,crystalOpacity:mat.opacity};this.materials.push(copy);return copy;});obj.material=Array.isArray(obj.material)?copies:copies[0];}});
    // Sample actual model vertices once; sparkles follow the surface as it rotates.
    this.surfacePoints=[];this.sparkPosition=new THREE.Vector3();this.surfaceSparkTimer=0;
    this.mesh.updateWorldMatrix(true,true);
    model.traverse(obj=>{if(!obj.isMesh)return;const positions=obj.geometry.getAttribute('position');const stride=Math.max(1,Math.ceil(positions.count/96));for(let i=0;i<positions.count;i+=stride){const point=new THREE.Vector3().fromBufferAttribute(positions,i);obj.localToWorld(point);this.mesh.worldToLocal(point);this.surfacePoints.push(point);}});
    this.deactivate('reset');
  }
  opacity(value){for(const mat of this.materials){mat.opacity=value*(mat.userData?.crystalOpacity??1);mat.depthWrite=mat.opacity>=1;}}
  sparkle(dt,game,visibility=1){
    if(!this.surfacePoints?.length||visibility<=.05)return;
    this.surfaceSparkTimer-=dt;if(this.surfaceSparkTimer>0)return;
    this.surfaceSparkTimer=UNPO_CONFIG.crystalSparkleInterval??.22;
    this.mesh.updateWorldMatrix(true,false);
    this.sparkPosition.copy(this.surfacePoints[Math.floor(Math.random()*this.surfacePoints.length)]);this.mesh.localToWorld(this.sparkPosition);
    if(this.sparkPosition.z<0)return; // Camera is on +Z: favor the visible surface.
    game.burst(this.sparkPosition.x,this.sparkPosition.y,UNPO_CONFIG.crystalSparkleColor??0xc79965,{count:1,life:.12,speed:.12,size:.035,growth:3,glow:true,z:this.sparkPosition.z+.025,opacity:visibility});
  }
  attach(){this.generation=(this.generation??0)+1;this.owner.socket.add(this.mesh);this.mesh.position.set(0,0,0);this.mesh.rotation.set(0,0,0);this.hp=UNPO_CONFIG.crystalHp;this.radius=UNPO_CONFIG.crystalRadius;this.age=1;this.mesh.visible=true;this.syncHeld();}
  syncHeld(){this.x=this.owner.x;this.y=this.owner.y+UNPO_CONFIG.socketY;}
  hold(){this.attach();this.phase='held';this.active=true;this.opacity(1);}
  fire(player,ui){
    if(this.phase!=='held')return;
    this.owner.mesh.updateMatrixWorld(true);this.scene.attach(this.mesh);
    this.mesh.rotation.set(0,0,0);
    this.syncHeld();this.mesh.position.set(this.x,this.y,0);
    this.heading=Math.atan2(player.y-this.y,player.x-this.x);
    this.flightAge=0;this.phase='flying';this.updateVelocity();
    ui.say(UNPO_CONFIG.lines[Math.floor(Math.random()*UNPO_CONFIG.lines.length)]);
  }
  updateVelocity(){this.vx=Math.cos(this.heading)*UNPO_CONFIG.projectileSpeed;this.vy=Math.sin(this.heading)*UNPO_CONFIG.projectileSpeed;}
  deactivate(reason='destroyed',game){
    if(game&&(this.phase==='held'||this.phase==='flying')&&reason!=='reset'){
      // Capture the disappearance position before attach() moves it back to the socket.
      if(this.phase==='held')this.syncHeld();
      game.burst(this.x,this.y,UNPO_CONFIG.crystalParticleColor??0x8a4f25,{count:18,life:.65,speed:5,size:.16,drag:2,priority:true});
    }
    this.active=false;if(this.mesh)this.mesh.visible=false;
    if(this.owner?.active&&reason!=='reset'&&reason!=='owner-dead'){
      this.attach();this.phase='regenerating';this.regenerationAge=0;this.sparkTimer=0;this.opacity(0);
    }else this.phase='inactive';
  }
  update(dt,game){
    if(!this.owner.active)return;
    if(this.phase==='regenerating'){
      this.syncHeld();this.regenerationAge+=dt;
      const progress=clamp(this.regenerationAge/UNPO_CONFIG.regenerationDuration,0,1);
      this.opacity(progress);
      // Integral of a quadratic slowdown; full turns end at the original orientation.
      // Older cached configs may lack new visual fields. Never write NaN to a transform.
      const turns=Number.isFinite(UNPO_CONFIG.regenerationSpinTurns)?UNPO_CONFIG.regenerationSpinTurns:3;
      this.mesh.rotation.y=turns*Math.PI*2*(1-(1-progress)**3);
      this.sparkle(dt,game,progress);
      this.sparkTimer-=dt;if(this.sparkTimer<=0){game.burst(this.x,this.y,0xc88935);this.sparkTimer=.18;}
      if(this.regenerationAge>=UNPO_CONFIG.regenerationDuration){this.phase='held';this.active=true;this.opacity(1);this.mesh.rotation.y=0;this.owner.attackTimer=UNPO_CONFIG.attackInterval;}
      return;
    }
    if(this.phase==='held'){this.syncHeld();this.sparkle(dt,game);return;}
    if(this.phase!=='flying')return;
    this.previousX=this.x;this.previousY=this.y;
    // Split a boundary-crossing frame so steering ends exactly at the configured duration.
    const steeringDt=Math.min(dt,Math.max(0,UNPO_CONFIG.homingDuration-this.flightAge));
    if(steeringDt>0){const desired=Math.atan2(game.player.y-this.y,game.player.x-this.x);const delta=Math.atan2(Math.sin(desired-this.heading),Math.cos(desired-this.heading));this.heading+=clamp(delta,-UNPO_CONFIG.homingTurnRate*steeringDt,UNPO_CONFIG.homingTurnRate*steeringDt);this.updateVelocity();}
    this.flightAge+=dt;this.x+=this.vx*dt;this.y+=this.vy*dt;
    const spinRate=Number.isFinite(UNPO_CONFIG.projectileSpinRate)?UNPO_CONFIG.projectileSpinRate:Math.PI*.5;
    this.mesh.rotation.y=(this.flightAge*spinRate)%(Math.PI*2);
    this.mesh.position.set(this.x,this.y,0); // Keep the crystal upright while its velocity changes.
    this.sparkle(dt,game);
    if(Math.abs(this.x)>19||Math.abs(this.y)>11)this.deactivate('offscreen',game);
  }
}

class UnpoEnemy extends Enemy {
  constructor(scene,body,crystal){super(scene,0);this.mesh.clear();this.mesh.add(body);this.visual=body;this.isUnpo=true;this.scoreValue=UNPO_CONFIG.score;this.name=UNPO_CONFIG.name;
    this.socket=new THREE.Group();this.socket.name='UnpoSocket';this.socket.position.set(0,UNPO_CONFIG.socketY,0);this.mesh.add(this.socket);
    this.crystal=new UnpoCrystal(scene,crystal,this);
  }
  activate(y=0){this.generation=(this.generation??0)+1;this.active=true;this.hp=UNPO_CONFIG.maxHp;this.radius=UNPO_CONFIG.bodyRadius;this.x=14;this.y=y;this.baseY=y;this.age=1;this.attackTimer=UNPO_CONFIG.attackInterval;this.mesh.visible=true;this.mesh.position.set(this.x,this.y,0);this.crystal.hold();}
  deactivate(game){super.deactivate();this.crystal?.deactivate('owner-dead',game);}
  update(dt,game){this.age+=dt;this.x=Math.max(9,this.x-dt*1.5);this.y=clamp(this.baseY+Math.sin(this.age*.8)*1.5,-4.5,4.5);this.mesh.position.set(this.x,this.y,0);
    this.visual.rotation.y=Math.sin(this.age*Math.PI*2/UNPO_CONFIG.bodySwayPeriod)*UNPO_CONFIG.bodySwayAmplitude;
    if(this.crystal.phase==='held'){this.attackTimer-=dt;if(this.attackTimer<=0){this.crystal.fire(game.player,game.ui);game.audio?.effect('missile',1,this.x);}}
  }
}

class Game {
  constructor(model,unpoModels){
    this.ui=new UI();this.input=new Input();this.audio=new Sound();this.state='ready';this.elapsed=0;this.score=0;
    this.mobile=new MobileDisplay({onBlocked:()=>{this.input.clear();this.ui.charge(0);this.audio.pause();},onReady:()=>{this.input.clear();if(this.state==='playing')this.audio.start(false);this.last=performance.now();}});
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color(0x070d1c);this.scene.fog=new THREE.Fog(0x070d1c,35,85);
    this.camera=new THREE.OrthographicCamera(-16,16,9,-9,.1,120);this.camera.position.set(0,0,40);this.camera.lookAt(0,0,0);
    this.renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));this.renderer.outputColorSpace=THREE.SRGBColorSpace;document.querySelector('#game').prepend(this.renderer.domElement);
    this.waveTrail=new WaveTrail(document.querySelector('#game'));
    this.scene.add(new THREE.HemisphereLight(0xaadfff,0x263053,2));const light=new THREE.DirectionalLight(0xffffff,2.5);light.position.set(-3,8,12);this.scene.add(light);
    this.player=new Player(this.scene,model);this.bullets=Array.from({length:96},()=>new Bullet(this.scene,false));this.enemyBullets=Array.from({length:64},()=>new Bullet(this.scene,true));this.enemies=Array.from({length:24},(_,i)=>new Enemy(this.scene,i%3));
    this.rocks=Array.from({length:32},()=>new Rock(this.scene));
    this.items=Array.from({length:12},()=>new PowerItem(this.scene));this.missiles=Array.from({length:12},()=>new Missile(this.scene,false));
    this.pods=Array.from({length:2},()=>{const mesh=new THREE.Group();const nose=part(mesh,geometry.cone,material.wing,0,0,0,.4,.5,.4);nose.rotation.z=-Math.PI/2;part(mesh,geometry.orb,material.glow,-.25,0,0,.3,.3,.3);this.scene.add(mesh);mesh.visible=false;return {mesh,active:false,x:0,y:0};});
    const unpo=new UnpoEnemy(this.scene,unpoModels.body,unpoModels.crystal);this.enemies.push(unpo);this.crystals=[unpo.crystal];
    this.makeBackground();this.makeEffects();this.resize();addEventListener('resize',()=>this.resize());
    this.ui.start.onclick=()=>{if(this.state==='paused')this.resume();else this.start();};this.ui.pause.onclick=()=>this.togglePause();
    addEventListener('keydown',e=>{if(!e.repeat&&(e.code==='KeyP'||e.code==='Escape'))this.togglePause();});
    addEventListener('blur',()=>{if(this.state==='playing')this.togglePause();else this.audio.pause();});document.addEventListener('visibilitychange',()=>{if(document.hidden){if(this.state==='playing')this.togglePause();else this.audio.pause();}});
    this.ui.update(5,0);this.last=performance.now();this.frame=this.frame.bind(this);requestAnimationFrame(this.frame);
  }
  resize(){const w=innerWidth,h=innerHeight,aspect=w/h; // Fit the entire gameplay rectangle, including portrait screens.
    const width=Math.max(WORLD.width,WORLD.height*aspect),height=width/aspect;
    Object.assign(this.camera,{left:-width/2,right:width/2,top:height/2,bottom:-height/2});this.camera.updateProjectionMatrix();this.renderer.setSize(w,h);this.waveTrail.resize(w,h);}
  makeBackground(){this.layers=[];for(let layer=0;layer<3;layer++){const positions=new Float32Array(120*3);for(let i=0;i<120;i++){positions[i*3]=(Math.random()-.5)*90;positions[i*3+1]=(Math.random()-.5)*65;positions[i*3+2]=-8-layer*12;}const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));const points=new THREE.Points(geo,new THREE.PointsMaterial({color:[0x72bccb,0x627695,0x3b526c][layer],size:.08+layer*.03}));this.scene.add(points);this.layers.push({points,speed:2/(layer+1)});}
    this.structures=[];for(let i=0;i<18;i++){const mesh=new THREE.Mesh(geometry.orb,material.structure);mesh.position.set(i*5-42,(i%2?1:-1)*(10+Math.random()*4),-7-Math.random()*12);mesh.scale.set(2+Math.random()*3,3+Math.random()*3,2+Math.random()*3);mesh.rotation.set(Math.random(),Math.random(),Math.random());this.scene.add(mesh);this.structures.push(mesh);}
    const grid=new THREE.GridHelper(100,35,0x23536b,0x142e43);grid.position.set(0,-12,-22);this.scene.add(grid);
  }
  makeEffects(){this.effects=Array.from({length:128},()=>{const mesh=new THREE.Mesh(geometry.orb,new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,depthWrite:false}));mesh.visible=false;this.scene.add(mesh);return {mesh,life:0};});this.explosionWaves=[];}
  burst(x,y,color,options={}){for(let i=0;i<(options.count??8);i++){let e=this.effects.find(e=>e.life<=0);if(!e&&options.priority)e=this.effects.reduce((a,b)=>a.life<b.life?a:b);if(!e)break;
    e.life=(options.life??.4)+Math.random()*.2;e.duration=e.life;e.drag=options.drag??0;e.growth=options.growth??0;e.mesh.visible=true;e.mesh.material.color.setHex(color);e.peakOpacity=options.opacity??1;e.mesh.material.opacity=e.peakOpacity;e.mesh.material.blending=options.glow?THREE.AdditiveBlending:THREE.NormalBlending;e.mesh.position.set(x,y,options.z??(options.glow?.4:0));
    const angle=Math.random()*Math.PI*2,speed=(options.speed??6.4)*(.3+Math.random()*.7);e.vx=Math.cos(angle)*speed;e.vy=Math.sin(angle)*speed;e.mesh.scale.setScalar((options.size??.12)*(1+Math.random()));}}
  explosion(x,y,boss=false){
    this.burst(x,y,0xff481b,{count:boss?32:14,life:boss?1.3:.55,speed:boss?12:7,size:boss?.45:.23,drag:2,glow:true,priority:boss});
    this.burst(x,y,0xffa12b,{count:boss?24:10,life:boss?1:.45,speed:boss?16:10,size:boss?.24:.13,drag:1,glow:true,priority:boss});
    this.burst(x,y,0xffdf86,{count:boss?8:3,life:.22,speed:2,size:boss?.8:.38,growth:3,glow:true,priority:boss});
    if(boss){this.explosionWaves??=[];for(let i=1;i<=5;i++)this.explosionWaves.push({x:x+(Math.random()-.5)*3,y:y+(Math.random()-.5)*3,delay:i*.16});}
  }
  updateEffects(dt){
    for(const wave of this.explosionWaves??[]){wave.delay-=dt;if(wave.delay<=0){this.burst(wave.x,wave.y,0xff6826,{count:18,life:.8,speed:10,size:.35,drag:2,glow:true,priority:true});this.burst(wave.x,wave.y,0xffdc75,{count:3,life:.2,speed:2,size:.7,growth:4,glow:true,priority:true});}}
    if(this.explosionWaves)this.explosionWaves=this.explosionWaves.filter(w=>w.delay>0);
    for(const e of this.effects)if(e.life>0){e.life-=dt;e.mesh.position.x+=e.vx*dt;e.mesh.position.y+=e.vy*dt;const damping=Math.exp(-e.drag*dt);e.vx*=damping;e.vy*=damping;if(e.growth)e.mesh.scale.multiplyScalar(1+e.growth*dt);e.mesh.material.opacity=Math.max(0,e.life/e.duration)*(e.peakOpacity??1);if(e.life<=0)e.mesh.visible=false;}
  }
  shoot(x,y,vx,vy,hostile,damage=1,options={}){const bullet=(hostile?this.enemyBullets:this.bullets).find(b=>!b.active);if(bullet){bullet.activate(x,y,vx,vy,damage,options);this.audio?.effect(hostile?'enemy':damage>1?'wave':'shot',damage,x);}}
  shootMissile(x,y){const missile=this.missiles?.find(b=>!b.active);if(!missile)return;const targets=[...this.enemies,...this.rocks,...this.crystals].filter(t=>t.active);let nearest=null,distance=Infinity;for(const target of targets){const d=(x-target.x)**2+(y-target.y)**2;if(d<distance){nearest=target;distance=d;}}const radius=100*(this.camera.right-this.camera.left)/Math.max(1,innerWidth);missile.activate(x,y,nearest,Math.max(.5,radius));this.audio?.effect('missile',1,x);}
  spawnPowerItem(type,x=this.player.x+3,y=this.player.y){const item=this.items.find(i=>!i.active);if(item&&POWER_UPS.includes(type))item.activate(x,y,type);return item;}
  updatePods(){for(let i=0;i<(this.pods??[]).length;i++){const pod=this.pods[i];pod.active=i<this.player.podCount;pod.mesh.visible=pod.active;if(pod.active){const point=this.player.history.behind((i+1)*1.3);pod.x=point.x;pod.y=point.y;pod.mesh.position.set(pod.x,pod.y,0);}}}
  dropPowerUp(rock){if(rock.size!=='large'||Math.random()>=1/3)return;const item=this.items?.find(i=>!i.active);if(item)item.activate(rock.x,rock.y,POWER_UPS[Math.floor(Math.random()*POWER_UPS.length)]);}
  spawnUnpo(x=14,y=0){const enemy=this.enemies.find(e=>e.isUnpo&&!e.active);if(!enemy)return null;enemy.activate(y);enemy.x=x;enemy.mesh.position.set(x,y,0);enemy.crystal.syncHeld();return enemy;}
  destroyRock(rock){this.dropPowerUp(rock);this.burst(rock.x,rock.y,0xd4b698);if(rock.size==='large'){const children=this.rocks.filter(r=>!r.active).slice(0,2);const speed=Math.hypot(rock.vx,rock.vy)||1;for(let i=0;i<children.length;i++){const side=i===0?-1:1;const velocity=splitVelocity(rock.vx,rock.vy,side);children[i].activate(rock.x-rock.vy/speed*side*.9,rock.y+rock.vx/speed*side*.9,'medium',velocity.vx,velocity.vy);}}rock.deactivate();this.score+=rock.size==='large'?100:50;this.ui.update(this.player.hp,this.score);}
  hitTarget(bullet,target){
    const available=bullet.energy??bullet.damage??1;
    const spent=Math.min(available,target.hp);
    target.hp-=spent;
    bullet.energy=available-spent;bullet.damage=bullet.energy;
    const destroyed=target.hp<=0,isEnemy=!target.isCrystal&&!this.rocks.includes(target);
    if(destroyed&&isEnemy)this.explosion(target.x,target.y,!!target.isUnpo);else if(!destroyed||!target.isCrystal)this.burst(target.x,target.y,bullet.green?0x7dff8c:0x8effff);
    this.audio?.effect(destroyed?(target.isUnpo?'bossExplosion':'explosion'):'hit',spent,target.x);
    if(destroyed&&target.isUnpo)this.ui.say(UNPO_CONFIG.deathLine,UNPO_CONFIG.deathLineDuration);
    if(target.hp<=0){if(this.rocks.includes(target))this.destroyRock(target);else if(target.isCrystal)target.deactivate('destroyed',this);else{target.deactivate(this);this.score+=target.scoreValue??[100,150,250][target.type];this.ui.update(this.player.hp,this.score);}}
    if(!bullet.isWave||bullet.energy<=0)bullet.deactivate();else{bullet.updateAppearance();}
  }
  start(){this.explosionWaves=[];this.input.clear();for(const entity of [...this.enemies,...this.bullets,...this.enemyBullets,...this.rocks,...(this.crystals??[]),...(this.items??[]),...(this.missiles??[])])entity.deactivate();for(const e of this.effects){e.life=0;e.mesh.visible=false;}this.elapsed=0;this.score=0;this.unpoTimer=UNPO_CONFIG.firstSpawnTime;this.ui.say('');this.rockTimer=3;this.ui.charge(0);this.spawnTimer=.6;this.spawnCount=0;this.player.reset();this.input.chargeMultiplier=1;if(this.pods)this.updatePods();this.state='playing';this.ui.update(5,0);this.ui.hide();this.ui.pause.textContent='Ⅱ';this.audio?.start();void this.mobile?.enter();}
  end(){this.state='over';this.mobile?.stop();this.audio?.finish();this.ui.charge(0);this.player.mesh.visible=false;this.input.clear();this.ui.show('GAME OVER',`FINAL SCORE  ${String(this.score).padStart(6,'0')}`,'RESTART');}
  togglePause(){if(this.state==='playing'){this.state='paused';this.audio?.pause();this.input.clear();this.ui.charge(0);this.ui.show('PAUSED','ひと休みして、再び宇宙へ。','RESUME');this.ui.pause.textContent='▶';}else if(this.state==='paused')this.resume();}
  resume(){this.input.clear();this.state='playing';this.ui.hide();this.ui.pause.textContent='Ⅱ';this.last=performance.now();this.audio?.start(false);void this.mobile?.enter();}
  update(dt){this.elapsed+=dt;this.player.update(dt,this.input,this);this.spawnTimer-=dt;if(this.spawnTimer<=0){const type=this.spawnCount++%3;const enemy=this.enemies.find(e=>!e.active&&!e.isUnpo&&e.type===type);if(enemy)enemy.activate((Math.random()-.5)*12,this.elapsed,Math.min(3,this.elapsed/45));this.spawnTimer=Math.max(.55,1.3-this.elapsed*.003);}
    for(const enemy of this.enemies)if(enemy.active)enemy.update(dt,this);
    this.ui.tick?.(dt);this.unpoTimer-=dt;
    if(this.unpoTimer<=0){this.spawnUnpo();this.unpoTimer=UNPO_CONFIG.spawnInterval;}
    this.rockTimer-=dt;
    if(this.rockTimer<=0){const free=this.rocks.filter(r=>!r.active);const reserved=this.rocks.filter(r=>r.active&&r.size==='large').length; // Reserve slots for every future split.
      if(free.length>=reserved+3)free[0].activate(18,(Math.random()-.5)*11);this.rockTimer=5+Math.random()*2;}
    for(const rock of this.rocks)if(rock.active)rock.update(dt);
    for(const crystal of this.crystals??[]){
      crystal.update(dt,this);
      if(crystal.phase!=='flying')continue;
      if(this.rocks.some(rock=>rock.active&&Number.isFinite(hitTime(crystal,rock))))crystal.deactivate('terrain',this);
      else if(Number.isFinite(hitTime(crystal,this.player))){crystal.deactivate('player',this);this.player.damage(this);if(this.state!=='playing')return;}
    }
    for(const item of this.items??[]){if(!item.active)continue;item.update(dt);if(item.active&&overlap(item,this.player)){item.deactivate();this.player.pickup(item.type,this);this.burst(item.x,item.y,POWER_COLORS[item.type]);}}
    for(const bullet of [...this.bullets,...(this.missiles??[])]){
      if(!bullet.active)continue;
      bullet.update(dt);
      if(!bullet.active)continue;
      // Sort enemies and rocks together by the first contact along this frame's flight.
      const contacts=[...this.rocks,...this.enemies,...(this.crystals??[])].filter(target=>target.active&&(target.age===undefined||target.age>=.7))
        .map(target=>({target,time:hitTime(bullet,target)})).filter(hit=>Number.isFinite(hit.time)).sort((a,b)=>a.time-b.time);
      for(const {target} of contacts){
        if(!bullet.active)break;
        if(target.active&&Number.isFinite(hitTime(bullet,target)))this.hitTarget(bullet,target);
      }
    }
    for(const bullet of this.enemyBullets){if(!bullet.active)continue;bullet.update(dt);if(bullet.active&&overlap(bullet,this.player)){bullet.deactivate();this.player.damage(this);if(this.state!=='playing')return;}}
    for(const enemy of this.enemies)if(enemy.active&&enemy.age>=.7&&overlap(enemy,this.player)){if(!enemy.isUnpo){this.explosion(enemy.x,enemy.y);this.audio?.effect('explosion',1,enemy.x);enemy.deactivate();}this.player.damage(this);if(this.state!=='playing')return;}
    for(const rock of this.rocks)if(rock.active&&overlap(rock,this.player)){this.player.damage(this);if(this.state!=='playing')return;}
  }
  animateBackground(dt){for(const layer of this.layers){const p=layer.points.geometry.attributes.position;for(let i=0;i<p.count;i++){p.array[i*3]-=layer.speed*dt;if(p.array[i*3]<-45)p.array[i*3]=45;}p.needsUpdate=true;}for(const mesh of this.structures){mesh.position.x-=2.5*dt;mesh.rotation.x+=dt*.04;if(mesh.position.x<-48)mesh.position.x=48;}}
  frame(now){const dt=Math.min((now-this.last)/1000,.04);this.last=now;this.audio?.tick();if(this.state==='playing'&&!this.mobile?.blocked)this.update(dt);if(this.state!=='paused'&&!this.mobile?.blocked){this.animateBackground(dt);this.updateEffects(dt);}this.renderer.render(this.scene,this.camera);this.waveTrail.render(this.bullets,this.camera);this.ui.enemyHealth(this.enemies,this.camera);this.ui.equipment(this.player);requestAnimationFrame(this.frame);}
}

// Finish loading before enabling play; startup errors reach index.html's error screen.
const [playerModel,unpoBody,unpoCrystal]=await Promise.all([
  loadIbojitchPlayer(),
  loadModel(new URL('./kuwassu_unpo_character.glb',import.meta.url).href),
  loadModel(new URL('./crystal_unpo_projectile.glb?v=20261007-crystal3',import.meta.url).href),
]);
// The supplied crystal is Z-up: rotate +Z to +Y before measuring its height.
unpoCrystal.rotation.x=-Math.PI/2;
unpoCrystal.updateMatrixWorld(true);
const game=new Game(playerModel,{body:fitModel(unpoBody,UNPO_CONFIG.bodyHeight),crystal:fitModel(unpoCrystal,UNPO_CONFIG.crystalHeight)});
// Optional debug placement: open index.html?debugUnpo=1 for an immediate spawn.
const debugFlags=new URLSearchParams(location.search);
if(debugFlags.has('debugUnpo')||debugFlags.has('debugItems')){game.ui.start.onclick=()=>{if(game.state==='paused')game.resume();else{game.start();if(debugFlags.has('debugUnpo'))game.spawnUnpo(10,0);if(debugFlags.has('debugItems'))POWER_UPS.forEach((type,i)=>game.spawnPowerItem(type,-7+i*2,0));}};}
