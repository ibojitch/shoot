import * as THREE from 'three';
import { loadIbojitchPlayer } from './playerModel.js';

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const overlap = (a, b) => (a.x-b.x)**2 + (a.y-b.y)**2 < (a.radius+b.radius)**2;
const WORLD = { width: 32, height: 18 };
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
};
function part(group, geo, mat, x=0,y=0,z=0,sx=1,sy=1,sz=1) {
  const mesh=new THREE.Mesh(geo,mat); mesh.position.set(x,y,z); mesh.scale.set(sx,sy,sz); group.add(mesh); return mesh;
}

class Input {
  constructor() {
    this.keys=new Set(); this.stick={x:0,y:0}; this.firePointers=new Set(); this.stickPointer=null;
    this.pad=document.querySelector('#stick'); this.knob=document.querySelector('#knob'); this.fireButton=document.querySelector('#fire');
    addEventListener('keydown',e=>{if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault(); this.keys.add(e.code);});
    addEventListener('keyup',e=>this.keys.delete(e.code));
    addEventListener('blur',()=>this.clear());
    this.pad.addEventListener('pointerdown',e=>{if(this.stickPointer!==null)return;this.stickPointer=e.pointerId;this.pad.setPointerCapture(e.pointerId);this.moveStick(e);});
    this.pad.addEventListener('pointermove',e=>{if(e.pointerId===this.stickPointer)this.moveStick(e);});
    for(const event of ['pointerup','pointercancel','lostpointercapture'])this.pad.addEventListener(event,e=>{if(e.pointerId===this.stickPointer){this.stickPointer=null;this.stick.x=this.stick.y=0;this.knob.style.transform='';}});
    this.fireButton.addEventListener('pointerdown',e=>{this.fireButton.setPointerCapture(e.pointerId);this.firePointers.add(e.pointerId);this.fireButton.classList.add('active');});
    for(const event of ['pointerup','pointercancel','lostpointercapture'])this.fireButton.addEventListener(event,e=>{this.firePointers.delete(e.pointerId);this.fireButton.classList.toggle('active',this.firePointers.size>0);});
  }
  moveStick(e){const rect=this.pad.getBoundingClientRect();let x=e.clientX-rect.left-rect.width/2,y=e.clientY-rect.top-rect.height/2;const limit=rect.width*.32,length=Math.hypot(x,y);if(length>limit){x*=limit/length;y*=limit/length;}this.stick.x=x/limit;this.stick.y=-y/limit;this.knob.style.transform=`translate(${x}px,${y}px)`;}
  clear(){this.keys.clear();this.stick.x=this.stick.y=0;this.stickPointer=null;this.firePointers.clear();this.knob.style.transform='';this.fireButton.classList.remove('active');}
  get movement(){let x=Number(this.keys.has('KeyD')||this.keys.has('ArrowRight'))-Number(this.keys.has('KeyA')||this.keys.has('ArrowLeft'))+this.stick.x;let y=Number(this.keys.has('KeyW')||this.keys.has('ArrowUp'))-Number(this.keys.has('KeyS')||this.keys.has('ArrowDown'))+this.stick.y;const length=Math.max(1,Math.hypot(x,y));return {x:x/length,y:y/length};}
  get firing(){return this.keys.has('Space')||this.firePointers.size>0;}
}

class UI {
  constructor(){this.hp=document.querySelector('#hp');this.score=document.querySelector('#score');this.overlay=document.querySelector('#overlay');this.title=document.querySelector('#title');this.message=document.querySelector('#message');this.start=document.querySelector('#start');this.pause=document.querySelector('#pause');}
  update(hp,score){this.hp.textContent='● '.repeat(hp)+'○ '.repeat(5-hp);this.score.textContent=String(score).padStart(6,'0');}
  show(title,message,button){this.title.textContent=title;this.message.textContent=message;this.start.textContent=button;this.overlay.hidden=false;}
  hide(){this.overlay.hidden=true;}
}

