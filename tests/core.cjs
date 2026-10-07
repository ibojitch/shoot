// Exercise real game logic without a browser/WebGL dependency.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
class Asset {
  constructor(...args){this.args=args;this.children=[];const vector=()=>({x:0,y:0,z:0,set(x,y,z){Object.assign(this,{x,y,z});}});this.position=vector();this.rotation=vector();this.scale=vector();}
  add(...children){this.children.push(...children);}
  clear(){this.children=[];}
}
const THREE = new Proxy({}, {get:(_,name)=>name==='MathUtils'?{lerp:(a,b,t)=>a+(b-a)*t}:Asset});
const source=fs.readFileSync(require('node:path').join(__dirname,'../game.js'),'utf8')
  .replace(/^import .*;$/gm,'').split('// Finish loading')[0];
const context=vm.createContext({THREE,Math,document:{},performance:{now:()=>context.clock??0}});
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../unpoConfig.js'),'utf8').replace('export const','const')+source+'\nglobalThis.logic={Game,UI,Player,Bullet,Missile,FlightHistory,POWER_UPS,Enemy,UnpoEnemy,UnpoCrystal,UNPO_CONFIG,Rock,Input,chargeDamage,splitVelocity,bulletHits,overlap};',context);
const {Game,UI,Player,Bullet,Missile,FlightHistory,POWER_UPS,Enemy,UnpoEnemy,UnpoCrystal,UNPO_CONFIG,Rock,Input,chargeDamage,splitVelocity,bulletHits,overlap}=context.logic;
const mesh=()=>({visible:true,scale:{set(){}},position:{set(){}},rotation:{x:0,y:0,set(){}}});
const bullet=(x,y)=>({x,y,radius:.16,active:true,update(){},deactivate(){this.active=false;}});
const enemy=(x,y,hp=1)=>({x,y,hp,type:0,age:1,radius:.65,active:true,update(){},deactivate(){this.active=false;}});
function fixture(){return Object.assign(Object.create(Game.prototype),{elapsed:0,score:0,spawnTimer:99,spawnCount:0,state:'playing',input:{},player:{x:-10,y:0,radius:.48,hp:5,update(){},damage:Player.prototype.damage,invulnerable:0,mesh:mesh()},rocks:[],rockTimer:99,enemies:[],bullets:[],enemyBullets:[],burst(){},ui:{say(){},charge(){},update(){},show(){},hide(){},pause:{}},});}
let game=fixture(); game.enemies=[enemy(0,0)];game.bullets=[bullet(0,0)];game.update(.016);
assert.equal(game.score,100);assert.equal(game.enemies[0].active,false);assert.equal(game.bullets[0].active,false);
game=fixture();game.enemies=[enemy(0,0,2)];game.bullets=[bullet(0,0)];game.update(.016);assert.equal(game.score,0);assert.equal(game.enemies[0].hp,1);
game=fixture();game.enemies=[enemy(0,0)];game.enemies[0].age=.2;game.bullets=[bullet(0,0)];game.update(.016);assert.equal(game.enemies[0].hp,1);
game=fixture();game.enemyBullets=[bullet(-10,0)];game.update(.016);assert.equal(game.player.hp,4);assert.equal(game.enemyBullets[0].active,false);
game.player.damage(game);assert.equal(game.player.hp,4); // invulnerability prevents repeated damage
game=fixture();game.player.hp=1;game.input.clear=()=>{};game.enemyBullets=[bullet(-10,0)];game.update(.016);assert.equal(game.state,'over');assert.equal(game.player.hp,0);
game.player.reset=Player.prototype.reset;game.input.clear=()=>{};game.effects=[];game.start();assert.equal(game.state,'playing');assert.equal(game.player.hp,5);assert.equal(game.score,0);assert.equal(game.enemyBullets[0].active,false);
let shotCount=0;const player=Object.assign(Object.create(Player.prototype),{mesh:mesh(),radius:.48});player.reset();game.shoot=()=>shotCount++;
player.update(1,{movement:{x:-1,y:1},shotRequests:[1],chargeMs:0},game);assert.equal(player.x,-15);assert.equal(player.y,7.5);assert.equal(shotCount,1);
player.update(.05,{movement:{x:0,y:0},shotRequests:[],chargeMs:50},game);assert.equal(shotCount,1);
player.update(.11,{movement:{x:0,y:0},shotRequests:[16],chargeMs:0},game);assert.equal(shotCount,2);const hunter=Object.assign(Object.create(Enemy.prototype),{type:2,mesh:mesh()});hunter.activate(4,0,0);hunter.cooldown=0;game.player.x=-10;game.player.y=0;hunter.x=10;game.shoot=(x,y,vx,vy,hostile)=>{assert.ok(vx<0);assert.ok(vy<0);assert.equal(hostile,true);};hunter.update(.1,game);assert.ok(hunter.y<4);
assert.equal(overlap({x:0,y:0,radius:1},{x:3,y:0,radius:1}),false);
const b=Object.assign(Object.create(Bullet.prototype),{mesh:mesh(),aura:{scale:{set(){}}}});b.activate(18,0,24,0);b.update(1);assert.equal(b.active,false);
for(const [ms,power] of [[0,1],[199,1],[200,2],[299,2],[300,3],[1400,14],[1499,14],[1500,16],[2000,16]])assert.equal(chargeDamage(ms),power);
const input=Object.assign(Object.create(Input.prototype),{keys:new Set(),firePointers:new Set(),shotRequests:[],shotStartedAt:null});
context.clock=100;input.keys.add('Space');input.shotChanged(false);assert.equal(input.shotRequests.shift(),1);
context.clock=1600;input.keys.delete('Space');input.shotChanged(true);assert.equal(input.shotRequests.shift(),16);assert.equal(input.chargeMs,0);
context.clock=2000;input.keys.add('Space');input.shotChanged(false);input.shotRequests.length=0;context.clock=2200;input.keys.delete('Space');input.shotChanged(true,true);assert.equal(input.shotRequests.length,0);
for(const side of [-1,1]){const velocity=splitVelocity(-50,0,side);assert.ok(Math.abs(velocity.vx+43.301270189)<1e-6);assert.ok(Math.abs(Math.abs(velocity.vy)-25)<1e-6);assert.ok(Math.abs(Math.hypot(velocity.vx,velocity.vy)-50)<1e-6);}
const makeRock=()=>Object.assign(Object.create(Rock.prototype),{mesh:mesh(),active:false});
game=fixture();const large=makeRock();large.activate(0,0);game.rocks=[large,makeRock(),makeRock()];
for(let i=0;i<15;i++){game.bullets=[bullet(0,0)];game.update(0);}assert.equal(large.hp,1);assert.equal(large.active,true);
game.bullets=[bullet(0,0)];game.update(0);assert.equal(large.active,false);assert.equal(game.rocks.filter(r=>r.active).length,2);assert.equal(game.score,100);
assert.ok(game.rocks[1].y*game.rocks[2].y<0);assert.ok(game.rocks[1].vy*game.rocks[2].vy<0);assert.equal(game.rocks[1].hp,8);
assert.ok(Math.abs(game.rocks[1].y-game.rocks[2].y)>game.rocks[1].radius+game.rocks[2].radius);
game=fixture();const fullRock=makeRock();fullRock.activate(0,0);game.rocks=[fullRock,makeRock(),makeRock()];game.bullets=[{...bullet(0,0),damage:16}];game.update(0);assert.equal(fullRock.active,false);assert.equal(game.rocks.filter(r=>r.active).length,2);
assert.equal(bulletHits({previousX:-4,previousY:0,x:4,y:0,radius:.2},{x:0,y:0,radius:1}),true);
game.input.clear=()=>{};game.player.reset=Player.prototype.reset;game.effects=[];game.start();assert.equal(game.rocks.some(r=>r.active),false);
const wave=(x,y,energy)=>({...bullet(x,y),isWave:true,energy,damage:energy,updateAppearance(){this.radius=.25+this.energy*.045;},updateTrail(){}});
game=fixture();let shot=wave(0,0,16);let target=enemy(0,0,4);game.enemies=[target];game.hitTarget(shot,target);assert.equal(shot.energy,12);assert.equal(shot.active,true);assert.equal(target.active,false);
target=enemy(0,0,20);game.hitTarget(shot,target);assert.equal(target.hp,8);assert.equal(shot.energy,0);assert.equal(shot.active,false);
// Two simultaneous projectiles each spend only their own available energy.
game=fixture();target=enemy(0,0,6);const first=wave(0,0,2),second=wave(0,0,16);game.enemies=[target];game.bullets=[first,second];game.update(0);assert.equal(first.energy,0);assert.equal(second.energy,12);assert.equal(second.active,true);
// Mixed obstacles/enemies must consume energy in spatial order, not array order.
game=fixture();const blockingRock=makeRock();blockingRock.activate(2,0,'medium');blockingRock.hp=12;target=enemy(-2,0,4);game.rocks=[blockingRock];game.enemies=[target];shot=wave(4,0,6);shot.previousX=-4;game.bullets=[shot];game.update(0);assert.equal(target.active,false);assert.equal(blockingRock.hp,10);assert.equal(shot.active,false);
// Reused bullets reset their energy, wave state and appearance.
const reusable=Object.assign(Object.create(Bullet.prototype),{mesh:mesh(),aura:{scale:{set(){}}}});reusable.activate(0,0,30,0,16);reusable.energy=1;reusable.updateAppearance();assert.ok(reusable.radius<.4);reusable.deactivate();reusable.activate(0,0,24,0,1);assert.equal(reusable.energy,1);assert.equal(reusable.isWave,false);assert.equal(reusable.aura.visible,false);assert.equal(reusable.radius,.16);
console.log('PASS: combat, charge, splitting, energy conservation, piercing, independent waves, spatial hit order, appearance and pool reset');
const crystalOwner={active:true,x:5,y:0,attackTimer:0,socket:{add(){}},mesh:{updateMatrixWorld(){}}};
const crystalMesh=mesh();
const crystal=Object.assign(Object.create(UnpoCrystal.prototype),{owner:crystalOwner,scene:{attach(){}},mesh:crystalMesh,materials:[{opacity:1}],isCrystal:true,active:false});
crystal.hold();assert.equal(crystal.hp,16);assert.equal(crystal.y,UNPO_CONFIG.socketY);assert.equal(crystal.phase,'held');
assert.equal(crystal.materials[0].depthTest,false);assert.equal(crystal.mesh.renderOrder,10);
let lines=0;crystal.fire({x:-10,y:0},{say(){lines++;}});assert.equal(lines,1);assert.equal(crystal.phase,'flying');
assert.equal(crystal.materials[0].depthTest,true);assert.equal(crystal.mesh.renderOrder,0);
const chaseGame={player:{x:5,y:10},burst(){}};const initialHeading=crystal.heading;crystal.update(.1,chaseGame);assert.ok(Math.abs(crystal.heading-initialHeading)<=UNPO_CONFIG.homingTurnRate*.1+1e-8);
for(let i=0;i<Math.ceil(UNPO_CONFIG.homingDuration/.1)+1;i++)crystal.update(.1,chaseGame);const frozenVelocity=[crystal.vx,crystal.vy];chaseGame.player={x:-100,y:-100};crystal.update(.1,chaseGame);assert.deepEqual([crystal.vx,crystal.vy],frozenVelocity);
for(const reason of ['destroyed','player','terrain','offscreen']){
  crystal.deactivate(reason);assert.equal(crystal.phase,'regenerating');assert.equal(crystal.active,false);assert.equal(crystal.materials[0].opacity,0);
  assert.equal(crystal.materials[0].depthTest,false);assert.equal(crystal.mesh.renderOrder,10);
  crystal.fire(chaseGame.player,{say(){throw Error('Fired while regenerating');}});
  crystal.update(UNPO_CONFIG.regenerationDuration/2,chaseGame);assert.equal(crystal.materials[0].opacity,.5);
  crystal.update(UNPO_CONFIG.regenerationDuration/2,chaseGame);assert.equal(crystal.phase,'held');assert.equal(crystal.hp,16);assert.equal(crystal.active,true);
}
game=fixture();game.crystals=[crystal];shot=wave(crystal.x,crystal.y,16);game.hitTarget(shot,crystal);assert.equal(crystal.phase,'regenerating');assert.equal(shot.energy,0);assert.equal(game.score,0);
crystalOwner.active=false;crystal.deactivate('owner-dead');assert.equal(crystal.phase,'inactive');assert.equal(crystalMesh.visible,false);
const boss=Object.assign(Object.create(UnpoEnemy.prototype),{mesh:mesh(),visual:mesh(),crystal:{hold(){},deactivate(){}},isUnpo:true});boss.activate();assert.equal(boss.hp,256);assert.equal(boss.radius,UNPO_CONFIG.bodyRadius);
console.log('PASS: Unpo HP, independent crystal HP, launch, bounded turn, pursuit cutoff, all regeneration reasons, fade, firing lock and owner cleanup');
// A far-off target saturates steering, exposing the progressively wider turn radius.
function crystalTurnAt(age,dt=.1){
  const probe=Object.assign(Object.create(UnpoCrystal.prototype),{phase:'flying',active:true,owner:{active:true},mesh:mesh(),flightAge:age,x:0,y:0,heading:0,sparkle(){}});
  probe.updateVelocity();probe.update(dt,{player:{x:0,y:100}});return probe;
}
const earlyTurn=crystalTurnAt(0).heading,midTurn=crystalTurnAt(1).heading,lateTurn=crystalTurnAt(1.9).heading;
assert.ok(earlyTurn>midTurn&&midTurn>lateTurn&&lateTurn>0);
assert.ok(lateTurn<earlyTurn/100);
const boundary=crystalTurnAt(1.95,.2),endHeading=boundary.heading,endVelocity=[boundary.vx,boundary.vy];
boundary.update(.1,{player:{x:0,y:-100}});assert.equal(boundary.heading,endHeading);assert.deepEqual([boundary.vx,boundary.vy],endVelocity);
console.log('PASS: crystal turn radius widens smoothly, including a frame crossing pursuit end');
assert.equal(UNPO_CONFIG.homingDuration,2);
boss.update(.1,{});assert.ok(Math.abs(boss.visual.rotation.y)<=UNPO_CONFIG.bodySwayAmplitude);
const sway=boss.visual.rotation.y;boss.update(UNPO_CONFIG.bodySwayPeriod,{});assert.ok(Math.abs(boss.visual.rotation.y-sway)<1e-8);
const hpElements={'#enemy-hp':{style:{}},'#enemy-hp-value':{},'#enemy-hp-fill':{style:{}}};
context.document.querySelector=selector=>hpElements[selector];context.innerWidth=960;context.innerHeight=540;
const hud=Object.create(UI.prototype);boss.hp=128;hud.enemyHealth([boss],{left:-16,right:16,top:9,bottom:-9});assert.equal(hpElements['#enemy-hp'].hidden,false);assert.equal(hpElements['#enemy-hp-value'].textContent,'128 / 256');assert.equal(hpElements['#enemy-hp-fill'].style.width,'50%');
boss.active=false;hud.enemyHealth([boss],{});assert.equal(hpElements['#enemy-hp'].hidden,true);
console.log('PASS: two-second homing, bounded periodic Y sway, head HP percentage and hiding');
// Upgrade caps and reset behavior.
game=fixture();game.player=Object.assign(Object.create(Player.prototype),{mesh:mesh()});game.player.reset();
game.player.hp=4;game.player.pickup('energy',game);game.player.pickup('energy',game);assert.equal(game.player.hp,5);
for(let i=0;i<4;i++){game.player.pickup('wide',game);game.player.pickup('pod',game);game.player.pickup('quick',game);}assert.equal(game.player.wide,3);assert.equal(game.player.podCount,2);assert.equal(game.input.chargeMultiplier,1.5);
game.player.pickup('missile',game);assert.equal(game.player.hasMissile,true);
let fired=[];game.shoot=(...args)=>fired.push(args);game.player.update(0,{movement:{x:0,y:0},shotRequests:[1,16],chargeMs:1500},game);assert.equal(fired[0][5],1);assert.equal(fired[0][6].wide,3);assert.equal(fired[1][5],17);assert.equal(fired[1][6].green,true);
const wideBullet=Object.assign(Object.create(Bullet.prototype),{mesh:mesh(),aura:{scale:{set(){}}}});wideBullet.activate(0,0,24,0,1,{wide:3});assert.equal(wideBullet.energy,1);assert.ok(wideBullet.radius>.16);wideBullet.activate(0,0,24,0,1);assert.equal(wideBullet.radius,.16);
context.clock=0;const quickInput=Object.assign(Object.create(Input.prototype),{shotStartedAt:0,chargeMultiplier:1.5});context.clock=1000;assert.equal(quickInput.chargeMs,1500);
// Shot held for 4 seconds produces three missiles, without requiring key repeat.
game.player.missileCooldown=0;let missilesFired=0;game.shootMissile=()=>missilesFired++;const held={movement:{x:0,y:0},shotRequests:[],chargeMs:0,firing:true};game.player.update(0,held,game);game.player.update(1,held,game);game.player.update(1,held,game);game.player.update(2,held,game);assert.equal(missilesFired,3);
const missile=Object.assign(Object.create(Missile.prototype),{mesh:mesh(),aura:{scale:{set(){}}}});const lock={active:true,generation:1,x:0,y:10};missile.activate(0,0,lock,3);assert.equal(missile.vx,12);assert.equal(missile.vy,0);missile.update(.1);assert.ok(Math.abs(missile.heading)<=.4+1e-8);const heading=missile.heading;lock.generation=2;missile.update(.1);assert.equal(missile.heading,heading);
let flameScale;missile.exhaust={scale:{set(...value){flameScale=value;}}};
missile.activate(0,0,lock,3);assert.equal(missile.mesh.rotation.z,0);assert.deepEqual(flameScale,[1,1,1]);
missile.update(.1);assert.equal(missile.mesh.rotation.z,missile.heading);assert.ok(flameScale.every(v=>Number.isFinite(v)&&v>0));assert.equal(missile.radius,.22);assert.equal(missile.damage,1);
const modelMissile=new Missile(new Asset());modelMissile.activate(0,0,lock,3);
assert.equal(modelMissile.mesh.children.length,6);assert.equal(modelMissile.exhaust.children.length,2);
assert.ok(modelMissile.exhaust.position.x<0);assert.equal(modelMissile.mesh.scale.x,1);
modelMissile.update(.1);assert.ok(Number.isFinite(modelMissile.exhaust.scale.x));modelMissile.deactivate();assert.equal(modelMissile.mesh.visible,false);
game.enemies=[enemy(9,0),enemy(3,0)];game.rocks=[];game.crystals=[];let selected;game.missiles=[{active:false,activate(x,y,target,radius){selected={target,radius};}}];context.innerWidth=960;game.camera={left:-16,right:16};Game.prototype.shootMissile.call(game,0,0);assert.equal(selected.target,game.enemies[1]);assert.ok(Math.abs(selected.radius-100/30)<1e-8);
const history=new FlightHistory(0,0);history.record(2,0);history.record(2,2);const following=history.behind(1.3);assert.ok(Math.abs(following.x-2)<1e-6);assert.ok(Math.abs(following.y-.7)<1e-6);
// Exactly 1/3 threshold, five selectable types, and no drops from medium rocks.
const oldRandom=Math.random;try{let rolls=[.32,.99];Math.random=()=>rolls.shift();game.items=[{active:false,activate(x,y,type){this.type=type;}}];game.dropPowerUp({size:'large',x:0,y:0});assert.equal(game.items[0].type,'pod');rolls=[1/3];delete game.items[0].type;game.dropPowerUp({size:'large'});assert.equal(game.items[0].type,undefined);Math.random=()=>{throw Error('Medium rock rolled drop');};game.dropPowerUp({size:'medium'});}finally{Math.random=oldRandom;}
game.input.clear=()=>{};game.effects=[];game.missiles=[];game.items=[];game.start();assert.equal(game.player.wide,1);assert.equal(game.player.hasMissile,false);assert.equal(game.player.quick,false);assert.equal(game.player.podCount,0);assert.equal(game.input.chargeMultiplier,1);
console.log('PASS: item drop threshold/types, HP and upgrade caps, wide damage, quick timing/power/color, missile cooldown/lock/radius, pod path and restart reset');
game.player.hasMissile=true;game.player.missileCooldown=0;let tapMissiles=0;game.shootMissile=()=>tapMissiles++;game.player.update(0,{movement:{x:0,y:0},shotRequests:[1],chargeMs:0,firing:false},game);assert.equal(tapMissiles,1);
console.log('PASS: brief Shot tap launches a missile even when released before next frame');

