import * as THREE from 'three';
import { loadIbojitchPlayer } from './playerModel.js';
import { WaveTrail } from './waveTrail.js';
import { loadModel, fitModel } from './modelLoader.js';
import { UNPO_CONFIG } from './unpoConfig.js?v=20261007-orb';
import { Sound } from './sound.js?v=20261008-atmosphere';
import { Scenery } from './scenery.js';
import { MobileDisplay } from './mobileDisplay.js?v=20261007-landscape';
import { createPowerIcon } from './powerIcons.js?v=20261007-orb';
import { Terrain, polygonHitTime } from './terrain.js?v=20261007-rocky';
import { STAGE2_DATA } from './stage2Data.js';
import { createBattleship } from './battleshipModel.js';

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const overlap = (a, b) => (a.x-b.x)**2 + (a.y-b.y)**2 < (a.radius+b.radius)**2;
const WORLD = { width: 32, height: 18 };
const POWER_UPS = ['energy','wide','missile','quick','pod'];
const POWER_NAMES = {energy:'エネルギーカプセル',wide:'ワイドショット',missile:'ミサイル',quick:'クイックチャージ',pod:'ウィングポッド',orb:'ガードオーブ'};
const POWER_COLORS = {energy:0xff6d93,wide:0x72d9ff,missile:0xffb957,quick:0x7dff8c,pod:0xcb9fff,orb:0xffdc42};
const ORB_CONFIG={orbitRadiusPx:50,hitRadiusPx:8,angularSpeed:Math.PI*4,damageInterval:.05,maxStep:1/120};
const STAGE_CONFIG={clearDelay:4,fadeDuration:1.25,turretHp:4,turretInterval:2.4,shipHp:512,enemyMissileSpeed:6,shipChargeTime:2,shipWaveInterval:7,shipWaveSpeed:16};
const SHIP_OUTLINES=[[[ -7,-2.2],[-4.8,-1.15],[4.8,-1.15],[6,-1.9],[4.8,-3.45],[-4.5,-3.45]].reverse(),[[-5,-1.31],[5,-1.31],[5,-1.09],[-5,-1.09]],[[-.8,-1.1],[1.8,-1.1],[1.8,-.1],[-.8,-.1]],[[2,-3.83],[4.8,-3.83],[4.8,-3.45],[2,-3.45]]];
const PLAYER_MAX_HP=5;
const MISSILE_INTERVAL=2;
const DOUBLE_MISSILE_INTERVAL=1;
const MISSILE_SPREAD=Math.PI/6;
const POD_SHOT_ANGLE=Math.PI/18;
const MISSILE_DAMAGE=2;
const MIN_WAVE_HOLD_MS=200;
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
  if(target.isArmour){const ship=target.owner;const relative={previousX:(bullet.previousX??bullet.x)-(ship.previousX??ship.x),previousY:(bullet.previousY??bullet.y)-(ship.previousY??ship.y),x:bullet.x-ship.x,y:bullet.y-ship.y,radius:bullet.radius};return Math.min(...SHIP_OUTLINES.map(points=>polygonHitTime(relative,points)));}
  const x=bullet.previousX??bullet.x,y=bullet.previousY??bullet.y;
  const dx=bullet.x-x,dy=bullet.y-y,ox=x-target.x,oy=y-target.y;
  const radius=bullet.radius+target.radius,c=ox*ox+oy*oy-radius*radius;
  if(c<=0)return 0;
  const a=dx*dx+dy*dy,b=2*(ox*dx+oy*dy),disc=b*b-4*a*c;
  if(!a||disc<0)return Infinity;
  const t=(-b-Math.sqrt(disc))/(2*a);
  return t>=0&&t<=1?t:Infinity;
}
// Both projectiles can move: solve their relative swept-circle motion.
function relativeHitTime(a,b){
  return hitTime({previousX:(a.previousX??a.x)-(b.previousX??b.x),previousY:(a.previousY??a.y)-(b.previousY??b.y),x:a.x-b.x,y:a.y-b.y,radius:a.radius},{x:0,y:0,radius:b.radius});
}
// Shared geometry/materials: pooled bullets and enemies never allocate GPU assets per frame.
const geometry = {
  cone: new THREE.ConeGeometry(.55, 1.6, 4),
  box: new THREE.BoxGeometry(1, 1, 1),
  orb: new THREE.IcosahedronGeometry(.6, 0),
  bullet: new THREE.SphereGeometry(.14, 6, 4),
  missileBody: new THREE.CylinderGeometry(.13,.13,.65,8),
  missileTip: new THREE.ConeGeometry(.13,.3,8),
  missileFlame: new THREE.ConeGeometry(.17,.75,6),
};
const material = {
  hull: new THREE.MeshStandardMaterial({color:0xc9e8ee, metalness:.55, roughness:.35}),
  wing: new THREE.MeshStandardMaterial({color:0x278fa9, metalness:.6, roughness:.4}),
  glow: new THREE.MeshBasicMaterial({color:0x6affec}),
  enemy: [0xff7866,0xc18aff,0xffc05b].map(color=>new THREE.MeshStandardMaterial({color,metalness:.35,roughness:.5,flatShading:true})),
  enemyBullet: new THREE.MeshBasicMaterial({color:0xff576c}),
  brownBullet: new THREE.MeshBasicMaterial({color:0xb77332}),
  orbCore: new THREE.MeshBasicMaterial({color:0xffea70}),
  orbHalo: new THREE.MeshBasicMaterial({color:0xffb927,transparent:true,opacity:.3,depthWrite:false,blending:THREE.AdditiveBlending}),
  structure: new THREE.MeshStandardMaterial({color:0x17334e,roughness:.85,flatShading:true}),
  rock: new THREE.MeshStandardMaterial({color:0x9c8b78,roughness:1,flatShading:true}),
  wave: new THREE.MeshBasicMaterial({color:0x8effff,transparent:true,opacity:.65}),
  quick: new THREE.MeshBasicMaterial({color:0x83ff97}),
  quickAura: new THREE.MeshBasicMaterial({color:0x41ef6a,transparent:true,opacity:.65}),
  exhaust: new THREE.MeshBasicMaterial({color:0xff751e,transparent:true,opacity:.65,depthWrite:false,blending:THREE.AdditiveBlending}),
  exhaustCore: new THREE.MeshBasicMaterial({color:0xffe9a2,transparent:true,opacity:.9,depthWrite:false,blending:THREE.AdditiveBlending}),
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
  shotChanged(before,cancel=false){if(!before&&this.firing){this.shotStartedAt=performance.now();this.shotRequests.push(1);}else if(before&&!this.firing){const ms=this.chargeMs;if(!cancel&&this.heldMs>=MIN_WAVE_HOLD_MS)this.shotRequests.push(chargeDamage(ms));this.shotStartedAt=null;}}
  get heldMs(){return this.shotStartedAt===null?0:Math.max(0,performance.now()-this.shotStartedAt);}
  get chargeMs(){return clamp(this.heldMs*(this.chargeMultiplier??1),0,1500);}
  clear(){this.keys.clear();this.stick.x=this.stick.y=0;this.stickPointer=null;this.firePointers.clear();this.shotStartedAt=null;this.shotRequests.length=0;this.knob.style.transform='';this.fireButton.classList.remove('active');}
  get movement(){let x=Number(this.keys.has('KeyD')||this.keys.has('ArrowRight'))-Number(this.keys.has('KeyA')||this.keys.has('ArrowLeft'))+this.stick.x;let y=Number(this.keys.has('KeyW')||this.keys.has('ArrowUp'))-Number(this.keys.has('KeyS')||this.keys.has('ArrowDown'))+this.stick.y;const length=Math.max(1,Math.hypot(x,y));return {x:x/length,y:y/length};}
  get firing(){return this.keys.has('Space')||this.firePointers.size>0;}
}

class UI {
  constructor(){this.hp=document.querySelector('#hp');this.score=document.querySelector('#score');this.overlay=document.querySelector('#overlay');this.title=document.querySelector('#title');this.message=document.querySelector('#message');this.start=document.querySelector('#start');this.pause=document.querySelector('#pause');this.continueButton=document.querySelector('#continue');this.debugHud=new URLSearchParams(location.search).get('debugHud')==='1';document.querySelector('#game').classList.toggle('debug-hud',this.debugHud);}
  update(hp,score){this.hp.textContent='● '.repeat(hp)+'○ '.repeat(5-hp);this.score.textContent=String(score).padStart(6,'0');}
  show(title,message,button){if(this.continueButton)this.continueButton.hidden=true;this.title.textContent=title;this.message.textContent=message;this.start.textContent=button;this.overlay.hidden=false;}
  hide(){this.overlay.hidden=true;}
  charge(ms,quick=false,heldMs=ms){const gauge=document.querySelector('#charge');gauge.value=ms;const power=chargeDamage(ms)+(quick?1:0);document.querySelector('#charge-power').textContent=heldMs<MIN_WAVE_HOLD_MS?'CHARGE':ms>=1500?`MAX ×${power}`:`×${power}`;}
  equipment(player,invincible=false){document.querySelector('#equipment').textContent=`W ×${player.wide}  ${player.hasMissile?`M ×${player.missileLevel}  `:''}${player.quick?'Q ✓  ':''}${player.podCount?`P ×${player.podCount}  `:''}${player.hasOrb?'O ✓':''}${invincible?'  INVINCIBLE':''}`;}
  say(text,duration=2){document.querySelector('#dialogue').textContent=text;this.dialogueTime=duration;}
  tick(dt){this.dialogueTime=Math.max(0,(this.dialogueTime||0)-dt);if(!this.dialogueTime)document.querySelector('#dialogue').textContent='';}
  enemyHealth(enemies,camera){const panel=document.querySelector('#enemy-hp');const enemy=enemies.find(e=>e.isUnpo&&e.active);panel.hidden=!enemy;panel.style.opacity=String(1-(this.fadeAmount??0));if(!enemy)return;
    const maxHp=enemy.maxHp??UNPO_CONFIG.maxHp;
    if(panel.dataset){panel.dataset.waveTimer=String(enemy.waveTimer??'');panel.dataset.waveCharge=String(enemy.waveCharge??'');}
    const label=document.querySelector('#enemy-hp-name');if(label)label.textContent=enemy.isStage2Boss?'DREADNOUGHT / ウンポク・ワッス':'ウンポク・ワッス';
    const status=document.querySelector('#enemy-hp-status');if(status)status.textContent=enemy.isStage2Boss?(enemy.waveCharge>0?'波動砲チャージ':enemy.waveFlash>0?'波動砲 発射':'巡航'):enemy.hp<=UNPO_CONFIG.rageHp?'RAGE':'ACTIVE';
    document.querySelector('#enemy-hp-value').textContent=`${enemy.hp} / ${maxHp}`;
    document.querySelector('#enemy-hp-fill').style.width=`${clamp(enemy.hp/maxHp,0,1)*100}%`;
  }
}

