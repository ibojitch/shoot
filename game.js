import * as THREE from 'three';
import { loadIbojitchPlayer } from './playerModel.js';
import { WaveTrail } from './waveTrail.js';
import { loadModel, fitModel } from './modelLoader.js';
import { UNPO_CONFIG } from './unpoConfig.js';

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const overlap = (a, b) => (a.x-b.x)**2 + (a.y-b.y)**2 < (a.radius+b.radius)**2;
const WORLD = { width: 32, height: 18 };
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
};
function part(group, geo, mat, x=0,y=0,z=0,sx=1,sy=1,sz=1) {
  const mesh=new THREE.Mesh(geo,mat); mesh.position.set(x,y,z); mesh.scale.set(sx,sy,sz); group.add(mesh); return mesh;
}

class Input {
  constructor() {
    this.keys=new Set(); this.stick={x:0,y:0}; this.firePointers=new Set(); this.stickPointer=null;
    this.shotRequests=[];this.shotStartedAt=null;
    this.pad=document.querySelector('#stick'); this.knob=document.querySelector('#knob'); this.fireButton=document.querySelector('#fire');
    addEventListener('keydown',e=>{if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();const before=this.firing;this.keys.add(e.code);this.shotChanged(before);});
    addEventListener('keyup',e=>{const before=this.firing;this.keys.delete(e.code);this.shotChanged(before);});
    addEventListener('blur',()=>this.clear());
    this.pad.addEventListener('pointerdown',e=>{if(this.stickPointer!==null)return;this.stickPointer=e.pointerId;this.pad.setPointerCapture(e.pointerId);this.moveStick(e);});
    this.pad.addEventListener('pointermove',e=>{if(e.pointerId===this.stickPointer)this.moveStick(e);});
    for(const event of ['pointerup','pointercancel','lostpointercapture'])this.pad.addEventListener(event,e=>{if(e.pointerId===this.stickPointer){this.stickPointer=null;this.stick.x=this.stick.y=0;this.knob.style.transform='';}});
    this.fireButton.addEventListener('pointerdown',e=>{const before=this.firing;this.fireButton.setPointerCapture(e.pointerId);this.firePointers.add(e.pointerId);this.shotChanged(before);this.fireButton.classList.add('active');});
    for(const event of ['pointerup','pointercancel','lostpointercapture'])this.fireButton.addEventListener(event,e=>{const before=this.firing;this.firePointers.delete(e.pointerId);this.shotChanged(before,event!=='pointerup');this.fireButton.classList.toggle('active',this.firePointers.size>0);});
  }
  moveStick(e){const rect=this.pad.getBoundingClientRect();let x=e.clientX-rect.left-rect.width/2,y=e.clientY-rect.top-rect.height/2;const limit=rect.width*.32,length=Math.hypot(x,y);if(length>limit){x*=limit/length;y*=limit/length;}this.stick.x=x/limit;this.stick.y=-y/limit;this.knob.style.transform=`translate(${x}px,${y}px)`;}
  shotChanged(before,cancel=false){if(!before&&this.firing){this.shotStartedAt=performance.now();this.shotRequests.push(1);}else if(before&&!this.firing){const ms=this.chargeMs;if(!cancel&&ms>=200)this.shotRequests.push(chargeDamage(ms));this.shotStartedAt=null;}}
  get chargeMs(){return this.shotStartedAt===null?0:clamp(performance.now()-this.shotStartedAt,0,1500);}
  clear(){this.keys.clear();this.stick.x=this.stick.y=0;this.stickPointer=null;this.firePointers.clear();this.shotStartedAt=null;this.shotRequests.length=0;this.knob.style.transform='';this.fireButton.classList.remove('active');}
  get movement(){let x=Number(this.keys.has('KeyD')||this.keys.has('ArrowRight'))-Number(this.keys.has('KeyA')||this.keys.has('ArrowLeft'))+this.stick.x;let y=Number(this.keys.has('KeyW')||this.keys.has('ArrowUp'))-Number(this.keys.has('KeyS')||this.keys.has('ArrowDown'))+this.stick.y;const length=Math.max(1,Math.hypot(x,y));return {x:x/length,y:y/length};}
  get firing(){return this.keys.has('Space')||this.firePointers.size>0;}
}