// Lethal enemy hits use warm explosions; nonlethal hits retain shot colors.
game=fixture();const particles=[],sounds=[];
game.burst=(x,y,color,options)=>particles.push({x,y,color,options});game.audio={effect:(kind)=>sounds.push(kind)};
target=enemy(1,2,2);game.hitTarget(wave(1,2,1),target);
assert.equal(particles[0].color,0x8effff);assert.equal(sounds.pop(),'hit');particles.length=0;
game.hitTarget(wave(1,2,1),target);assert.equal(sounds.pop(),'explosion');
assert.equal(particles[0].color,0xff481b);assert.equal(particles[1].color,0xffa12b);assert.equal(game.score,100);
particles.length=0;const deathLines=[];game.ui.say=(...args)=>deathLines.push(args);target=Object.assign(enemy(3,4,1),{isUnpo:true,scoreValue:2000});
game.hitTarget(wave(3,4,16),target);assert.equal(sounds.pop(),'bossExplosion');assert.equal(game.score,2100);
assert.deepEqual(deathLines[0],['くわっすーぅ！！ぅう……んこ…！！',4]);
assert.equal(game.explosionWaves.length,5);assert.equal(particles[0].options.count,32);
game.effects=[];game.updateEffects(.17);assert.equal(game.explosionWaves.length,4);
game.updateEffects(1);assert.equal(game.explosionWaves.length,0);
// Pool reuse resets duration/drag/growth and particles fade without invalid values.
const effect={mesh:{position:{set(x,y){this.x=x;this.y=y;}},scale:{setScalar(){},multiplyScalar(){}},material:{color:{setHex(){}}}},life:0};
game=fixture();game.effects=[effect];Game.prototype.burst.call(game,0,0,0xff481b,{life:1,drag:2,growth:3});
game.updateEffects(.2);assert.ok(effect.mesh.material.opacity>0&&effect.mesh.material.opacity<1);
game.updateEffects(2);assert.equal(effect.mesh.visible,false);
Game.prototype.burst.call(game,0,0,0xffffff);assert.equal(effect.drag,0);assert.equal(effect.growth,0);
console.log('PASS: warm enemy explosions, distinct boss sound, multi-stage boss burst, unchanged score, particle fade and pool reset');