class Player {
  constructor(scene,model){this.mesh=new THREE.Group();this.mesh.add(model);scene.add(this.mesh);this.radius=.48;this.reset();}
  reset(){this.x=-10;this.y=0;this.hp=5;this.invulnerable=0;this.cooldown=0;this.mesh.visible=true;this.mesh.position.set(this.x,this.y,0);}
  update(dt,input,game){const movement=input.movement;this.x=clamp(this.x+movement.x*10*dt,-15,14.5);this.y=clamp(this.y+movement.y*10*dt,-7.5,7.5);this.invulnerable=Math.max(0,this.invulnerable-dt);this.cooldown-=dt;if(input.firing&&this.cooldown<=0){game.shoot(this.x+1,this.y,24,0,false);this.cooldown=.15;}this.mesh.position.set(this.x,this.y,0);this.mesh.rotation.x=THREE.MathUtils.lerp(this.mesh.rotation.x,movement.y*.4,dt*10);this.mesh.visible=this.invulnerable<=0||Math.floor(this.invulnerable*16)%2===0;}
  damage(game){if(this.invulnerable>0)return;this.hp--;this.invulnerable=1.4;game.ui.update(this.hp,game.score);game.burst(this.x,this.y,0x65eee1);if(this.hp<=0)game.end();}
}

class Bullet {
  constructor(scene,hostile){this.hostile=hostile;this.radius=hostile?.22:.16;this.mesh=new THREE.Mesh(geometry.bullet,hostile?material.enemyBullet:material.glow);this.mesh.scale.set(hostile?1.7:2.3,hostile?1.7:.8,1);scene.add(this.mesh);this.deactivate();}
  activate(x,y,vx,vy){Object.assign(this,{x,y,vx,vy,active:true});this.mesh.visible=true;this.mesh.position.set(x,y,0);}
  deactivate(){this.active=false;this.mesh.visible=false;}
  update(dt){this.x+=this.vx*dt;this.y+=this.vy*dt;this.mesh.position.set(this.x,this.y,0);if(Math.abs(this.x)>19||Math.abs(this.y)>11)this.deactivate();}
}

class Enemy {
  constructor(scene,type){this.type=type;this.mesh=new THREE.Group();part(this.mesh,geometry.orb,material.enemy[type],0,0,0,1.3,1,1);part(this.mesh,geometry.box,material.enemy[type],.1,0,0,.5,1.8,.3);part(this.mesh,geometry.orb,material.glow,-.45,0,.4,.3,.3,.3);scene.add(this.mesh);this.radius=.65;this.deactivate();}
  activate(y,time,difficulty){this.active=true;this.x=18;this.y=y;this.baseY=y;this.age=0;this.phase=time;this.hp=this.type===2?3:2;this.speed=4+this.type*.5+difficulty;this.cooldown=1.1+Math.random()*.7;this.mesh.visible=true;this.mesh.position.set(this.x,this.y,-3);}
  deactivate(){this.active=false;this.mesh.visible=false;}
  update(dt,game){this.age+=dt;this.x-=this.speed*dt;if(this.type===1)this.y=clamp(this.baseY+Math.sin(this.age*3+this.phase)*1.7,-7,7);if(this.type===2)this.y+=clamp(game.player.y-this.y,-1,1)*dt*1.8;this.mesh.position.set(this.x,this.y,-3*Math.max(0,1-this.age/.7));this.mesh.rotation.x+=dt*.8;this.mesh.rotation.y=Math.sin(this.age*2)*.35;this.cooldown-=dt;if(this.type===2&&this.cooldown<=0&&this.x<15){let dx=game.player.x-this.x,dy=game.player.y-this.y;const length=Math.max(.01,Math.hypot(dx,dy));game.shoot(this.x-.5,this.y,dx/length*8,dy/length*8,true);this.cooldown=1.8;}if(this.x<-18)this.deactivate();}
}