class UI {
  constructor(){this.hp=document.querySelector('#hp');this.score=document.querySelector('#score');this.overlay=document.querySelector('#overlay');this.title=document.querySelector('#title');this.message=document.querySelector('#message');this.start=document.querySelector('#start');this.pause=document.querySelector('#pause');}
  update(hp,score){this.hp.textContent='● '.repeat(hp)+'○ '.repeat(5-hp);this.score.textContent=String(score).padStart(6,'0');}
  show(title,message,button){this.title.textContent=title;this.message.textContent=message;this.start.textContent=button;this.overlay.hidden=false;}
  hide(){this.overlay.hidden=true;}
  charge(ms){const gauge=document.querySelector('#charge');gauge.value=ms;document.querySelector('#charge-power').textContent=ms>=1500?'MAX ×16':ms>=200?`×${chargeDamage(ms)}`:'CHARGE';}
  say(text){document.querySelector('#dialogue').textContent=text;this.dialogueTime=2;}
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
  reset(){this.x=-10;this.y=0;this.hp=5;this.invulnerable=0;this.cooldown=0;this.mesh.visible=true;this.mesh.position.set(this.x,this.y,0);}
  update(dt,input,game){const movement=input.movement;this.x=clamp(this.x+movement.x*10*dt,-15,14.5);this.y=clamp(this.y+movement.y*10*dt,-7.5,7.5);this.invulnerable=Math.max(0,this.invulnerable-dt);while(input.shotRequests.length){const power=input.shotRequests.shift();game.shoot(this.x+1,this.y,power>1?30:24,0,false,power);if(power>1)game.burst(this.x+1,this.y,0x8effff);}game.ui.charge(input.chargeMs);this.mesh.position.set(this.x,this.y,0);this.mesh.rotation.x=THREE.MathUtils.lerp(this.mesh.rotation.x,movement.y*.4,dt*10);this.mesh.visible=this.invulnerable<=0||Math.floor(this.invulnerable*16)%2===0;}
  damage(game){if(this.invulnerable>0)return;this.hp--;this.invulnerable=1.4;game.ui.update(this.hp,game.score);game.burst(this.x,this.y,0x65eee1);if(this.hp<=0)game.end();}
}

class Bullet {
  constructor(scene,hostile){this.hostile=hostile;this.mesh=new THREE.Mesh(geometry.bullet,hostile?material.enemyBullet:material.glow);this.aura=new THREE.Mesh(geometry.bullet,material.wave);this.mesh.add(this.aura);scene.add(this.mesh);
    this.deactivate();}
  activate(x,y,vx,vy,damage=1){Object.assign(this,{x,y,previousX:x,previousY:y,vx,vy,damage,energy:damage,isWave:!this.hostile&&damage>1,age:0,active:true});this.updateAppearance();this.mesh.visible=true;this.mesh.position.set(x,y,0);}
  updateAppearance(){const power=this.energy,wave=this.isWave;this.radius=this.hostile?.22:wave?.25+power*.045:.16;this.mesh.scale.set(wave?4+power*.35:this.hostile?1.7:2.3,wave?this.radius/.14:this.hostile?1.7:.8,wave?2:1);this.aura.visible=wave;const auraSize=1.15+power*.035;this.aura.scale.set(auraSize,auraSize,auraSize);}
  deactivate(){this.active=false;this.mesh.visible=false;}
  update(dt){this.previousX=this.x;this.previousY=this.y;this.x+=this.vx*dt;this.y+=this.vy*dt;this.age+=dt;this.mesh.position.set(this.x,this.y,0);if(Math.abs(this.x)>19||Math.abs(this.y)>11)this.deactivate();}
}

class Rock {
  constructor(scene){this.mesh=new THREE.Mesh(geometry.orb,material.rock);scene.add(this.mesh);this.deactivate();}
  activate(x,y,size='large',vx=-2.5,vy=0){Object.assign(this,{x,y,size,vx,vy,active:true,hp:size==='large'?16:8,radius:size==='large'?1.5:.85});this.mesh.scale.set(this.radius/.6,this.radius/.6,this.radius/.6);this.mesh.rotation.set(Math.random(),Math.random(),Math.random());this.mesh.position.set(x,y,0);this.mesh.visible=true;}
  deactivate(){this.active=false;this.mesh.visible=false;}
  update(dt){this.x+=this.vx*dt;this.y+=this.vy*dt;this.mesh.position.set(this.x,this.y,0);this.mesh.rotation.x+=dt*.3;this.mesh.rotation.y+=dt*.2;if(this.x<-19||Math.abs(this.y)>12)this.deactivate();}
}