// Crystal visual spin slows smoothly, finishes upright, and doesn't alter guidance.
crystalOwner.active=true;crystal.hold();crystal.deactivate('destroyed');
const rotationSteps=[];let previousRotation=0;
for(let i=0;i<7;i++){crystal.update(UNPO_CONFIG.regenerationDuration/8,chaseGame);rotationSteps.push(crystal.mesh.rotation.y-previousRotation);previousRotation=crystal.mesh.rotation.y;}
for(let i=1;i<rotationSteps.length;i++)assert.ok(rotationSteps[i]>0&&rotationSteps[i]<rotationSteps[i-1]);
crystal.update(UNPO_CONFIG.regenerationDuration/8,chaseGame);assert.equal(crystal.mesh.rotation.y,0);assert.equal(crystal.phase,'held');
crystal.update(.5,chaseGame);assert.equal(crystal.mesh.rotation.y,0);
crystal.fire({x:-10,y:0},{say(){}});crystal.update(.25,chaseGame);
assert.ok(Math.abs(crystal.mesh.rotation.y-UNPO_CONFIG.projectileSpinRate*.25)<1e-9);
// Every real disappearance emits once at the old location, never at the respawn socket.
const brownBursts=[],particleGame={burst:(x,y,color)=>brownBursts.push({x,y,color}),player:{x:-10,y:0}};
for(const reason of ['destroyed','player','terrain','offscreen','owner-dead']){
  crystal.hold();crystal.fire(particleGame.player,{say(){}});crystal.x=-3;crystal.y=-2;
  const count=brownBursts.length;crystal.deactivate(reason,particleGame);
  assert.equal(brownBursts.length,count+1);assert.equal(brownBursts.at(-1).x,-3);assert.equal(brownBursts.at(-1).y,-2);assert.equal(brownBursts.at(-1).color,UNPO_CONFIG.crystalParticleColor);
  crystal.deactivate(reason,particleGame);assert.equal(brownBursts.length,count+1);
}
crystal.hold();const count=brownBursts.length;crystal.deactivate('reset',particleGame);assert.equal(brownBursts.length,count);
crystal.hold();crystal.fire(particleGame.player,{say(){}});crystal.x=20;crystal.update(.01,particleGame);assert.equal(crystal.phase,'regenerating');assert.equal(brownBursts.length,count+1);
console.log('PASS: eased regeneration spin, zero finish rotation, slow flight spin, brown particles at disappearance, no duplicate/reset particles');