class Game {
  constructor(model){
    this.ui=new UI();this.input=new Input();this.state='ready';this.elapsed=0;this.score=0;
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color(0x070d1c);this.scene.fog=new THREE.Fog(0x070d1c,35,85);
    this.camera=new THREE.OrthographicCamera(-16,16,9,-9,.1,120);this.camera.position.set(0,0,40);this.camera.lookAt(0,0,0);
    this.renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));this.renderer.outputColorSpace=THREE.SRGBColorSpace;document.querySelector('#game').prepend(this.renderer.domElement);
    this.scene.add(new THREE.HemisphereLight(0xaadfff,0x263053,2));const light=new THREE.DirectionalLight(0xffffff,2.5);light.position.set(-3,8,12);this.scene.add(light);
    this.player=new Player(this.scene,model);this.bullets=Array.from({length:96},()=>new Bullet(this.scene,false));this.enemyBullets=Array.from({length:64},()=>new Bullet(this.scene,true));this.enemies=Array.from({length:24},(_,i)=>new Enemy(this.scene,i%3));
    this.makeBackground();this.makeEffects();this.resize();addEventListener('resize',()=>this.resize());
    this.ui.start.onclick=()=>{if(this.state==='paused')this.resume();else this.start();};this.ui.pause.onclick=()=>this.togglePause();
    addEventListener('keydown',e=>{if(!e.repeat&&(e.code==='KeyP'||e.code==='Escape'))this.togglePause();});
    addEventListener('blur',()=>{if(this.state==='playing')this.togglePause();});document.addEventListener('visibilitychange',()=>{if(document.hidden&&this.state==='playing')this.togglePause();});
    this.ui.update(5,0);this.last=performance.now();this.frame=this.frame.bind(this);requestAnimationFrame(this.frame);
  }
  resize(){const w=innerWidth,h=innerHeight,aspect=w/h; // Fit the entire gameplay rectangle, including portrait screens.
    const width=Math.max(WORLD.width,WORLD.height*aspect),height=width/aspect;
    Object.assign(this.camera,{left:-width/2,right:width/2,top:height/2,bottom:-height/2});this.camera.updateProjectionMatrix();this.renderer.setSize(w,h);}
  makeBackground(){this.layers=[];for(let layer=0;layer<3;layer++){const positions=new Float32Array(120*3);for(let i=0;i<120;i++){positions[i*3]=(Math.random()-.5)*90;positions[i*3+1]=(Math.random()-.5)*65;positions[i*3+2]=-8-layer*12;}const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));const points=new THREE.Points(geo,new THREE.PointsMaterial({color:[0x72bccb,0x627695,0x3b526c][layer],size:.08+layer*.03}));this.scene.add(points);this.layers.push({points,speed:2/(layer+1)});}
    this.structures=[];for(let i=0;i<18;i++){const mesh=new THREE.Mesh(geometry.orb,material.structure);mesh.position.set(i*5-42,(i%2?1:-1)*(10+Math.random()*4),-7-Math.random()*12);mesh.scale.set(2+Math.random()*3,3+Math.random()*3,2+Math.random()*3);mesh.rotation.set(Math.random(),Math.random(),Math.random());this.scene.add(mesh);this.structures.push(mesh);}
    const grid=new THREE.GridHelper(100,35,0x23536b,0x142e43);grid.position.set(0,-12,-22);this.scene.add(grid);
  }
  makeEffects(){this.effects=Array.from({length:64},()=>{const mesh=new THREE.Mesh(geometry.orb,new THREE.MeshBasicMaterial({color:0xffffff,transparent:true}));mesh.visible=false;this.scene.add(mesh);return {mesh,life:0};});}
  burst(x,y,color){for(let i=0;i<8;i++){const e=this.effects.find(e=>e.life<=0);if(!e)break;e.life=.4+Math.random()*.2;e.mesh.visible=true;e.mesh.material.color.setHex(color);e.mesh.position.set(x,y,0);e.vx=(Math.random()-.5)*9;e.vy=(Math.random()-.5)*9;e.mesh.scale.setScalar(.12+Math.random()*.15);}}
  shoot(x,y,vx,vy,hostile){const bullet=(hostile?this.enemyBullets:this.bullets).find(b=>!b.active);if(bullet)bullet.activate(x,y,vx,vy);}
  start(){this.input.clear();for(const entity of [...this.enemies,...this.bullets,...this.enemyBullets])entity.deactivate();for(const e of this.effects){e.life=0;e.mesh.visible=false;}this.elapsed=0;this.score=0;this.spawnTimer=.6;this.spawnCount=0;this.player.reset();this.state='playing';this.ui.update(5,0);this.ui.hide();this.ui.pause.textContent='Ⅱ';}
  end(){this.state='over';this.player.mesh.visible=false;this.input.clear();this.ui.show('GAME OVER',`FINAL SCORE  ${String(this.score).padStart(6,'0')}`,'RESTART');}
  togglePause(){if(this.state==='playing'){this.state='paused';this.input.clear();this.ui.show('PAUSED','ひと休みして、再び宇宙へ。','RESUME');this.ui.pause.textContent='▶';}else if(this.state==='paused')this.resume();}
  resume(){this.input.clear();this.state='playing';this.ui.hide();this.ui.pause.textContent='Ⅱ';this.last=performance.now();}
  update(dt){this.elapsed+=dt;this.player.update(dt,this.input,this);this.spawnTimer-=dt;if(this.spawnTimer<=0){const type=this.spawnCount++%3;const enemy=this.enemies.find(e=>!e.active&&e.type===type);if(enemy)enemy.activate((Math.random()-.5)*12,this.elapsed,Math.min(3,this.elapsed/45));this.spawnTimer=Math.max(.55,1.3-this.elapsed*.003);}
    for(const enemy of this.enemies)if(enemy.active)enemy.update(dt,this);
    for(const bullet of this.bullets){if(!bullet.active)continue;bullet.update(dt);if(!bullet.active)continue;for(const enemy of this.enemies){if(enemy.active&&enemy.age>=.7&&overlap(bullet,enemy)){bullet.deactivate();enemy.hp--;this.burst(bullet.x,bullet.y,0x6affec);if(enemy.hp<=0){this.burst(enemy.x,enemy.y,[0xff7866,0xc18aff,0xffc05b][enemy.type]);enemy.deactivate();this.score+=[100,150,250][enemy.type];this.ui.update(this.player.hp,this.score);}break;}}}
    for(const bullet of this.enemyBullets){if(!bullet.active)continue;bullet.update(dt);if(bullet.active&&overlap(bullet,this.player)){bullet.deactivate();this.player.damage(this);if(this.state!=='playing')return;}}
    for(const enemy of this.enemies)if(enemy.active&&enemy.age>=.7&&overlap(enemy,this.player)){this.burst(enemy.x,enemy.y,0xff7866);enemy.deactivate();this.player.damage(this);if(this.state!=='playing')return;}
  }
  animateBackground(dt){for(const layer of this.layers){const p=layer.points.geometry.attributes.position;for(let i=0;i<p.count;i++){p.array[i*3]-=layer.speed*dt;if(p.array[i*3]<-45)p.array[i*3]=45;}p.needsUpdate=true;}for(const mesh of this.structures){mesh.position.x-=2.5*dt;mesh.rotation.x+=dt*.04;if(mesh.position.x<-48)mesh.position.x=48;}}
  frame(now){const dt=Math.min((now-this.last)/1000,.04);this.last=now;if(this.state==='playing')this.update(dt);if(this.state!=='paused'){this.animateBackground(dt);for(const e of this.effects)if(e.life>0){e.life-=dt;e.mesh.position.x+=e.vx*dt;e.mesh.position.y+=e.vy*dt;e.mesh.material.opacity=Math.max(0,e.life/.6);if(e.life<=0)e.mesh.visible=false;}}this.renderer.render(this.scene,this.camera);requestAnimationFrame(this.frame);}
}

// Finish loading before enabling play; startup errors reach index.html's error screen.
new Game(await loadIbojitchPlayer());