class Enemy {
  constructor(scene,type){this.type=type;this.mesh=new THREE.Group();part(this.mesh,geometry.orb,material.enemy[type],0,0,0,1.3,1,1);part(this.mesh,geometry.box,material.enemy[type],.1,0,0,.5,1.8,.3);part(this.mesh,geometry.orb,material.glow,-.45,0,.4,.3,.3,.3);scene.add(this.mesh);this.radius=.65;this.deactivate();}
  activate(y,time,difficulty){this.active=true;this.x=18;this.y=y;this.baseY=y;this.age=0;this.phase=time;this.hp=this.type===2?3:2;this.speed=4+this.type*.5+difficulty;this.cooldown=1.1+Math.random()*.7;this.mesh.visible=true;this.mesh.position.set(this.x,this.y,-3);}
  deactivate(){this.active=false;this.mesh.visible=false;}
  update(dt,game){this.age+=dt;this.x-=this.speed*dt;if(this.type===1)this.y=clamp(this.baseY+Math.sin(this.age*3+this.phase)*1.7,-7,7);if(this.type===2)this.y+=clamp(game.player.y-this.y,-1,1)*dt*1.8;this.mesh.position.set(this.x,this.y,-3*Math.max(0,1-this.age/.7));this.mesh.rotation.x+=dt*.8;this.mesh.rotation.y=Math.sin(this.age*2)*.35;this.cooldown-=dt;if(this.type===2&&this.cooldown<=0&&this.x<15){let dx=game.player.x-this.x,dy=game.player.y-this.y;const length=Math.max(.01,Math.hypot(dx,dy));game.shoot(this.x-.5,this.y,dx/length*8,dy/length*8,true);this.cooldown=1.8;}if(this.x<-18)this.deactivate();}
}

class UnpoCrystal extends Bullet {
  constructor(scene,model,owner){
    super(scene,true);scene.remove(this.mesh);
    this.mesh=new THREE.Group();this.mesh.add(model);scene.add(this.mesh);
    this.scene=scene;this.owner=owner;this.isCrystal=true;
    this.materials=[];
    model.traverse(obj=>{if(obj.isMesh){const source=Array.isArray(obj.material)?obj.material:[obj.material];const copies=source.map(mat=>{const copy=mat.clone();copy.transparent=true;this.materials.push(copy);return copy;});obj.material=Array.isArray(obj.material)?copies:copies[0];}});
    this.deactivate('reset');
  }
  opacity(value){for(const mat of this.materials){mat.opacity=value;mat.depthWrite=value>=1;}}
  attach(){this.owner.socket.add(this.mesh);this.mesh.position.set(0,0,0);this.mesh.rotation.set(0,0,0);this.hp=UNPO_CONFIG.crystalHp;this.radius=UNPO_CONFIG.crystalRadius;this.age=1;this.mesh.visible=true;this.syncHeld();}
  syncHeld(){this.x=this.owner.x;this.y=this.owner.y+UNPO_CONFIG.socketY;}
  hold(){this.attach();this.phase='held';this.active=true;this.opacity(1);}
  fire(player,ui){
    if(this.phase!=='held')return;
    this.owner.mesh.updateMatrixWorld(true);this.scene.attach(this.mesh);
    this.syncHeld();this.mesh.position.set(this.x,this.y,0);
    this.heading=Math.atan2(player.y-this.y,player.x-this.x);
    this.flightAge=0;this.phase='flying';this.updateVelocity();
    ui.say(UNPO_CONFIG.lines[Math.floor(Math.random()*UNPO_CONFIG.lines.length)]);
  }
  updateVelocity(){this.vx=Math.cos(this.heading)*UNPO_CONFIG.projectileSpeed;this.vy=Math.sin(this.heading)*UNPO_CONFIG.projectileSpeed;}
  deactivate(reason='destroyed'){
    this.active=false;if(this.mesh)this.mesh.visible=false;
    if(this.owner?.active&&reason!=='reset'&&reason!=='owner-dead'){
      this.attach();this.phase='regenerating';this.regenerationAge=0;this.sparkTimer=0;this.opacity(0);
    }else this.phase='inactive';
  }
  update(dt,game){
    if(!this.owner.active)return;
    if(this.phase==='regenerating'){
      this.syncHeld();this.regenerationAge+=dt;
      this.opacity(clamp(this.regenerationAge/UNPO_CONFIG.regenerationDuration,0,1));
      this.sparkTimer-=dt;if(this.sparkTimer<=0){game.burst(this.x,this.y,0xc88935);this.sparkTimer=.18;}
      if(this.regenerationAge>=UNPO_CONFIG.regenerationDuration){this.phase='held';this.active=true;this.opacity(1);this.owner.attackTimer=UNPO_CONFIG.attackInterval;}
      return;
    }
    if(this.phase==='held'){this.syncHeld();return;}
    if(this.phase!=='flying')return;
    this.previousX=this.x;this.previousY=this.y;
    // Split a boundary-crossing frame: steering stops at exactly one second.
    const steeringDt=Math.min(dt,Math.max(0,UNPO_CONFIG.homingDuration-this.flightAge));
    if(steeringDt>0){const desired=Math.atan2(game.player.y-this.y,game.player.x-this.x);const delta=Math.atan2(Math.sin(desired-this.heading),Math.cos(desired-this.heading));this.heading+=clamp(delta,-UNPO_CONFIG.homingTurnRate*steeringDt,UNPO_CONFIG.homingTurnRate*steeringDt);this.updateVelocity();}
    this.flightAge+=dt;this.x+=this.vx*dt;this.y+=this.vy*dt;
    this.mesh.position.set(this.x,this.y,0); // Keep the crystal upright while its velocity changes.
    if(Math.abs(this.x)>19||Math.abs(this.y)>11)this.deactivate('offscreen');
  }
}