// A cached pre-spin config must never turn the Object3D rotation into NaN.
const savedTurns=UNPO_CONFIG.regenerationSpinTurns,savedRate=UNPO_CONFIG.projectileSpinRate;
try{
  delete UNPO_CONFIG.regenerationSpinTurns;delete UNPO_CONFIG.projectileSpinRate;
  crystal.hold();crystal.deactivate('destroyed');crystal.update(.25,chaseGame);
  assert.ok(Number.isFinite(crystal.mesh.rotation.y),'Regenerating crystal rotation must remain finite with an older config');
  crystal.update(UNPO_CONFIG.regenerationDuration,chaseGame);crystal.fire(chaseGame.player,{say(){}});crystal.update(.1,chaseGame);
  assert.ok(Number.isFinite(crystal.mesh.rotation.y),'Flying crystal rotation must remain finite with an older config');
  assert.equal(crystal.phase,'flying');assert.equal(crystal.active,true);assert.equal(crystal.mesh.visible,true);
}finally{UNPO_CONFIG.regenerationSpinTurns=savedTurns;UNPO_CONFIG.projectileSpinRate=savedRate;}
console.log('PASS: cached pre-spin configuration keeps regeneration and flight rotation finite and projectile visible');

// Regeneration multiplies the material's intrinsic alpha instead of erasing translucency.
crystal.materials[0].userData={crystalOpacity:.78};crystal.hold();assert.equal(crystal.materials[0].opacity,.78);
crystal.deactivate('destroyed');crystal.update(UNPO_CONFIG.regenerationDuration/2,chaseGame);assert.equal(crystal.materials[0].opacity,.39);
crystal.update(UNPO_CONFIG.regenerationDuration/2,chaseGame);assert.equal(crystal.materials[0].opacity,.78);assert.equal(crystal.materials[0].depthWrite,false);
// Surface sparkles are sparse, located in model world space, and follow visibility.
const sparkles=[];crystal.surfacePoints=[{}];crystal.sparkPosition={copy(){return this;}};crystal.surfaceSparkTimer=0;
crystal.mesh.updateWorldMatrix=()=>{};crystal.mesh.localToWorld=p=>{p.x=crystal.x+.1;p.y=crystal.y+.2;p.z=.3;};
const sparkleGame={burst:(x,y,color,options)=>sparkles.push({x,y,color,options})};
crystal.sparkle(.01,sparkleGame,.5);assert.equal(sparkles.length,1);assert.equal(sparkles[0].options.count,1);assert.equal(sparkles[0].options.opacity,.5);assert.equal(sparkles[0].options.z,.325);assert.equal(sparkles[0].color,UNPO_CONFIG.crystalSparkleColor);
crystal.sparkle(.01,sparkleGame);assert.equal(sparkles.length,1);
crystal.sparkle(1,sparkleGame,0);assert.equal(sparkles.length,1);
console.log('PASS: intrinsic crystal translucency survives regeneration, sparse surface sparkles track model space and fade visibility');