class Player {
  constructor(scene,model){this.mesh=new THREE.Group();this.mesh.add(model);scene.add(this.mesh);this.radius=.48;this.reset();}
  reset(){this.x=-10;this.y=0;this.hp=PLAYER_MAX_HP;this.wide=1;this.missileLevel=0;this.hasMissile=false;this.hasOrb=false;this.quick=false;this.podCount=0;this.missileCooldown=0;this.history=new FlightHistory(this.x,this.y);this.invulnerable=0;this.cooldown=0;this.mesh.visible=true;this.mesh.position.set(this.x,this.y,0);}
  pickup(type,game){const previousMissileLevel=this.missileLevel??0;const before=[this.hp,this.wide,this.missileLevel??0,this.quick,this.podCount,this.hasOrb].join('|');if(type==='energy')this.hp=Math.min(PLAYER_MAX_HP,this.hp+1);if(type==='wide')this.wide=Math.min(3,this.wide+1);if(type==='missile'){this.missileLevel=Math.min(2,(this.missileLevel??0)+1);this.hasMissile=true;if(this.missileLevel===2&&previousMissileLevel<2)this.missileCooldown=Math.min(this.missileCooldown,DOUBLE_MISSILE_INTERVAL);}if(type==='quick'){this.quick=true;game.input.chargeMultiplier=1.5;}if(type==='pod')this.podCount=Math.min(2,this.podCount+1);if(type==='orb'&&!this.hasOrb){this.hasOrb=true;game.orb?.equip();}if(before===[this.hp,this.wide,this.missileLevel??0,this.quick,this.podCount,this.hasOrb].join('|'))game.emitFog?.(this.x-1.5,this.y);game.ui.update(this.hp,game.score);game.ui.say(`${POWER_NAMES[type]} GET!`);game.audio?.effect('pickup',1,this.x);}
  update(dt,input,game){const movement=input.movement;this.x=clamp(this.x+movement.x*10*dt,-15,14.5);this.y=clamp(this.y+movement.y*10*dt,-7.5,7.5);this.invulnerable=Math.max(0,this.invulnerable-dt);this.history.record(this.x,this.y);game.updatePods?.();this.missileCooldown=Math.max(0,this.missileCooldown-dt);
    const shotPressed=input.shotRequests.includes(1);while(input.shotRequests.length){const power=input.shotRequests.shift();const charged=power>1;game.shoot(this.x+1,this.y,charged?30:24,0,false,power+(charged&&this.quick?1:0),{wide:charged?1:this.wide,green:charged&&this.quick});if(!charged)for(const pod of game.pods??[])if(pod.active){const angle=pod.y>this.y?POD_SHOT_ANGLE:-POD_SHOT_ANGLE;game.shoot(pod.x+.5,pod.y,24*Math.cos(angle),24*Math.sin(angle),false,1);}if(charged)game.burst(this.x+1,this.y,this.quick?0x7dff8c:0x8effff);}
    if(this.hasMissile&&(input.firing||shotPressed)&&this.missileCooldown<=0){
      if(this.missileLevel===2){game.shootMissile(this.x+1,this.y,MISSILE_SPREAD,1);game.shootMissile(this.x+1,this.y,-MISSILE_SPREAD,-1);}
      else game.shootMissile(this.x+1,this.y);
      this.missileCooldown=this.missileLevel===2?DOUBLE_MISSILE_INTERVAL:MISSILE_INTERVAL;
    }
    game.ui.charge(input.chargeMs,this.quick,input.heldMs??input.chargeMs);game.audio?.setCharge(input.chargeMs/1500);this.mesh.position.set(this.x,this.y,0);this.mesh.rotation.x=THREE.MathUtils.lerp(this.mesh.rotation.x,movement.y*.4,dt*10);this.mesh.visible=this.invulnerable<=0||Math.floor(this.invulnerable*16)%2===0;}
  damage(game){if(game.debugInvincible||game.transitionShield||this.invulnerable>0)return;this.hp--;this.invulnerable=1.4;game.audio?.effect('damage',1,this.x);game.ui.update(this.hp,game.score);game.burst(this.x,this.y,0x65eee1);if(this.hp<=0)game.end();}
}

class Bullet {
  constructor(scene,hostile){this.hostile=hostile;this.mesh=new THREE.Group();this.core=new THREE.Mesh(geometry.bullet,hostile?material.enemyBullet:material.glow);this.mesh.add(this.core);this.lanes=[new THREE.Mesh(geometry.bullet,material.glow),new THREE.Mesh(geometry.bullet,material.glow)];this.lanes.forEach(lane=>{this.mesh.add(lane);lane.visible=false;});this.aura=new THREE.Mesh(geometry.bullet,material.wave);this.mesh.add(this.aura);scene.add(this.mesh);
    this.deactivate();}
  activate(x,y,vx,vy,damage=1,options={}){Object.assign(this,{x,y,previousX:x,previousY:y,vx,vy,damage,energy:damage,isWave:!this.hostile&&damage>1,age:0,active:true,wide:options.wide??1,green:!!options.green,brown:!!options.brown});this.updateAppearance();this.mesh.visible=true;this.mesh.position.set(x,y,0);}
  updateAppearance(){const power=this.energy,wave=this.isWave;this.radius=this.hostile?.22:wave?.25+power*.045:.16+.22*((this.wide??1)-1);this.mesh.scale.set(wave?4+power*.35:this.hostile?1.7:2.3,wave?this.radius/.14:this.hostile?1.7:.8,wave?2:1);this.aura.visible=wave;const auraSize=1.15+power*.035;this.aura.scale.set(auraSize,auraSize,auraSize);
    if(this.core){this.core.visible=wave||this.hostile||this.wide!==2;this.core.material=this.green?material.quick:this.hostile?(this.brown?material.brownBullet:material.enemyBullet):material.glow;this.aura.material=this.green?material.quickAura:material.wave;this.lanes.forEach((lane,i)=>{lane.visible=!wave&&!this.hostile&&this.wide>1;lane.position.y=(i?1:-1)*.275/.8;});}}
  deactivate(){this.active=false;this.mesh.visible=false;}
  update(dt){this.previousX=this.x;this.previousY=this.y;this.x+=this.vx*dt;this.y+=this.vy*dt;this.age+=dt;this.mesh.position.set(this.x,this.y,0);if(Math.abs(this.x)>19||Math.abs(this.y)>11)this.deactivate();}
}

class BossWave extends Bullet {
  updateAppearance(){this.isBossWave=true;this.isWave=false;this.radius=.65;this.mesh.scale.set(11,4.5,2);this.aura.visible=true;this.aura.scale.set(1.25,1.3,1.3);if(this.core){this.core.material=material.brownBullet;this.aura.material=material.wave;this.lanes.forEach(lane=>lane.visible=false);}}
}