class UnpoEnemy extends Enemy {
  constructor(scene,body,crystal){super(scene,0);this.mesh.clear();this.mesh.add(body);this.visual=body;this.isUnpo=true;this.scoreValue=UNPO_CONFIG.score;this.name=UNPO_CONFIG.name;
    this.socket=new THREE.Group();this.socket.name='UnpoSocket';this.socket.position.set(0,UNPO_CONFIG.socketY,0);this.mesh.add(this.socket);
    this.crystal=new UnpoCrystal(scene,crystal,this);
  }
  activate(y=0){this.active=true;this.hp=UNPO_CONFIG.maxHp;this.radius=UNPO_CONFIG.bodyRadius;this.x=14;this.y=y;this.baseY=y;this.age=1;this.attackTimer=UNPO_CONFIG.attackInterval;this.mesh.visible=true;this.mesh.position.set(this.x,this.y,0);this.crystal.hold();}
  deactivate(){super.deactivate();this.crystal?.deactivate('owner-dead');}
  update(dt,game){this.age+=dt;this.x=Math.max(9,this.x-dt*1.5);this.y=clamp(this.baseY+Math.sin(this.age*.8)*1.5,-4.5,4.5);this.mesh.position.set(this.x,this.y,0);
    this.visual.rotation.y=Math.sin(this.age*Math.PI*2/UNPO_CONFIG.bodySwayPeriod)*UNPO_CONFIG.bodySwayAmplitude;
    if(this.crystal.phase==='held'){this.attackTimer-=dt;if(this.attackTimer<=0)this.crystal.fire(game.player,game.ui);}
  }
}