// Exercise the actual keyboard handlers, including repeat after pause/reset clear().
const keyboard=Object.assign(Object.create(Input.prototype),{keys:new Set(),firePointers:new Set(),shotRequests:[],shotStartedAt:null,stick:{x:0,y:0},knob:{style:{}},fireButton:{classList:{remove(){}}}});
let prevented=0;const keyEvent=(code,repeat=false)=>({code,repeat,preventDefault(){prevented++;}});
context.clock=0;keyboard.keyDown(keyEvent('Space'));assert.equal(keyboard.shotRequests.length,1);
context.clock=500;keyboard.keyDown(keyEvent('Space',true));keyboard.keyDown(keyEvent('Space'));assert.equal(keyboard.shotRequests.length,1);assert.equal(keyboard.shotStartedAt,0);
context.clock=1500;keyboard.keyUp(keyEvent('Space'));assert.equal(keyboard.shotRequests[1],16);assert.equal(keyboard.firing,false);
keyboard.keyDown(keyEvent('KeyD'));keyboard.keyDown(keyEvent('KeyD',true));assert.equal(keyboard.movement.x,1);
keyboard.clear();keyboard.keyDown(keyEvent('KeyD',true));keyboard.keyDown(keyEvent('Space',true));assert.equal(keyboard.movement.x,0);assert.equal(keyboard.firing,false);assert.equal(keyboard.shotRequests.length,0);assert.equal(keyboard.shotStartedAt,null);
keyboard.keyUp(keyEvent('Space'));assert.equal(keyboard.shotRequests.length,0);
keyboard.keyDown(keyEvent('Space'));assert.equal(keyboard.shotRequests.length,1);assert.equal(keyboard.firing,true);assert.ok(prevented>=5);
console.log('PASS: keyboard repeat ignored, hold movement/charge preserved, no phantom presses after clear, release and repress works');