const FOG_CONFIG={duration:1.5,damageDuration:1,damageInterval:.1,radius:1.65};
class YellowFog {
  constructor(scene){
    if(!YellowFog.texture){const canvas=document.createElement('canvas');canvas.width=canvas.height=64;const ctx=canvas.getContext('2d'),gradient=ctx.createRadialGradient(32,32,0,32,32,32);gradient.addColorStop(0,'rgba(255,224,70,.7)');gradient.addColorStop(.45,'rgba(255,211,45,.35)');gradient.addColorStop(1,'rgba(255,211,45,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);YellowFog.texture=new THREE.CanvasTexture(canvas);}
    this.mesh=new THREE.Group();this.material=new THREE.SpriteMaterial({map:YellowFog.texture,transparent:true,depthWrite:false});
    for(let i=0;i<9;i++){const puff=new THREE.Sprite(this.material);const angle=i*Math.PI*2/9;puff.position.set(Math.cos(angle)*.95,Math.sin(angle)*.65,.6);puff.scale.set(2.4,2.1,1);this.mesh.add(puff);}scene.add(this.mesh);this.contacts=new Map();this.deactivate();
  }
  activate(x,y){this.x=this.previousX=x;this.y=this.previousY=y;this.age=0;this.radius=FOG_CONFIG.radius;this.active=true;this.contacts.clear();this.mesh.visible=true;this.mesh.position.set(x,y,.4);this.mesh.scale.set(1,1,1);this.material.opacity=1;}
  deactivate(){this.active=false;this.mesh.visible=false;this.contacts.clear();}
  update(dt,game){
    const previousAge=this.age;this.age+=dt;this.previousX=this.x;this.previousY=this.y;this.x-=(game.stage===2?STAGE2_DATA.scrollSpeed:2.5)*dt;
    this.mesh.position.set(this.x,this.y,.4);const size=1+this.age*.25;this.mesh.scale.set(size,size,1);this.radius=FOG_CONFIG.radius*size;this.material.opacity=Math.max(0,1-this.age/FOG_CONFIG.duration);
    const damageDt=Math.max(0,Math.min(this.age,FOG_CONFIG.damageDuration)-previousAge);
    if(damageDt>0)for(const target of [...game.enemies,...(game.crystals??[])]){
      if(!target.active||target.hp<=0||(target.age!==undefined&&target.age<.7)){this.contacts.delete(target);continue;}
      const time=relativeHitTime(this,target);if(!Number.isFinite(time)||time*dt>damageDt){this.contacts.delete(target);continue;}
      let contact=this.contacts.get(target);if(!contact||contact.generation!==target.generation){contact={generation:target.generation,elapsed:0};this.contacts.set(target,contact);}
      contact.elapsed+=Math.max(0,damageDt-time*dt);const damage=Math.floor((contact.elapsed+1e-9)/FOG_CONFIG.damageInterval);
      if(damage){contact.elapsed-=damage*FOG_CONFIG.damageInterval;game.damageTarget(target,damage,0xffdc42);}
    }
    if(this.age>=FOG_CONFIG.duration)this.deactivate();
  }
}

class FlightHistory {
  constructor(x,y){this.xs=new Float32Array(512);this.ys=new Float32Array(512);this.head=0;this.count=0;this.record(x-4,y);this.record(x,y);}
  record(x,y){const previous=(this.head+511)%512;if(this.count&&Math.hypot(x-this.xs[previous],y-this.ys[previous])<.03)return;this.xs[this.head]=x;this.ys[this.head]=y;this.head=(this.head+1)%512;this.count=Math.min(512,this.count+1);}
  behind(distance){let current=(this.head+511)%512;let x=this.xs[current],y=this.ys[current];for(let i=1;i<this.count;i++){const previous=(current+511)%512;const dx=this.xs[previous]-x,dy=this.ys[previous]-y,length=Math.hypot(dx,dy);if(length>=distance)return {x:x+dx*distance/length,y:y+dy*distance/length};distance-=length;current=previous;x=this.xs[current];y=this.ys[current];}return {x,y};}
}

class Missile extends Bullet {
  constructor(scene,hostile=false){
    super(scene,hostile);this.mesh.clear();
    part(this.mesh,geometry.missileBody,hostile?material.enemy[0]:material.hull).rotation.z=-Math.PI/2;
    part(this.mesh,geometry.missileTip,material.wing,.475).rotation.z=-Math.PI/2;
    part(this.mesh,geometry.box,material.structure,-.36,0,0,.12,.23,.23);
    part(this.mesh,geometry.box,material.wing,-.2,0,0,.25,.48,.045);
    part(this.mesh,geometry.box,material.wing,-.2,0,0,.25,.045,.48);
    this.exhaust=new THREE.Group();this.exhaust.position.x=-.46;this.mesh.add(this.exhaust);
    part(this.exhaust,geometry.missileFlame,material.exhaust,-.375).rotation.z=Math.PI/2;
    part(this.exhaust,geometry.missileFlame,material.exhaustCore,-.23,0,0,.45,.62,.45).rotation.z=Math.PI/2;
  }
  updateAppearance(){this.mesh.scale.set(1,1,1);this.radius=.22;}
  activate(x,y,target,turnRadius,heading=0){this.speed=this.hostile?STAGE_CONFIG.enemyMissileSpeed:12;super.activate(x,y,Math.cos(heading)*this.speed,Math.sin(heading)*this.speed,this.hostile?1:MISSILE_DAMAGE);this.isWave=false;this.isEnemyMissile=!!this.hostile;this.hp=this.hostile?1:undefined;this.target=target;this.targetGeneration=target?.generation;this.heading=heading;this.turnRadius=turnRadius;this.mesh.rotation.z=heading;if(this.exhaust)this.exhaust.scale.set(1,1,1);}
  update(dt){const speed=this.speed??12;const alive=this.hostile?this.target?.hp>0:this.target?.active&&this.target.generation===this.targetGeneration;if(alive){const angle=Math.atan2(this.target.y-this.y,this.target.x-this.x);const delta=Math.atan2(Math.sin(angle-this.heading),Math.cos(angle-this.heading));const turn=speed/this.turnRadius*dt;this.heading+=clamp(delta,-turn,turn);}this.vx=Math.cos(this.heading)*speed;this.vy=Math.sin(this.heading)*speed;super.update(dt);this.mesh.rotation.z=this.heading;
    if(this.exhaust){const pulse=Math.sin(this.age*65);this.exhaust.scale.set(1+pulse*.16,1+pulse*.07,1+pulse*.07);}
  }
}

class PowerItem {
  constructor(scene){this.mesh=new THREE.Group();this.icon=null;part(this.mesh,geometry.orb,material.glow,0,0,0,.65,.65,.65);scene.add(this.mesh);this.radius=.65;this.deactivate();}
  activate(x,y,type){this.x=x;this.y=y;this.type=type;this.active=true;this.mesh.visible=true;this.mesh.position.set(x,y,0);
    PowerItem.icons??={};if(!PowerItem.icons[type]){const texture=new THREE.CanvasTexture(createPowerIcon(type,POWER_COLORS[type]));texture.colorSpace=THREE.SRGBColorSpace;PowerItem.icons[type]=new THREE.SpriteMaterial({map:texture,depthTest:false,depthWrite:false});}
    if(!this.icon){this.icon=new THREE.Sprite();this.icon.scale.set(1,1,1);this.mesh.add(this.icon);}this.icon.material=PowerItem.icons[type];}
  deactivate(){this.active=false;this.mesh.visible=false;}
  update(dt){this.x-=2.5*dt;this.mesh.position.set(this.x,this.y,0);if(this.x<-18)this.deactivate();}
}

class OrbitOrb {
  constructor(scene){
    this.mesh=new THREE.Group();part(this.mesh,geometry.orb,material.orbCore);part(this.mesh,geometry.orb,material.orbHalo,0,0,0,1.8,1.8,1.8);scene.add(this.mesh);
    this.contacts=new Map();this.sweep={};this.origin={x:0,y:0};this.reset();
  }
  reset(){this.active=false;this.angle=0;this.contacts.clear();this.mesh.visible=false;}
  equip(){this.reset();this.active=true;this.mesh.visible=true;}
  touches(target,from,to){
    const tx=target.previousX??target.x,ty=target.previousY??target.y;
    const dx=target.x-tx,dy=target.y-ty;
    this.sweep.previousX=this.previousX-tx-dx*from;this.sweep.previousY=this.previousY-ty-dy*from;
    this.sweep.x=this.x-tx-dx*to;this.sweep.y=this.y-ty-dy*to;this.sweep.radius=this.radius;
    this.origin.radius=target.radius;this.touchTime=hitTime(this.sweep,this.origin);return Number.isFinite(this.touchTime);
  }
  update(dt,game){
    if(!this.active)return;
    const player=game.player,units=(game.camera.right-game.camera.left)/Math.max(1,innerWidth);
    const orbitRadius=ORB_CONFIG.orbitRadiusPx*units;this.radius=ORB_CONFIG.hitRadiusPx*units;
    const cx=player.previousX??player.x,cy=player.previousY??player.y;
    const dx=player.x-cx,dy=player.y-cy,startAngle=this.angle;
    const steps=Math.max(1,Math.ceil(dt/ORB_CONFIG.maxStep)),stepTime=dt/steps;
    const fading=game.transitionShield;
    const targets=fading?[]:[...game.enemies,...game.rocks,...(game.crystals??[])];
    for(let step=1;step<=steps;step++){
      const from=(step-1)/steps,to=step/steps;
      const before=startAngle+ORB_CONFIG.angularSpeed*dt*from,after=startAngle+ORB_CONFIG.angularSpeed*dt*to;
      this.previousX=cx+dx*from+Math.cos(before)*orbitRadius;this.previousY=cy+dy*from+Math.sin(before)*orbitRadius;
      this.x=cx+dx*to+Math.cos(after)*orbitRadius;this.y=cy+dy*to+Math.sin(after)*orbitRadius;
      for(const bullet of fading?[]:(game.enemyShots??game.enemyBullets))if(bullet.active&&!bullet.isBossWave&&this.touches(bullet,from,to)){
        if(from+(to-from)*this.touchTime>relativeHitTime(bullet,player))continue;
        bullet.deactivate();game.burst(this.x,this.y,POWER_COLORS.orb,{count:3,glow:true});
      }
      for(const target of targets){
        if(!target.active||!(target.hp>0)||(target.age!==undefined&&target.age<.7)||!this.touches(target,from,to)){this.contacts.delete(target);continue;}
        let contact=this.contacts.get(target);
        if(!contact||contact.generation!==target.generation){contact={generation:target.generation,elapsed:0};this.contacts.set(target,contact);game.damageTarget(target,1,POWER_COLORS.orb);}
        else{
          contact.elapsed+=stepTime;
          const damage=Math.floor((contact.elapsed+1e-9)/ORB_CONFIG.damageInterval);
          if(damage){contact.elapsed-=damage*ORB_CONFIG.damageInterval;game.damageTarget(target,damage,POWER_COLORS.orb);}
        }
        if(!target.active||contact.generation!==target.generation)this.contacts.delete(target);
      }
    }
    this.angle=(startAngle+ORB_CONFIG.angularSpeed*dt)%(Math.PI*2);
    this.mesh.position.set(this.x,this.y,.3);this.mesh.scale.set(this.radius/.6,this.radius/.6,this.radius/.6);
  }
}

class Rock {
  constructor(scene){this.mesh=new THREE.Mesh(geometry.orb,material.rock);scene.add(this.mesh);this.deactivate();}
  activate(x,y,size='large',vx=-2.5,vy=0){this.generation=(this.generation??0)+1;Object.assign(this,{x,y,size,vx,vy,active:true,hp:size==='large'?16:8,radius:size==='large'?1.5:.85});this.mesh.scale.set(this.radius/.6,this.radius/.6,this.radius/.6);this.mesh.rotation.set(Math.random(),Math.random(),Math.random());this.mesh.position.set(x,y,0);this.mesh.visible=true;}
  deactivate(){this.active=false;this.mesh.visible=false;}
  update(dt){this.x+=this.vx*dt;this.y+=this.vy*dt;this.mesh.position.set(this.x,this.y,0);this.mesh.rotation.x+=dt*.3;this.mesh.rotation.y+=dt*.2;if(this.x<-19||Math.abs(this.y)>12)this.deactivate();}
}

class Enemy {
  constructor(scene,type){this.type=type;this.mesh=new THREE.Group();part(this.mesh,geometry.orb,material.enemy[type],0,0,0,1.3,1,1);part(this.mesh,geometry.box,material.enemy[type],.1,0,0,.5,1.8,.3);part(this.mesh,geometry.orb,material.glow,-.45,0,.4,.3,.3,.3);scene.add(this.mesh);this.radius=.65;this.deactivate();}
  activate(y,time,difficulty){this.generation=(this.generation??0)+1;this.active=true;this.x=18;this.y=y;this.baseY=y;this.age=0;this.phase=time;this.avoidVelocity=0;this.avoidTarget=y;this.hp=this.type===2?3:2;this.speed=4+this.type*.5+difficulty;this.cooldown=1.1+Math.random()*.7;this.mesh.visible=true;this.mesh.position.set(this.x,this.y,-3);}
  deactivate(){this.active=false;this.mesh.visible=false;}
  avoidTerrain(dt,game){
    const here=game.terrain.safeGap(this.x,this.radius+.15),ahead=game.terrain.safeGap(this.x-3,this.radius+.15);
    const bottom=Math.max(here.bottom,ahead.bottom),top=Math.min(here.top,ahead.top);
    const desired=this.type===2?game.player.y:this.baseY+(this.type===1?Math.sin(this.age*3+this.phase)*1.7:Math.sin(this.age*.9+this.phase)*.4);
    const target=bottom<=top?clamp(desired,bottom,top):(here.bottom+here.top)/2;
    this.avoidTarget+=(target-this.avoidTarget)*(1-Math.exp(-dt*3));
    const velocity=clamp((this.avoidTarget-this.y)*3,-4,4);this.avoidVelocity+=clamp(velocity-this.avoidVelocity,-9*dt,9*dt);this.y+=this.avoidVelocity*dt;
    // Only emergency contact correction; ordinary steering never snaps position.
    if(this.y<here.bottom||this.y>here.top){this.y=clamp(this.y,here.bottom,here.top);this.avoidVelocity=0;}
  }
  update(dt,game){this.age+=dt;this.x-=this.speed*dt;if(game.stage===2&&game.terrain?.active){this.avoidTerrain(dt,game);}else if(this.type===1)this.y=clamp(this.baseY+Math.sin(this.age*3+this.phase)*1.7,-7,7);if(this.type===2&&game.stage!==2)this.y+=clamp(game.player.y-this.y,-1,1)*dt*1.8;this.mesh.position.set(this.x,this.y,-3*Math.max(0,1-this.age/.7));this.mesh.rotation.x+=dt*.8;this.mesh.rotation.y=Math.sin(this.age*2)*.35;this.cooldown-=dt;if(this.type===2&&this.cooldown<=0&&this.x<15){let dx=game.player.x-this.x,dy=game.player.y-this.y;const length=Math.max(.01,Math.hypot(dx,dy));game.shoot(this.x-.5,this.y,dx/length*8,dy/length*8,true);this.cooldown=1.8;}if(this.x<-18)this.deactivate();}
}

class UnpoCrystal extends Bullet {
  constructor(scene,model,owner){
    super(scene,true);scene.remove(this.mesh);
    this.mesh=new THREE.Group();this.mesh.add(model);scene.add(this.mesh);
    this.scene=scene;this.owner=owner;this.isCrystal=true;
    this.materials=[];this.modelMeshes=[];
    model.traverse(obj=>{if(obj.isMesh){this.modelMeshes.push(obj);const source=Array.isArray(obj.material)?obj.material:[obj.material];const copies=source.map(mat=>{const copy=mat.clone();copy.transparent=true;copy.userData={...copy.userData,crystalOpacity:mat.opacity};this.materials.push(copy);return copy;});obj.material=Array.isArray(obj.material)?copies:copies[0];}});
    // Sample actual model vertices once; sparkles follow the surface as it rotates.
    this.surfacePoints=[];this.sparkPosition=new THREE.Vector3();this.surfaceSparkTimer=0;
    this.mesh.updateWorldMatrix(true,true);
    model.traverse(obj=>{if(!obj.isMesh)return;const positions=obj.geometry.getAttribute('position');const stride=Math.max(1,Math.ceil(positions.count/96));for(let i=0;i<positions.count;i+=stride){const point=new THREE.Vector3().fromBufferAttribute(positions,i);obj.localToWorld(point);this.mesh.worldToLocal(point);this.surfacePoints.push(point);}});
    this.deactivate('reset');
  }
  opacity(value){for(const mat of this.materials){mat.opacity=value*(mat.userData?.crystalOpacity??1);mat.depthWrite=mat.opacity>=1;}}
  foreground(held){
    // Head ornaments must remain visible over the opaque body during its Y-axis sway.
    // Restore normal depth testing when launched into the shared playfield.
    this.mesh.renderOrder=held?10:0;
    for(const mesh of this.modelMeshes??[])mesh.renderOrder=held?10:0;
    for(const mat of this.materials)mat.depthTest=!held;
  }
  sparkle(dt,game,visibility=1){
    if(!this.surfacePoints?.length||visibility<=.05)return;
    this.surfaceSparkTimer-=dt;if(this.surfaceSparkTimer>0)return;
    this.surfaceSparkTimer=UNPO_CONFIG.crystalSparkleInterval??.22;
    this.mesh.updateWorldMatrix(true,false);
    this.sparkPosition.copy(this.surfacePoints[Math.floor(Math.random()*this.surfacePoints.length)]);this.mesh.localToWorld(this.sparkPosition);
    if(this.sparkPosition.z<0)return; // Camera is on +Z: favor the visible surface.
    game.burst(this.sparkPosition.x,this.sparkPosition.y,UNPO_CONFIG.crystalSparkleColor??0xc79965,{count:1,life:.12,speed:.12,size:.035,growth:3,glow:true,z:this.sparkPosition.z+.025,opacity:visibility});
  }
  attach(){this.generation=(this.generation??0)+1;this.owner.socket.add(this.mesh);this.foreground(true);this.mesh.position.set(0,0,0);this.mesh.rotation.set(0,0,0);this.hp=UNPO_CONFIG.crystalHp;this.radius=UNPO_CONFIG.crystalRadius;this.age=1;this.mesh.visible=true;this.syncHeld();}
  syncHeld(){this.x=this.owner.x+(this.owner.socket?.position?.x??0);this.y=this.owner.y+(this.owner.socket?.position?.y??UNPO_CONFIG.socketY);}
  hold(){this.attach();this.phase='held';this.active=true;this.opacity(1);}
  fire(player,ui,options={}){
    if(this.phase!=='held')return;
    this.owner.mesh.updateMatrixWorld(true);this.scene.attach(this.mesh);
    this.foreground(false);
    this.mesh.rotation.set(0,0,0);
    this.syncHeld();this.mesh.position.set(this.x,this.y,0);
    this.heading=options.heading??Math.atan2(player.y-this.y,player.x-this.x);
    this.speed=options.speed??UNPO_CONFIG.projectileSpeed;
    this.homingDuration=options.homingDuration??UNPO_CONFIG.homingDuration;
    this.separationX=this.separationY=0;
    this.bulletRollAge=0;
    this.flightAge=0;this.phase='flying';this.updateVelocity();
    if(!options.silent)ui.say(UNPO_CONFIG.lines[Math.floor(Math.random()*UNPO_CONFIG.lines.length)]);
  }
  updateVelocity(){const speed=this.speed??UNPO_CONFIG.projectileSpeed;this.vx=Math.cos(this.heading)*speed;this.vy=Math.sin(this.heading)*speed;}
  deactivate(reason='destroyed',game){
    if(game&&(this.phase==='held'||this.phase==='flying')&&reason!=='reset'){
      // Capture the disappearance position before attach() moves it back to the socket.
      if(this.phase==='held')this.syncHeld();
      game.burst(this.x,this.y,UNPO_CONFIG.crystalParticleColor??0x8a4f25,{count:18,life:.65,speed:5,size:.16,drag:2,priority:true});
    }
    this.active=false;if(this.mesh)this.mesh.visible=false;
    if(!this.volleyCopy&&this.owner?.active&&reason!=='reset'&&reason!=='owner-dead'){
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
    // Integrate a fading turn rate: radius grows smoothly to infinity at pursuit end.
    const duration=this.homingDuration??UNPO_CONFIG.homingDuration;
    const steeringDt=Math.min(dt,Math.max(0,duration-this.flightAge));
    if(steeringDt>0){
      const power=UNPO_CONFIG.homingEasePower??2;
      const remaining=clamp(1-this.flightAge/duration,0,1),next=clamp(1-(this.flightAge+steeringDt)/duration,0,1);
      const turn=UNPO_CONFIG.homingTurnRate*duration/(power+1)*(remaining**(power+1)-next**(power+1));
      const dx=game.player.x-this.x,dy=game.player.y-this.y,distance=Math.hypot(dx,dy)||1;
      const desired=Math.atan2(dy/distance+(this.separationY??0),dx/distance+(this.separationX??0)),delta=Math.atan2(Math.sin(desired-this.heading),Math.cos(desired-this.heading));
      this.heading+=clamp(delta,-turn,turn);this.updateVelocity();
    }
    this.flightAge+=dt;this.x+=this.vx*dt;this.y+=this.vy*dt;
    const spinRate=Number.isFinite(UNPO_CONFIG.projectileSpinRate)?UNPO_CONFIG.projectileSpinRate:Math.PI*.5;
    this.mesh.rotation.y=(this.flightAge*spinRate)%(Math.PI*2);
    this.mesh.position.set(this.x,this.y,0); // Keep the crystal upright while its velocity changes.
    this.sparkle(dt,game);
    if(Math.abs(this.x)>19||Math.abs(this.y)>11){this.deactivate('offscreen',game);return;}
    this.bulletRollAge=(this.bulletRollAge??0)+dt;
    while(this.bulletRollAge+1e-9>=UNPO_CONFIG.bulletRollInterval){
      this.bulletRollAge-=UNPO_CONFIG.bulletRollInterval;
      if(Math.random()<UNPO_CONFIG.bulletFireChance){
        const dx=game.player.x-this.x,dy=game.player.y-this.y,length=Math.hypot(dx,dy)||1;
        game.shoot?.(this.x,this.y,dx/length*UNPO_CONFIG.bulletSpeed,dy/length*UNPO_CONFIG.bulletSpeed,true,1,{brown:true});
      }
    }
  }
}

class UnpoEnemy extends Enemy {
  constructor(scene,body,crystal){super(scene,0);this.mesh.clear();this.mesh.add(body);this.visual=body;this.isUnpo=true;this.scoreValue=UNPO_CONFIG.score;this.name=UNPO_CONFIG.name;
    this.socket=new THREE.Group();this.socket.name='UnpoSocket';this.socket.position.set(0,UNPO_CONFIG.socketY,0);this.mesh.add(this.socket);
    this.crystal=new UnpoCrystal(scene,crystal,this);
    // Pooled copies split off at launch; only the original regenerates on the head.
    this.crystals=[this.crystal,...Array.from({length:UNPO_CONFIG.rageShotCount-1},()=>{
      const copy=new UnpoCrystal(scene,crystal.clone(true),this);copy.volleyCopy=true;return copy;
    })];
  }
  activate(y=0){this.generation=(this.generation??0)+1;this.active=true;this.hp=UNPO_CONFIG.maxHp;this.radius=UNPO_CONFIG.bodyRadius;this.x=14;this.y=y;this.baseY=y;this.age=1;this.attackTimer=UNPO_CONFIG.attackInterval;this.mesh.visible=true;this.mesh.position.set(this.x,this.y,0);for(const copy of this.crystals??[])if(copy!==this.crystal)copy.deactivate('reset');this.crystal.hold();}
  deactivate(game){super.deactivate();for(const crystal of this.crystals??[this.crystal])crystal?.deactivate('owner-dead',game);}
  attack(game){
    if(this.hp>UNPO_CONFIG.rageHp){this.crystal.fire(game.player,game.ui);}
    else{
      const speed=UNPO_CONFIG.projectileSpeed*UNPO_CONFIG.rageSpeedMultiplier;
      const homingDuration=UNPO_CONFIG.homingDuration*UNPO_CONFIG.rageHomingMultiplier;
      const angleStep=UNPO_CONFIG.rageSpreadAngle*2/(this.crystals.length-1);
      this.crystals.forEach((crystal,i)=>{
        if(crystal!==this.crystal)crystal.hold();
        const offset=i===0?0:Math.ceil(i/2)*angleStep*(i%2?-1:1);
        const heading=Math.PI+offset;
        crystal.fire(game.player,game.ui,{heading,speed,homingDuration,silent:i!==0});
      });
    }
    game.audio?.effect('missile',1,this.x);
  }
  update(dt,game){this.age+=dt;this.x=Math.max(9,this.x-dt*1.5);this.y=clamp(this.baseY+Math.sin(this.age*.8)*1.5,-4.5,4.5);this.mesh.position.set(this.x,this.y,0);
    this.visual.rotation.y=Math.sin(this.age*Math.PI*2/UNPO_CONFIG.bodySwayPeriod)*UNPO_CONFIG.bodySwayAmplitude;
    if(this.crystal.phase==='held'){
      this.attackTimer-=dt;
      const copiesReady=(this.crystals??[]).every(crystal=>crystal===this.crystal||!crystal.active);
      if(this.attackTimer<=0&&copiesReady)this.attack(game);
    }
  }
}

class Turret extends Enemy {
  constructor(scene){
    super(scene,0);this.mesh.clear();this.isTurret=true;this.scoreValue=200;
    part(this.mesh,geometry.box,material.structure,0,0,0,1.05,.7,.7);
    part(this.mesh,geometry.orb,material.hull,0,.12,.15,.65,.65,.65);
    this.barrel=new THREE.Group();part(this.barrel,geometry.box,material.wing,.4,0,0,.7,.16,.16);part(this.barrel,geometry.orb,material.enemyBullet,.76,0,0,.12,.12,.12);this.mesh.add(this.barrel);
  }
  activateAt(x,y,side='bottom',mapX=null){this.generation=(this.generation??0)+1;Object.assign(this,{x,y,side,mapX,active:true,hp:STAGE_CONFIG.turretHp,radius:.5,age:1,cooldown:1});this.mesh.visible=true;this.mesh.position.set(x,y,0);}
  update(dt,game){
    if(this.carrier){if(!this.carrier.active){this.deactivate();return;}this.x=this.carrier.x+this.mountX;this.y=this.carrier.y+this.mountY;}
    else this.x=this.mapX-game.stageScroll;
    this.age+=dt;this.mesh.position.set(this.x,this.y,0);this.barrel.rotation.z=Math.atan2(game.player.y-this.y,game.player.x-this.x);
    if(this.x<-19){this.deactivate();return;}
    if(game.transition)return;
    this.cooldown-=dt;
    if(this.cooldown<=0&&this.x<16&&this.x>-16){game.fireTurretMissile(this.x,this.y,this.side);this.cooldown=STAGE_CONFIG.turretInterval;}
  }
}

class BattleshipEnemy extends UnpoEnemy {
  constructor(scene,body,crystal){
    super(scene,body,crystal);this.isStage2Boss=true;this.maxHp=STAGE_CONFIG.shipHp;this.scoreValue=5000;
    this.ship=createBattleship();this.mesh.add(this.ship);
    const owner=this;this.armour={isArmour:true,owner,get active(){return owner.active;},get x(){return owner.x;},get y(){return owner.y;}};
    this.chargeGlow=new THREE.Mesh(geometry.orb,new THREE.MeshBasicMaterial({color:0xffbe65,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending}));this.chargeGlow.position.set(-6.9,-2.2,1.5);this.mesh.add(this.chargeGlow);
    this.deckTurrets=[-3.4,3.4].map(mountX=>{const turret=new Turret(scene);Object.assign(turret,{carrier:this,mountX,mountY:-.8});return turret;});
  }
  activate(y=0){super.activate(y);this.hp=this.maxHp;this.x=18;this.baseY=0;this.waveTimer=3;this.waveCharge=0;this.waveFlash=0;this.chargeSparkTimer=0;this.waveAim=0;for(const turret of this.deckTurrets)turret.activateAt(this.x+turret.mountX,this.y+turret.mountY);}
  deactivate(game){super.deactivate(game);for(const turret of this.deckTurrets??[])turret.deactivate();}
  update(dt,game){
    super.update(dt,game);
    this.waveFlash=Math.max(0,(this.waveFlash??0)-dt);
    if(!game.transition){
      this.waveTimer-=dt;
      if(this.waveTimer<=0){
        this.waveCharge+=dt;const progress=Math.min(1,this.waveCharge/STAGE_CONFIG.shipChargeTime);
        if(this.waveCharge-dt<1&&this.waveCharge>=1)this.waveAim=this.y;
        if(this.waveCharge>=1){this.y=this.waveAim;this.mesh.position.y=this.y;}
        this.chargeGlow.material.opacity=progress*.8;this.chargeGlow.scale.setScalar(.15+progress*.65);
        this.chargeSparkTimer-=dt;if(this.chargeSparkTimer<=0){game.gatherParticles(this.x-6.9,this.y-2.2,progress);this.chargeSparkTimer=.06;}
        if(progress>=1){game.fireBossWave(this.x-7,this.y-2.2);this.waveCharge=0;this.waveFlash=1.2;this.waveTimer=STAGE_CONFIG.shipWaveInterval;this.chargeGlow.material.opacity=0;}
      }
    }
    for(const flame of this.ship.userData.flames){const pulse=1+Math.sin(this.age*25)*.12;flame.scale.set(1,pulse,1);}
  }
}

class Game {
  constructor(model,unpoModels){
    this.ui=new UI();this.input=new Input();this.audio=new Sound();this.state='ready';this.elapsed=0;this.score=0;this.stage=1;this.stageScroll=0;this.transition=null;this.fadeAmount=0;this.transitionShield=false;
    this.mobile=new MobileDisplay({onBlocked:()=>{this.input.clear();this.ui.charge(0);this.audio.pause();},onReady:()=>{this.input.clear();if(this.state==='playing')this.audio.start(false);this.last=performance.now();}});
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color(0x070d1c);this.scene.fog=new THREE.Fog(0x070d1c,35,85);
    this.camera=new THREE.OrthographicCamera(-16,16,9,-9,.1,120);this.camera.position.set(0,0,40);this.camera.lookAt(0,0,0);
    this.renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));this.renderer.outputColorSpace=THREE.SRGBColorSpace;document.querySelector('#game').prepend(this.renderer.domElement);
    this.waveTrail=new WaveTrail(document.querySelector('#game'));
    this.scene.add(new THREE.HemisphereLight(0xaadfff,0x263053,2));const light=new THREE.DirectionalLight(0xffffff,2.5);light.position.set(-3,8,12);this.scene.add(light);
    this.player=new Player(this.scene,model);this.bullets=Array.from({length:96},()=>new Bullet(this.scene,false));this.enemyBullets=Array.from({length:64},()=>new Bullet(this.scene,true));this.enemies=Array.from({length:24},(_,i)=>new Enemy(this.scene,i%3));
    this.orb=new OrbitOrb(this.scene);this.fogs=Array.from({length:12},()=>new YellowFog(this.scene));
    this.rocks=Array.from({length:32},()=>new Rock(this.scene));
    this.items=Array.from({length:12},()=>new PowerItem(this.scene));this.missiles=Array.from({length:12},()=>new Missile(this.scene,false));
    this.pods=Array.from({length:2},()=>{const mesh=new THREE.Group();const nose=part(mesh,geometry.cone,material.wing,0,0,0,.4,.5,.4);nose.rotation.z=-Math.PI/2;part(mesh,geometry.orb,material.glow,-.25,0,0,.3,.3,.3);this.scene.add(mesh);mesh.visible=false;return {mesh,active:false,x:0,y:0};});
    const unpo=new UnpoEnemy(this.scene,unpoModels.body,unpoModels.crystal);this.enemies.push(unpo);this.crystals=[...unpo.crystals];
    this.terrain=new Terrain(this.scene);
    this.turrets=STAGE2_DATA.turrets.map(()=>new Turret(this.scene));this.enemies.push(...this.turrets);
    this.battleship=new BattleshipEnemy(this.scene,unpoModels.body.clone(true),unpoModels.crystal.clone(true));this.enemies.push(this.battleship,...this.battleship.deckTurrets);this.crystals.push(...this.battleship.crystals);
    this.enemyMissiles=Array.from({length:16},()=>new Missile(this.scene,true));this.bossWaves=Array.from({length:4},()=>new BossWave(this.scene,true));this.enemyShots=this.enemyBullets.concat(this.enemyMissiles,this.bossWaves);
    this.fadeScene=new THREE.Scene();this.fadeCamera=new THREE.OrthographicCamera(-1,1,1,-1,.1,10);this.fadeCamera.position.z=1;
    this.fadeMaterial=new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:0,depthTest:false,depthWrite:false});this.fadeScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.fadeMaterial));
    this.renderer.autoClear=false;
    for(const group of [this.player.mesh,this.orb.mesh,...this.pods.map(pod=>pod.mesh)])group.traverse(node=>node.layers.set(1));
    for(const node of this.scene.children)if(node.isLight)node.layers.enable(1);
    this.makeBackground();this.makeEffects();this.resize();addEventListener('resize',()=>this.resize());
    this.ui.start.onclick=()=>{if(this.state==='paused')this.resume();else this.start();};this.ui.pause.onclick=()=>this.togglePause();this.ui.continueButton.onclick=()=>this.continueGame();
    addEventListener('keydown',e=>this.menuKey(e));
    addEventListener('blur',()=>{if(this.state==='playing')this.togglePause();else this.audio.pause();});document.addEventListener('visibilitychange',()=>{if(document.hidden){if(this.state==='playing')this.togglePause();else this.audio.pause();}});
    this.ui.update(5,0);this.last=performance.now();this.frame=this.frame.bind(this);requestAnimationFrame(this.frame);
  }
  menuKey(e){if(e.repeat)return;if(e.code==='KeyS'&&['ready','over','complete'].includes(this.state)){e.preventDefault();this.ui.start.onclick();}else if(e.code==='KeyC'&&this.state==='over'){e.preventDefault();this.continueGame();}else if(e.code==='KeyP'||e.code==='Escape')this.togglePause();}
  continueGame(){
    if(this.state!=='over')return;
    this.score=0;this.player.hp=PLAYER_MAX_HP;this.player.invulnerable=2;this.player.mesh.visible=true;this.player.cooldown=0;this.player.missileCooldown=0;
    this.input.clear();this.input.chargeMultiplier=this.player.quick?1.5:1;
    for(const bullet of this.enemyShots??this.enemyBullets)bullet.deactivate();
    for(const fog of this.fogs??[])fog.deactivate();
    if(this.player.hasOrb)this.orb?.equip();this.updatePods?.();this.terrain?.resolvePlayer(this.player);
    this.state='playing';this.ui.update(this.player.hp,0);this.ui.hide();this.ui.charge(0);this.ui.pause.textContent='Ⅱ';this.last=performance.now();this.audio?.start(false);void this.mobile?.enter();
  }
  emitFog(x,y){const fog=this.fogs?.find(f=>!f.active);if(fog)fog.activate(x,y);}
  resize(){const w=innerWidth,h=innerHeight,aspect=w/h; // Fit the entire gameplay rectangle, including portrait screens.
    const width=Math.max(WORLD.width,WORLD.height*aspect),height=width/aspect;
    Object.assign(this.camera,{left:-width/2,right:width/2,top:height/2,bottom:-height/2});this.camera.updateProjectionMatrix();this.renderer.setSize(w,h);this.waveTrail.resize(w,h);}
  makeBackground(){this.scenery=new Scenery(this.scene,this.terrain.walls);}
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
  shootMissile(x,y,heading=0,side=0){
    const missile=this.missiles?.find(b=>!b.active);if(!missile)return;
    const targets=[...this.enemies,...this.rocks,...(this.crystals??[])].filter(t=>t.active&&t.x>=this.camera.left&&t.x<=this.camera.right&&t.y>=this.camera.bottom&&t.y<=this.camera.top);
    const half=side?targets.filter(t=>side*(t.y-this.player.y)>0):targets;
    let nearest=null,distance=Infinity;
    for(const target of half.length?half:targets){const d=(this.player.x-target.x)**2+(this.player.y-target.y)**2;if(d<distance){nearest=target;distance=d;}}
    const radius=100*(this.camera.right-this.camera.left)/Math.max(1,innerWidth);
    missile.activate(x,y,nearest,Math.max(.5,radius),heading);this.audio?.effect('missile',1,x);
  }
  separateCrystals(){
    const crystals=this.crystals??[],radius=UNPO_CONFIG.separationDistance;
    // Snapshot all pair forces before moving any crystal: ten pairs for five shots.
    for(const crystal of crystals){crystal.separationX=0;crystal.separationY=0;}
    for(let i=0;i<crystals.length;i++)for(let j=i+1;j<crystals.length;j++){
      const a=crystals[i],b=crystals[j];
      if(!a.active||!b.active||a.phase!=='flying'||b.phase!=='flying'||a.owner!==b.owner||a.flightAge>=(a.homingDuration??UNPO_CONFIG.homingDuration)||b.flightAge>=(b.homingDuration??UNPO_CONFIG.homingDuration))continue;
      let dx=a.x-b.x,dy=a.y-b.y;const distance=Math.hypot(dx,dy);
      if(distance>=radius)continue;
      // At launch the positions coincide; use the distinct launch vectors to fan out.
      if(distance<.0001){dx=a.vx-b.vx;dy=a.vy-b.vy;if(Math.hypot(dx,dy)<.0001){dx=0;dy=1;}}
      const length=Math.hypot(dx,dy),force=UNPO_CONFIG.separationStrength*(1-distance/radius)**2;
      const fx=dx/length*force,fy=dy/length*force;
      a.separationX+=fx;a.separationY+=fy;b.separationX-=fx;b.separationY-=fy;
    }
    for(const crystal of crystals){
      const length=Math.hypot(crystal.separationX,crystal.separationY);
      if(length>UNPO_CONFIG.separationStrength){const scale=UNPO_CONFIG.separationStrength/length;crystal.separationX*=scale;crystal.separationY*=scale;}
    }
  }
  spawnPowerItem(type,x=this.player.x+3,y=this.player.y){const item=this.items.find(i=>!i.active);if(item&&(POWER_UPS.includes(type)||type==='orb'))item.activate(x,y,type);return item;}
  dropOrb(crystal){if(Math.random()<UNPO_CONFIG.orbDropChance&&this.items)this.spawnPowerItem('orb',crystal.x,crystal.y);}
  updatePods(){for(let i=0;i<(this.pods??[]).length;i++){const pod=this.pods[i];pod.active=i<this.player.podCount;pod.mesh.visible=pod.active;if(pod.active){const point=this.player.history.behind((i+1)*1.3);pod.x=point.x;pod.y=point.y;pod.mesh.position.set(pod.x,pod.y,0);}}}
  dropPowerUp(rock){if(rock.size!=='large'||Math.random()>=1/3)return;const item=this.items?.find(i=>!i.active);if(item)item.activate(rock.x,rock.y,POWER_UPS[Math.floor(Math.random()*POWER_UPS.length)]);}
  spawnUnpo(x=14,y=0){const enemy=this.enemies.find(e=>e.isUnpo&&!e.isStage2Boss&&!e.active);if(!enemy)return null;enemy.activate(y);enemy.x=x;enemy.mesh.position.set(x,y,0);enemy.crystal.syncHeld();return enemy;}
  dropTurretItem(turret){if(Math.random()>=1/3)return;const item=this.items?.find(i=>!i.active);if(!item)return;const gap=this.terrain?.active?this.terrain.safeGap(turret.x,.4):{bottom:-7,top:7};item.activate(turret.x,clamp(turret.y+(turret.side==='top'?-1:1),gap.bottom,gap.top),POWER_UPS[Math.floor(Math.random()*POWER_UPS.length)]);}
  destroyRock(rock){this.dropPowerUp(rock);this.burst(rock.x,rock.y,0xd4b698);if(rock.size==='large'){const children=this.rocks.filter(r=>!r.active).slice(0,2);const speed=Math.hypot(rock.vx,rock.vy)||1;for(let i=0;i<children.length;i++){const side=i===0?-1:1;const velocity=splitVelocity(rock.vx,rock.vy,side);children[i].activate(rock.x-rock.vy/speed*side*.9,rock.y+rock.vx/speed*side*.9,'medium',velocity.vx,velocity.vy);}}rock.deactivate();this.score+=rock.size==='large'?100:50;this.ui.update(this.player.hp,this.score);}
  hitTarget(bullet,target){
    const available=bullet.energy??bullet.damage??1;
    if(target.isArmour){this.damageTarget(target.owner,Math.floor(available/2),0x8effff,'armour');this.burst(bullet.x,bullet.y,0xffb957,{count:5,glow:true});bullet.energy=0;bullet.damage=0;bullet.deactivate();return;}
    const spent=this.damageTarget(target,available,bullet.green?0x7dff8c:0x8effff);
    bullet.energy=available-spent;bullet.damage=bullet.energy;
    if(!bullet.isWave||bullet.energy<=0)bullet.deactivate();else{bullet.updateAppearance();}
  }
  damageTarget(target,damage,color=0x8effff,soundKind=null){
    if(!target.active||target.hp<=0)return 0;
    const spent=Math.min(damage,target.hp);target.hp-=spent;
    const destroyed=target.hp<=0,isEnemy=!target.isCrystal&&!this.rocks.includes(target);
    if(destroyed&&isEnemy)this.explosion(target.x,target.y,!!target.isUnpo);else if(!destroyed||!target.isCrystal)this.burst(target.x,target.y,color);
    this.audio?.effect(destroyed?(target.isUnpo?'bossExplosion':'explosion'):(soundKind??(target.isUnpo?'weakpoint':'hit')),spent,target.x);
    if(destroyed&&target.isUnpo)this.ui.say(UNPO_CONFIG.deathLine,UNPO_CONFIG.deathLineDuration);
    if(target.hp<=0){if(this.rocks.includes(target))this.destroyRock(target);else if(target.isCrystal){this.dropOrb(target);target.deactivate('destroyed',this);}else{if(target.isTurret)this.dropTurretItem(target);target.deactivate(this);this.score+=target.scoreValue??[100,150,250][target.type];this.ui.update(this.player.hp,this.score);}}
    if(destroyed&&target.isUnpo&&this.stage)this.transition={phase:'delay',time:0,nextStage:target.isStage2Boss?null:2};
    return spent;
  }
  clearWorld(){for(const entity of [...(this.fogs??[]),...this.enemies,...this.bullets,...(this.enemyShots??this.enemyBullets),...this.rocks,...(this.crystals??[]),...(this.items??[]),...(this.missiles??[])])entity.deactivate();for(const e of this.effects??[]){e.life=0;e.mesh.visible=false;}this.explosionWaves=[];}
  beginStage2(){this.clearWorld();this.stage=2;this.stageScroll=0;this.shipSpawned=false;this.spawnedTurrets=new Set();this.terrain.update(0);this.spawnTimer=1;this.setStageLabel();}
  setStageLabel(){const label=document.querySelector?.('.brand small');if(label)label.textContent=`SECTOR 0${this.stage}`;}
  gatherParticles(x,y,progress){
    this.burst(x,y,0xffb957,{count:2,life:.35,speed:0,size:.035+progress*.035,glow:true,z:1.5});
    // Reuse the freshly activated particles and their velocity update to converge on the muzzle.
    const particles=this.effects.filter(e=>e.life>0&&e.duration===e.life&&e.mesh.position.x===x&&e.mesh.position.y===y).slice(-2);
    for(const e of particles){const angle=Math.random()*Math.PI*2,distance=.7+Math.random()*1.7;e.mesh.position.x=x+Math.cos(angle)*distance;e.mesh.position.y=y+Math.sin(angle)*distance;e.vx=(x-e.mesh.position.x)/e.life;e.vy=(y-e.mesh.position.y)/e.life;}
  }
  fireBossWave(x,y){const wave=this.bossWaves.find(b=>!b.active);if(wave){wave.activate(x,y,-STAGE_CONFIG.shipWaveSpeed,0,1);this.audio?.effect('wave',16,x);this.burst(x,y,0xffcf76,{count:12,glow:true});}}
  fireTurretMissile(x,y){const missile=this.enemyMissiles.find(m=>!m.active);if(missile)missile.activate(x,y,this.player,Math.max(.5,100*(this.camera.right-this.camera.left)/Math.max(1,innerWidth)),Math.atan2(this.player.y-y,this.player.x-x));this.audio?.effect('enemy',1,x);}
  updateStage2(dt){this.stageScroll=Math.min(STAGE2_DATA.bossDistance,this.stageScroll+STAGE2_DATA.scrollSpeed*dt);this.terrain.update(this.stageScroll);STAGE2_DATA.turrets.forEach((placement,i)=>{const mapX=STAGE2_DATA.startX+placement.section*STAGE2_DATA.width+2;if(mapX-this.stageScroll>18||this.spawnedTurrets.has(i))return;const section=this.terrain.gapAt(mapX-this.stageScroll);this.turrets[i].activateAt(mapX-this.stageScroll,placement.side==='bottom'?section.bottom+.55:section.top-.55,placement.side,mapX);this.spawnedTurrets.add(i);});if(this.stageScroll>=STAGE2_DATA.bossDistance&&!this.shipSpawned){this.shipSpawned=true;this.battleship.activate();this.ui.say('巨大戦艦 接近！',3);}}
  updateTransition(dt){const t=this.transition;t.time+=dt;if(t.phase==='delay'){if(t.time<STAGE_CONFIG.clearDelay)return false;t.phase='out';t.time=0;this.transitionShield=true;this.player.invulnerable=0;this.player.mesh.visible=true;this.input.clear();this.audio?.setCharge(0);this.ui.charge(0);}
    this.ui.tick?.(dt);this.player.history?.record(this.player.x,this.player.y);this.updatePods?.();this.orb?.update(dt,this);
    this.fadeAmount=t.phase==='out'?Math.min(1,t.time/STAGE_CONFIG.fadeDuration):Math.max(0,1-t.time/STAGE_CONFIG.fadeDuration);
    if(t.time>=STAGE_CONFIG.fadeDuration){if(t.phase==='out'){if(t.nextStage===2){this.beginStage2();t.phase='in';t.time=0;}else{this.clearWorld();this.state='complete';this.audio?.finish('clear');this.input.clear();this.ui.show('MISSION CLEAR',`FINAL SCORE  ${String(this.score).padStart(6,'0')}`,'RESTART');}}else{this.transition=null;this.transitionShield=false;this.fadeAmount=0;}}
    return true;
  }
  start(){this.stage=1;this.stageScroll=0;this.transition=null;this.transitionShield=false;this.fadeAmount=0;this.terrain?.reset();this.setStageLabel();this.orb?.reset();for(const fog of this.fogs??[])fog.deactivate();this.explosionWaves=[];this.input.clear();for(const entity of [...this.enemies,...this.bullets,...(this.enemyShots??this.enemyBullets),...this.rocks,...(this.crystals??[]),...(this.items??[]),...(this.missiles??[])])entity.deactivate();for(const e of this.effects){e.life=0;e.mesh.visible=false;}this.elapsed=0;this.score=0;this.unpoTimer=UNPO_CONFIG.firstSpawnTime;this.ui.say('');this.rockTimer=3;this.ui.charge(0);this.spawnTimer=.6;this.spawnCount=0;this.player.reset();this.input.chargeMultiplier=1;if(this.pods)this.updatePods();this.state='playing';this.ui.update(5,0);this.ui.hide();this.ui.pause.textContent='Ⅱ';this.audio?.setScene?.(1,false);this.audio?.start();void this.mobile?.enter();}
  end(){this.state='over';this.orb?.reset();this.mobile?.stop();this.audio?.finish();this.ui.charge(0);this.player.mesh.visible=false;this.input.clear();this.ui.show('GAME OVER',`FINAL SCORE  ${String(this.score).padStart(6,'0')}`,'RESTART [S]');if(this.ui.continueButton)this.ui.continueButton.hidden=false;}
  togglePause(){if(this.state==='playing'){this.state='paused';this.audio?.pause();this.input.clear();this.ui.charge(0);this.ui.show('PAUSED','ひと休みして、再び宇宙へ。','RESUME');this.ui.pause.textContent='▶';}else if(this.state==='paused')this.resume();}
  resume(){this.input.clear();this.state='playing';this.ui.hide();this.ui.pause.textContent='Ⅱ';this.last=performance.now();this.audio?.start(false);void this.mobile?.enter();}
  update(dt){if(this.transition&&this.updateTransition(dt))return;if(this.stage===2)this.updateStage2(dt);this.elapsed+=dt;this.player.previousX=this.player.x;this.player.previousY=this.player.y;this.player.update(dt,this.input,this);if(this.terrain?.resolvePlayer(this.player)){this.player.damage(this);if(this.state!=='playing')return;}this.spawnTimer-=dt;if(this.spawnTimer<=0&&!this.transition&&!(this.stage===2&&this.shipSpawned)){const type=this.spawnCount++%3;const enemy=this.enemies.find(e=>!e.active&&!e.isUnpo&&!e.isTurret&&e.type===type);if(enemy){const gap=this.stage===2?this.terrain.gapAt(18):{bottom:-7,top:7};enemy.activate(gap.bottom+1+Math.random()*(gap.top-gap.bottom-2),this.elapsed,Math.min(3,this.elapsed/45));}this.spawnTimer=Math.max(.55,1.3-this.elapsed*.003);}
    for(const enemy of this.enemies)if(enemy.active){enemy.previousX=enemy.x;enemy.previousY=enemy.y;enemy.update(dt,this);}
    this.ui.tick?.(dt);this.unpoTimer-=dt;
    if(this.unpoTimer<=0&&this.stage!==2&&!this.transition){this.spawnUnpo();this.unpoTimer=UNPO_CONFIG.spawnInterval;}
    this.rockTimer-=dt;
    if(this.rockTimer<=0&&this.stage!==2&&!this.transition){const free=this.rocks.filter(r=>!r.active);const reserved=this.rocks.filter(r=>r.active&&r.size==='large').length; // Reserve slots for every future split.
      if(free.length>=reserved+3)free[0].activate(18,(Math.random()-.5)*11);this.rockTimer=5+Math.random()*2;}
    for(const rock of this.rocks)if(rock.active){rock.previousX=rock.x;rock.previousY=rock.y;rock.update(dt);}
    this.separateCrystals();
    for(const crystal of this.crystals??[]){
      crystal.previousX=crystal.x;crystal.previousY=crystal.y;
      crystal.update(dt,this);
      if(crystal.phase!=='flying')continue;
      if(Number.isFinite(this.terrain?.hitTime(crystal)??Infinity)||this.rocks.some(rock=>rock.active&&Number.isFinite(hitTime(crystal,rock))))crystal.deactivate('terrain',this);
      else if(Number.isFinite(hitTime(crystal,this.player))){crystal.deactivate('player',this);this.player.damage(this);if(this.state!=='playing')return;}
    }
    for(const item of this.items??[]){if(!item.active)continue;item.update(dt);if(item.active&&overlap(item,this.player)){item.deactivate();this.player.pickup(item.type,this);this.burst(item.x,item.y,POWER_COLORS[item.type]);}}
    for(const bullet of this.enemyShots??this.enemyBullets)if(bullet.active){bullet.update(dt);if(Number.isFinite(this.terrain?.hitTime(bullet)??Infinity))bullet.deactivate();}
    this.orb?.update(dt,this);
    for(const fog of this.fogs??[])if(fog.active)fog.update(dt,this);
    for(const bullet of [...this.bullets,...(this.missiles??[])]){
      if(!bullet.active)continue;
      bullet.update(dt);
      if(!bullet.active)continue;
      // Sort enemies and rocks together by the first contact along this frame's flight.
      const contacts=[...this.rocks,...this.enemies,...(this.crystals??[]),...(this.battleship?.active?[this.battleship.armour]:[])].filter(target=>target.active&&(target.age===undefined||target.age>=.7))
        .map(target=>({target,time:hitTime(bullet,target)}));
      contacts.push({terrain:true,time:this.terrain?.hitTime(bullet)??Infinity});
      for(const target of this.enemyShots??this.enemyBullets)if(target.active&&!target.isBossWave&&(bullet.isWave||target.isEnemyMissile)){const time=relativeHitTime(bullet,target);if(time<=relativeHitTime(target,this.player))contacts.push({target,time,projectile:true});}
      const ordered=contacts.filter(hit=>Number.isFinite(hit.time)).sort((a,b)=>a.time-b.time);
      for(const {target,projectile,terrain} of ordered){
        if(!bullet.active)break;
        if(terrain){bullet.deactivate();break;}
        if(!target.active)continue;
        if(projectile){
          if(!Number.isFinite(relativeHitTime(bullet,target)))continue;
          target.deactivate();bullet.energy--;bullet.damage=bullet.energy;
          this.burst(target.x,target.y,bullet.green?0x7dff8c:0x8effff,{count:3,glow:true});
          if(!bullet.isWave||bullet.energy<=0)bullet.deactivate();else bullet.updateAppearance();
        }else if(Number.isFinite(hitTime(bullet,target)))this.hitTarget(bullet,target);
      }
    }
    for(const bullet of this.enemyShots??this.enemyBullets){if(!bullet.active)continue;if(Number.isFinite(relativeHitTime(bullet,this.player))){bullet.deactivate();this.player.damage(this);if(this.state!=='playing')return;}}
    for(const enemy of this.enemies)if(enemy.active&&enemy.age>=.7&&overlap(enemy,this.player)){if(!enemy.isUnpo&&!enemy.isTurret){this.explosion(enemy.x,enemy.y);this.audio?.effect('explosion',1,enemy.x);enemy.deactivate();}this.player.damage(this);if(this.state!=='playing')return;}
    if(this.battleship?.active&&Number.isFinite(hitTime(this.player,this.battleship.armour))){this.player.damage(this);if(this.state!=='playing')return;}
    for(const rock of this.rocks)if(rock.active&&overlap(rock,this.player)){this.player.damage(this);if(this.state!=='playing')return;}
  }
  animateBackground(dt){this.scenery?.update(dt,this.stage,this.stageScroll);}
  renderScene(){this.renderer.clear();this.camera.layers.set(0);this.renderer.render(this.scene,this.camera);if(this.fadeAmount>0){this.fadeMaterial.opacity=this.fadeAmount;this.renderer.render(this.fadeScene,this.fadeCamera);}this.renderer.clearDepth();this.camera.layers.set(1);const background=this.scene.background;this.scene.background=null;this.renderer.render(this.scene,this.camera);this.scene.background=background;this.camera.layers.set(0);}
  frame(now){const dt=Math.min((now-this.last)/1000,.04);this.last=now;this.audio?.setScene(this.stage,this.enemies.some(enemy=>enemy.isUnpo&&enemy.active));this.audio?.tick();if(this.state==='playing'&&!this.mobile?.blocked)this.update(dt);if(this.state!=='paused'&&!this.mobile?.blocked){this.animateBackground(dt);this.updateEffects(dt);}this.renderScene();this.waveTrail.canvas.style.opacity=String(1-this.fadeAmount);this.waveTrail.render(this.bullets,this.camera);this.ui.fadeAmount=this.fadeAmount;this.ui.enemyHealth(this.enemies,this.camera);this.ui.equipment(this.player,this.debugInvincible);requestAnimationFrame(this.frame);}
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
game.debugInvincible=debugFlags.has('debugInvincible');
if(debugFlags.has('debugUnpo')||debugFlags.has('debugItems')||debugFlags.has('debugOrb')||debugFlags.has('debugStage2')||debugFlags.has('debugBattleship')||debugFlags.has('debugTransition')){game.ui.start.onclick=()=>{if(game.state==='paused')game.resume();else{game.start();if(debugFlags.has('debugTransition')){const boss=game.spawnUnpo(9,0);boss.hp=1;boss.baseY=-1;}if(debugFlags.has('debugStage2')||debugFlags.has('debugBattleship'))game.beginStage2();if(debugFlags.has('debugBattleship')){game.stageScroll=STAGE2_DATA.bossDistance;game.updateStage2(0);game.battleship.x=9;if(debugFlags.has('debugWave')){game.battleship.waveTimer=0;game.battleship.waveCharge=1.75;}}if(debugFlags.has('debugUnpo')){const boss=game.spawnUnpo(10,0);if(boss&&debugFlags.has('debugRage'))boss.hp=UNPO_CONFIG.rageHp;}if(debugFlags.has('debugItems'))POWER_UPS.forEach((type,i)=>game.spawnPowerItem(type,-7+i*2,0));if(debugFlags.has('debugOrb'))game.player.pickup('orb',game);}};}