class Game {
  constructor(model,unpoModels){
    this.ui=new UI();this.input=new Input();this.state='ready';this.elapsed=0;this.score=0;
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color(0x070d1c);this.scene.fog=new THREE.Fog(0x070d1c,35,85);
    this.camera=new THREE.OrthographicCamera(-16,16,9,-9,.1,120);this.camera.position.set(0,0,40);this.camera.lookAt(0,0,0);
    this.renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));this.renderer.outputColorSpace=THREE.SRGBColorSpace;document.querySelector('#game').prepend(this.renderer.domElement);
    this.waveTrail=new WaveTrail(document.querySelector('#game'));
    this.scene.add(new THREE.HemisphereLight(0xaadfff,0x263053,2));const light=new THREE.DirectionalLight(0xffffff,2.5);light.position.set(-3,8,12);this.scene.add(light);
    this.player=new Player(this.scene,model);this.bullets=Array.from({length:96},()=>new Bullet(this.scene,false));this.enemyBullets=Array.from({length:64},()=>new Bullet(this.scene,true));this.enemies=Array.from({length:24},(_,i)=>new Enemy(this.scene,i%3));
    this.rocks=Array.from({length:32},()=>new Rock(this.scene));
    const unpo=new UnpoEnemy(this.scene,unpoModels.body,unpoModels.crystal);this.enemies.push(unpo);this.crystals=[unpo.crystal];
    this.makeBackground();this.makeEffects();this.resize();addEventListener('resize',()=>this.resize());
    this.ui.start.onclick=()=>{if(this.state==='paused')this.resume();else this.start();};this.ui.pause.onclick=()=>this.togglePause();
    addEventListener('keydown',e=>{if(!e.repeat&&(e.code==='KeyP'||e.code==='Escape'))this.togglePause();});
    addEventListener('blur',()=>{if(this.state==='playing')this.togglePause();});document.addEventListener('visibilitychange',()=>{if(document.hidden&&this.state==='playing')this.togglePause();});
    this.ui.update(5,0);this.last=performance.now();this.frame=this.frame.bind(this);requestAnimationFrame(this.frame);
  }
  resize(){const w=innerWidth,h=innerHeight,aspect=w/h; // Fit the entire gameplay rectangle, including portrait screens.
    const width=Math.max(WORLD.width,WORLD.height*aspect),height=width/aspect;
    Object.assign(this.camera,{left:-width/2,right:width/2,top:height/2,bottom:-height/2});this.camera.updateProjectionMatrix();this.renderer.setSize(w,h);this.waveTrail.resize(w,h);}
  makeBackground(){this.layers=[];for(let layer=0;layer<3;layer++){const positions=new Float32Array(120*3);for(let i=0;i<120;i++){positions[i*3]=(Math.random()-.5)*90;positions[i*3+1]=(Math.random()-.5)*65;positions[i*3+2]=-8-layer*12;}const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));const points=new THREE.Points(geo,new THREE.PointsMaterial({color:[0x72bccb,0x627695,0x3b526c][layer],size:.08+layer*.03}));this.scene.add(points);this.layers.push({points,speed:2/(layer+1)});}
    this.structures=[];for(let i=0;i<18;i++){const mesh=new THREE.Mesh(geometry.orb,material.structure);mesh.position.set(i*5-42,(i%2?1:-1)*(10+Math.random()*4),-7-Math.random()*12);mesh.scale.set(2+Math.random()*3,3+Math.random()*3,2+Math.random()*3);mesh.rotation.set(Math.random(),Math.random(),Math.random());this.scene.add(mesh);this.structures.push(mesh);}
    const grid=new THREE.GridHelper(100,35,0x23536b,0x142e43);grid.position.set(0,-12,-22);this.scene.add(grid);
  }
  makeEffects(){this.effects=Array.from({length:64},()=>{const mesh=new THREE.Mesh(geometry.orb,new THREE.MeshBasicMaterial({color:0xffffff,transparent:true}));mesh.visible=false;this.scene.add(mesh);return {mesh,life:0};});}
  burst(x,y,color){for(let i=0;i<8;i++){const e=this.effects.find(e=>e.life<=0);if(!e)break;e.life=.4+Math.random()*.2;e.mesh.visible=true;e.mesh.material.color.setHex(color);e.mesh.position.set(x,y,0);e.vx=(Math.random()-.5)*9;e.vy=(Math.random()-.5)*9;e.mesh.scale.setScalar(.12+Math.random()*.15);}}
  shoot(x,y,vx,vy,hostile,damage=1){const bullet=(hostile?this.enemyBullets:this.bullets).find(b=>!b.active);if(bullet)bullet.activate(x,y,vx,vy,damage);}
  spawnUnpo(x=14,y=0){const enemy=this.enemies.find(e=>e.isUnpo&&!e.active);if(!enemy)return null;enemy.activate(y);enemy.x=x;enemy.mesh.position.set(x,y,0);enemy.crystal.syncHeld();return enemy;}
  destroyRock(rock){this.burst(rock.x,rock.y,0xd4b698);if(rock.size==='large'){const children=this.rocks.filter(r=>!r.active).slice(0,2);const speed=Math.hypot(rock.vx,rock.vy)||1;for(let i=0;i<children.length;i++){const side=i===0?-1:1;const velocity=splitVelocity(rock.vx,rock.vy,side);children[i].activate(rock.x-rock.vy/speed*side*.9,rock.y+rock.vx/speed*side*.9,'medium',velocity.vx,velocity.vy);}}rock.deactivate();this.score+=rock.size==='large'?100:50;this.ui.update(this.player.hp,this.score);}
  hitTarget(bullet,target){
    const available=bullet.energy??bullet.damage??1;
    const spent=Math.min(available,target.hp);
    target.hp-=spent;
    bullet.energy=available-spent;bullet.damage=bullet.energy;
    this.burst(target.x,target.y,0x8effff);
    if(target.hp<=0){if(this.rocks.includes(target))this.destroyRock(target);else if(target.isCrystal)target.deactivate('destroyed');else{target.deactivate();this.score+=target.scoreValue??[100,150,250][target.type];this.ui.update(this.player.hp,this.score);}}
    if(!bullet.isWave||bullet.energy<=0)bullet.deactivate();else{bullet.updateAppearance();}
  }
  start(){this.input.clear();for(const entity of [...this.enemies,...this.bullets,...this.enemyBullets,...this.rocks,...(this.crystals??[])])entity.deactivate();for(const e of this.effects){e.life=0;e.mesh.visible=false;}this.elapsed=0;this.score=0;this.unpoTimer=UNPO_CONFIG.firstSpawnTime;this.ui.say('');this.rockTimer=3;this.ui.charge(0);this.spawnTimer=.6;this.spawnCount=0;this.player.reset();this.state='playing';this.ui.update(5,0);this.ui.hide();this.ui.pause.textContent='Ⅱ';}
  end(){this.state='over';this.ui.charge(0);this.player.mesh.visible=false;this.input.clear();this.ui.show('GAME OVER',`FINAL SCORE  ${String(this.score).padStart(6,'0')}`,'RESTART');}
  togglePause(){if(this.state==='playing'){this.state='paused';this.input.clear();this.ui.charge(0);this.ui.show('PAUSED','ひと休みして、再び宇宙へ。','RESUME');this.ui.pause.textContent='▶';}else if(this.state==='paused')this.resume();}
  resume(){this.input.clear();this.state='playing';this.ui.hide();this.ui.pause.textContent='Ⅱ';this.last=performance.now();}
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
      if(this.rocks.some(rock=>rock.active&&Number.isFinite(hitTime(crystal,rock))))crystal.deactivate('terrain');
      else if(Number.isFinite(hitTime(crystal,this.player))){crystal.deactivate('player');this.player.damage(this);if(this.state!=='playing')return;}
    }
    for(const bullet of this.bullets){
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
    for(const enemy of this.enemies)if(enemy.active&&enemy.age>=.7&&overlap(enemy,this.player)){this.burst(enemy.x,enemy.y,0xff7866);if(!enemy.isUnpo)enemy.deactivate();this.player.damage(this);if(this.state!=='playing')return;}
    for(const rock of this.rocks)if(rock.active&&overlap(rock,this.player)){this.player.damage(this);if(this.state!=='playing')return;}
  }
  animateBackground(dt){for(const layer of this.layers){const p=layer.points.geometry.attributes.position;for(let i=0;i<p.count;i++){p.array[i*3]-=layer.speed*dt;if(p.array[i*3]<-45)p.array[i*3]=45;}p.needsUpdate=true;}for(const mesh of this.structures){mesh.position.x-=2.5*dt;mesh.rotation.x+=dt*.04;if(mesh.position.x<-48)mesh.position.x=48;}}
  frame(now){const dt=Math.min((now-this.last)/1000,.04);this.last=now;if(this.state==='playing')this.update(dt);if(this.state!=='paused'){this.animateBackground(dt);for(const e of this.effects)if(e.life>0){e.life-=dt;e.mesh.position.x+=e.vx*dt;e.mesh.position.y+=e.vy*dt;e.mesh.material.opacity=Math.max(0,e.life/.6);if(e.life<=0)e.mesh.visible=false;}}this.renderer.render(this.scene,this.camera);this.waveTrail.render(this.bullets,this.camera);this.ui.enemyHealth(this.enemies,this.camera);requestAnimationFrame(this.frame);}
}

// Finish loading before enabling play; startup errors reach index.html's error screen.
const [playerModel,unpoBody,unpoCrystal]=await Promise.all([
  loadIbojitchPlayer(),
  loadModel(new URL('./kuwassu_unpo_character.glb',import.meta.url).href),
  loadModel(new URL('./crystal_unpo_projectile.glb',import.meta.url).href),
]);
// The supplied crystal is Z-up: rotate +Z to +Y before measuring its height.
unpoCrystal.rotation.x=-Math.PI/2;
unpoCrystal.updateMatrixWorld(true);
const game=new Game(playerModel,{body:fitModel(unpoBody,UNPO_CONFIG.bodyHeight),crystal:fitModel(unpoCrystal,UNPO_CONFIG.crystalHeight)});
// Optional debug placement: open index.html?debugUnpo=1 for an immediate spawn.
if(new URLSearchParams(location.search).has('debugUnpo')){game.ui.start.onclick=()=>{if(game.state==='paused')game.resume();else{game.start();game.spawnUnpo(10,0);}};}
