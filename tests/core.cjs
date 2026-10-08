// Exercise real game logic without a browser/WebGL dependency.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
class Asset {
  constructor(...args){this.args=args;this.children=[];const vector=()=>({x:0,y:0,z:0,set(x,y,z){Object.assign(this,{x,y,z});}});this.position=vector();this.rotation=vector();this.scale=vector();}
  add(...children){this.children.push(...children);}
  clear(){this.children=[];}
  setAttribute(){}
  computeVertexNormals(){}
}
const THREE = new Proxy({}, {get:(_,name)=>name==='MathUtils'?{lerp:(a,b,t)=>a+(b-a)*t}:Asset});
const source=fs.readFileSync(require('node:path').join(__dirname,'../game.js'),'utf8')
  .replace(/^import .*;$/gm,'').split('// Finish loading')[0];
const context=vm.createContext({THREE,Math,document:{},performance:{now:()=>context.clock??0}});
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../unpoConfig.js'),'utf8').replace('export const','const')+fs.readFileSync(require('node:path').join(__dirname,'../stage2Data.js'),'utf8').replace('export const','const')+fs.readFileSync(require('node:path').join(__dirname,'../terrain.js'),'utf8').replace(/^import .*;$/gm,'').replace(/export /g,'')+source+'\nglobalThis.logic={Game,UI,Player,Bullet,Missile,FlightHistory,POWER_UPS,Enemy,UnpoEnemy,UnpoCrystal,UNPO_CONFIG,Rock,Input,chargeDamage,splitVelocity,bulletHits,overlap,OrbitOrb,ORB_CONFIG,relativeHitTime,Terrain,terrainHitTime,STAGE2_DATA,STAGE_CONFIG,Turret,BattleshipEnemy,BossWave,polygonHitTime,hitTime,YellowFog,FOG_CONFIG};',context);
const {Game,UI,Player,Bullet,Missile,FlightHistory,POWER_UPS,Enemy,UnpoEnemy,UnpoCrystal,UNPO_CONFIG,Rock,Input,chargeDamage,splitVelocity,bulletHits,overlap,OrbitOrb,ORB_CONFIG,relativeHitTime,Terrain,terrainHitTime,STAGE2_DATA,STAGE_CONFIG,Turret,BattleshipEnemy,BossWave,polygonHitTime,hitTime,YellowFog,FOG_CONFIG}=context.logic;
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
// Rage is sampled at launch: each of the five pooled crystals owns its flight settings.
const rageBoss=Object.assign(Object.create(UnpoEnemy.prototype),{mesh:{...mesh(),updateMatrixWorld(){}},visual:mesh(),socket:{add(){}}});
const rageCrystal=copy=>Object.assign(Object.create(UnpoCrystal.prototype),{owner:rageBoss,scene:{attach(){}},mesh:mesh(),materials:[{opacity:.78}],phase:'inactive',active:false,volleyCopy:copy,sparkle(){}});
rageBoss.crystal=rageCrystal(false);rageBoss.crystals=[rageBoss.crystal,...Array.from({length:UNPO_CONFIG.rageShotCount-1},()=>rageCrystal(true))];rageBoss.activate();
let rageLines=0,rageSounds=0;
const rageGame={player:{x:-10,y:0},ui:{say(){rageLines++;}},audio:{effect(){rageSounds++;}},burst(){}};
rageBoss.hp=129;rageBoss.attack(rageGame);
assert.equal(rageBoss.crystals.filter(c=>c.active).length,1);assert.equal(rageBoss.crystal.speed,6);assert.equal(rageBoss.crystal.homingDuration,2);
rageBoss.hp=128;assert.equal(rageBoss.crystal.speed,6); // Existing shots do not suddenly accelerate.
rageBoss.crystal.deactivate('reset');rageBoss.crystal.hold();rageLines=rageSounds=0;rageBoss.attack(rageGame);
assert.equal(rageLines,1);assert.equal(rageSounds,1);
assert.equal(rageBoss.crystals.length,5);
for(const c of rageBoss.crystals){assert.equal(c.phase,'flying');assert.equal(c.hp,16);assert.equal(c.speed,9);assert.equal(c.homingDuration,3);assert.ok(Math.abs(Math.hypot(c.vx,c.vy)-9)<1e-8);}
assert.ok(Math.abs(rageBoss.crystals[0].heading-Math.PI)<1e-8);
for(const [i,offset] of [[1,-Math.PI/8],[2,Math.PI/8],[3,-Math.PI/4],[4,Math.PI/4]])assert.ok(Math.abs(rageBoss.crystals[i].heading-Math.PI-offset)<1e-8);
assert.ok(rageBoss.crystals[1].vy>0&&rageBoss.crystals[3].vy>0);assert.ok(rageBoss.crystals[2].vy<0&&rageBoss.crystals[4].vy<0);
game=fixture();game.crystals=rageBoss.crystals;game.separateCrystals();
assert.ok(rageBoss.crystals.every(c=>Number.isFinite(c.separationX)&&Number.isFinite(c.separationY)&&Math.hypot(c.separationX,c.separationY)<=UNPO_CONFIG.separationStrength+1e-8));
game=fixture();const sideCrystal=rageBoss.crystals[1];game.hitTarget(wave(sideCrystal.x,sideCrystal.y,4),sideCrystal);
assert.equal(sideCrystal.hp,12);assert.equal(rageBoss.crystal.hp,16);assert.equal(rageBoss.crystals[2].hp,16);
sideCrystal.x=0;sideCrystal.y=0;sideCrystal.heading=0;sideCrystal.flightAge=2.2;sideCrystal.updateVelocity();
sideCrystal.update(.1,{...rageGame,player:{x:0,y:100}});assert.ok(sideCrystal.heading>0); // Still steering beyond two seconds.
sideCrystal.flightAge=2.95;sideCrystal.update(.1,{...rageGame,player:{x:0,y:100}});
const rageVelocity=[sideCrystal.vx,sideCrystal.vy];sideCrystal.update(.1,{...rageGame,player:{x:0,y:-100}});assert.deepEqual([sideCrystal.vx,sideCrystal.vy],rageVelocity);
sideCrystal.deactivate('terrain',rageGame);assert.equal(sideCrystal.phase,'inactive');
rageBoss.crystal.deactivate('destroyed',rageGame);assert.equal(rageBoss.crystal.phase,'regenerating');
rageBoss.crystal.hold();rageBoss.attackTimer=0;rageBoss.update(.01,rageGame);assert.equal(rageBoss.crystal.phase,'held'); // Never overwrite a side shot still in flight.
rageBoss.deactivate(rageGame);assert.ok(rageBoss.crystals.every(c=>!c.active&&c.phase==='inactive'&&!c.mesh.visible));
rageBoss.activate();assert.equal(rageBoss.hp,256);assert.ok(rageBoss.crystals.slice(1).every(c=>!c.active));rageBoss.attack(rageGame);assert.equal(rageBoss.crystal.speed,6);assert.equal(rageBoss.crystal.homingDuration,2);
console.log('PASS: rage threshold, five launches at 0/22.5/45 degrees, bounded separation, independent damage/speed/homing, cutoff, pool safety and boss reset');
// Separation uses the same positional snapshot for all shots and remains bounded.
const flockOwner={active:true};
const flock=[.2,-.2,4].map(y=>Object.assign(Object.create(UnpoCrystal.prototype),{owner:flockOwner,mesh:mesh(),active:true,phase:'flying',flightAge:0,homingDuration:3,speed:9,x:0,y,heading:Math.PI,sparkle(){}}));
game=fixture();game.crystals=flock;flock.forEach(c=>c.updateVelocity());game.separateCrystals();
assert.ok(flock[0].separationY>0&&flock[1].separationY<0);assert.equal(flock[2].separationY,0);
const forces=flock.map(c=>[c.separationX,c.separationY]);game.crystals=[...flock].reverse();game.separateCrystals();
flock.forEach((c,i)=>assert.deepEqual([c.separationX,c.separationY],forces[i]));
flock.forEach(c=>c.update(.1,game));assert.ok(flock[0].y>.2&&flock[1].y<-.2);
flock.forEach(c=>assert.ok(Math.abs(Math.hypot(c.vx,c.vy)-9)<1e-8));
flock.forEach((c,i)=>{c.x=0;c.y=0;c.heading=[Math.PI,Math.PI*.75,Math.PI*1.25][i];c.updateVelocity();});game.separateCrystals();
flock.forEach(c=>assert.ok(Number.isFinite(c.separationX)&&Number.isFinite(c.separationY)&&Math.hypot(c.separationX,c.separationY)<=UNPO_CONFIG.separationStrength+1e-8));
flock.forEach(c=>c.flightAge=3);game.separateCrystals();assert.ok(flock.every(c=>c.separationX===0&&c.separationY===0));
console.log('PASS: close crystal separation, frame-order independence, speed conservation, overlap fallback and pursuit cutoff');
// Upgrade caps and reset behavior.
game=fixture();game.player=Object.assign(Object.create(Player.prototype),{mesh:mesh()});game.player.reset();
game.player.hp=4;game.player.pickup('energy',game);game.player.pickup('energy',game);assert.equal(game.player.hp,5);
for(let i=0;i<4;i++){game.player.pickup('wide',game);game.player.pickup('pod',game);game.player.pickup('quick',game);}assert.equal(game.player.wide,3);assert.equal(game.player.podCount,2);assert.equal(game.input.chargeMultiplier,1.5);
game.player.pickup('missile',game);assert.equal(game.player.hasMissile,true);
let fired=[];game.shoot=(...args)=>fired.push(args);game.player.update(0,{movement:{x:0,y:0},shotRequests:[1,16],chargeMs:1500},game);assert.equal(fired[0][5],1);assert.equal(fired[0][6].wide,3);assert.equal(fired[1][5],17);assert.equal(fired[1][6].green,true);
const wideBullet=Object.assign(Object.create(Bullet.prototype),{mesh:mesh(),aura:{scale:{set(){}}}});wideBullet.activate(0,0,24,0,1,{wide:3});assert.equal(wideBullet.energy,1);assert.ok(wideBullet.radius>.16);wideBullet.activate(0,0,24,0,1);assert.equal(wideBullet.radius,.16);
context.clock=0;const quickInput=Object.assign(Object.create(Input.prototype),{shotStartedAt:0,chargeMultiplier:1.5});context.clock=1000;assert.equal(quickInput.chargeMs,1500);
for(const [quick,milliseconds,expected] of [[true,133,null],[true,199,null],[true,200,3],[true,1000,16],[false,199,null],[false,200,2]]){
  const control=Object.assign(Object.create(Input.prototype),{keys:new Set(),firePointers:new Set(),shotRequests:[],shotStartedAt:null,chargeMultiplier:quick?1.5:1});
  context.clock=0;control.keys.add('Space');control.shotChanged(false);assert.equal(control.shotRequests.shift(),1);
  context.clock=milliseconds;assert.equal(control.heldMs,milliseconds);control.keys.delete('Space');control.shotChanged(true);
  if(expected===null)assert.equal(control.shotRequests.length,0);else assert.equal(control.shotRequests.shift(),expected);
}
console.log('PASS: actual 200ms minimum for normal/quick charge, accelerated power and 1000ms quick maximum');
// Shot held for 4 seconds produces three missiles, without requiring key repeat.
game.player.missileCooldown=0;let missilesFired=0;game.shootMissile=()=>missilesFired++;const held={movement:{x:0,y:0},shotRequests:[],chargeMs:0,firing:true};game.player.update(0,held,game);game.player.update(1,held,game);game.player.update(1,held,game);game.player.update(2,held,game);assert.equal(missilesFired,3);
const missile=Object.assign(Object.create(Missile.prototype),{mesh:mesh(),aura:{scale:{set(){}}}});const lock={active:true,generation:1,x:0,y:10};missile.activate(0,0,lock,3);assert.equal(missile.vx,12);assert.equal(missile.vy,0);missile.update(.1);assert.ok(Math.abs(missile.heading)<=.4+1e-8);const heading=missile.heading;lock.generation=2;missile.update(.1);assert.equal(missile.heading,heading);
let flameScale;missile.exhaust={scale:{set(...value){flameScale=value;}}};
missile.activate(0,0,lock,3);assert.equal(missile.mesh.rotation.z,0);assert.deepEqual(flameScale,[1,1,1]);
missile.update(.1);assert.equal(missile.mesh.rotation.z,missile.heading);assert.ok(flameScale.every(v=>Number.isFinite(v)&&v>0));assert.equal(missile.radius,.22);assert.equal(missile.damage,2);assert.equal(missile.isWave,false);
const modelMissile=new Missile(new Asset());modelMissile.activate(0,0,lock,3);
assert.equal(modelMissile.mesh.children.length,6);assert.equal(modelMissile.exhaust.children.length,2);
assert.ok(modelMissile.exhaust.position.x<0);assert.equal(modelMissile.mesh.scale.x,1);
modelMissile.update(.1);assert.ok(Number.isFinite(modelMissile.exhaust.scale.x));modelMissile.deactivate();assert.equal(modelMissile.mesh.visible,false);
game.enemies=[enemy(9,0),enemy(3,0)];game.rocks=[];game.crystals=[];let selected;game.missiles=[{active:false,activate(x,y,target,radius){selected={target,radius};}}];context.innerWidth=960;game.camera={left:-16,right:16,top:9,bottom:-9};Game.prototype.shootMissile.call(game,0,0);assert.equal(selected.target,game.enemies[1]);assert.ok(Math.abs(selected.radius-100/30)<1e-8);
const history=new FlightHistory(0,0);history.record(2,0);history.record(2,2);const following=history.behind(1.3);assert.ok(Math.abs(following.x-2)<1e-6);assert.ok(Math.abs(following.y-.7)<1e-6);
// Exactly 1/3 threshold, five selectable types, and no drops from medium rocks.
const oldRandom=Math.random;try{let rolls=[.32,.99];Math.random=()=>rolls.shift();game.items=[{active:false,activate(x,y,type){this.type=type;}}];game.dropPowerUp({size:'large',x:0,y:0});assert.equal(game.items[0].type,'pod');rolls=[1/3];delete game.items[0].type;game.dropPowerUp({size:'large'});assert.equal(game.items[0].type,undefined);Math.random=()=>{throw Error('Medium rock rolled drop');};game.dropPowerUp({size:'medium'});}finally{Math.random=oldRandom;}
game.input.clear=()=>{};game.effects=[];game.missiles=[];game.items=[];game.start();assert.equal(game.player.wide,1);assert.equal(game.player.hasMissile,false);assert.equal(game.player.quick,false);assert.equal(game.player.podCount,0);assert.equal(game.input.chargeMultiplier,1);
console.log('PASS: item drop threshold/types, HP and upgrade caps, wide damage, quick timing/power/color, missile cooldown/lock/radius, pod path and restart reset');
game.player.hasMissile=true;game.player.missileCooldown=0;let tapMissiles=0;game.shootMissile=()=>tapMissiles++;game.player.update(0,{movement:{x:0,y:0},shotRequests:[1],chargeMs:0,firing:false},game);assert.equal(tapMissiles,1);
console.log('PASS: brief Shot tap launches a missile even when released before next frame');
// Two pickups: two launches at +/-30 degrees every second; extra pickups are capped.
game=fixture();game.player=Object.assign(Object.create(Player.prototype),{mesh:mesh()});game.player.reset();game.shoot=()=>{};
game.player.pickup('missile',game);assert.equal(game.player.missileLevel,1);game.player.missileCooldown=2;
game.player.pickup('missile',game);game.player.pickup('missile',game);assert.equal(game.player.missileLevel,2);assert.equal(game.player.missileCooldown,1);
const doubleLaunches=[];game.shootMissile=(...args)=>doubleLaunches.push(args);game.player.missileCooldown=0;
game.player.update(0,held,game);game.player.update(.5,held,game);assert.equal(doubleLaunches.length,2);
game.player.update(.5,held,game);game.player.update(1,held,game);assert.equal(doubleLaunches.length,6);
for(let i=0;i<doubleLaunches.length;i+=2){assert.equal(doubleLaunches[i][2],Math.PI/6);assert.equal(doubleLaunches[i][3],1);assert.equal(doubleLaunches[i+1][2],-Math.PI/6);assert.equal(doubleLaunches[i+1][3],-1);}
game.player.x=-4;game.player.y=2;game.camera={left:-16,right:16,bottom:-9,top:9};context.innerWidth=960;
const upper=enemy(10,3),lower=enemy(-3,1),level=enemy(-4,2),offscreen=enemy(-4,10);
game.enemies=[lower,level,upper,offscreen];game.crystals=[];game.missiles=[{active:false,activate(x,y,target,radius,heading){selected={target,heading};}}];
Game.prototype.shootMissile.call(game,-3,2,Math.PI/6,1);assert.equal(selected.target,upper);
Game.prototype.shootMissile.call(game,-3,2,-Math.PI/6,-1);assert.equal(selected.target,lower);
game.enemies=[lower,level,offscreen];Game.prototype.shootMissile.call(game,-3,2,Math.PI/6,1);assert.equal(selected.target,level);
game.enemies=[];Game.prototype.shootMissile.call(game,-3,2,-Math.PI/6,-1);assert.equal(selected.target,null);
missile.activate(0,0,null,3,Math.PI/6);assert.ok(missile.vy>0);assert.equal(missile.mesh.rotation.z,Math.PI/6);missile.update(.1);assert.equal(missile.heading,Math.PI/6);
game.player.reset();assert.equal(game.player.missileLevel,0);assert.equal(game.player.hasMissile,false);
console.log('PASS: double missile cap/cadence, opposite launch angles, player-relative targets, on-screen fallback and no-target flight');
for(const [hp,remaining] of [[2,0],[3,1],[1,-1]]){
  game=fixture();const victim=enemy(0,0,hp);game.enemies=[victim];missile.activate(0,0,victim,3);game.hitTarget(missile,victim);
  assert.equal(victim.hp,Math.max(0,remaining));assert.equal(victim.active,hp>2);assert.equal(missile.active,false);
}
console.log('PASS: missile damage 2, one-hit HP2 kill, HP3 survival and no piercing through weaker targets');

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

// One probability trial per completed second, never per rendered frame.
const rolling=Object.assign(Object.create(UnpoCrystal.prototype),{owner:{active:true},mesh:mesh(),phase:'flying',active:true,flightAge:0,heading:0,speed:0,x:0,y:0,sparkle(){},bulletRollAge:0});
rolling.updateVelocity();let shots=[],trials=0;
const firingGame={player:{x:-10,y:5},shoot:(...args)=>shots.push(args),burst(){}};
const randomBefore=Math.random;
try{
  Math.random=()=>{trials++;return trials===1?.199:.2;};
  for(let i=0;i<59;i++)rolling.update(1/60,firingGame);assert.equal(trials,0);
  rolling.update(1/60,firingGame);assert.equal(trials,1);assert.equal(shots.length,1);
  for(let i=0;i<60;i++)rolling.update(1/60,firingGame);assert.equal(trials,2);assert.equal(shots.length,1);
  assert.equal(shots[0][4],true);assert.equal(shots[0][5],1);assert.equal(shots[0][6].brown,true);assert.ok(Math.abs(Math.hypot(shots[0][2],shots[0][3])-8)<1e-8);
  rolling.phase='inactive';rolling.update(2,firingGame);assert.equal(trials,2);
}finally{Math.random=randomBefore;}
const colored=new Bullet(new Asset(),true);colored.activate(0,0,8,0,1,{brown:true});const brownMaterial=colored.core.material;
colored.deactivate();colored.activate(0,0,8,0);assert.equal(colored.brown,false);assert.notEqual(colored.core.material,brownMaterial);
console.log('PASS: 20-percent per-second crystal rolls, aimed speed/damage, inactive silence and pooled brown/red appearance');

// Enemy projectiles share the wave's spatial ordering and cost exactly one energy.
game=fixture();shot=wave(8,0,4);shot.previousX=-8;game.bullets=[shot];game.enemyBullets=[bullet(-2,0)];game.enemies=[enemy(2,0,3)];game.update(0);
assert.equal(game.enemyBullets[0].active,false);assert.equal(game.enemies[0].active,false);assert.equal(shot.energy,0);
game=fixture();shot=wave(8,0,2);shot.previousX=-8;game.bullets=[shot];game.enemies=[enemy(-2,0,2)];game.enemyBullets=[bullet(2,0)];game.update(0);assert.equal(game.enemyBullets[0].active,true);
game=fixture();const waveA=wave(1,0,3),waveB=wave(1,0,3);waveA.previousX=waveB.previousX=-1;game.bullets=[waveA,waveB];game.enemyBullets=[bullet(0,0)];game.update(0);assert.equal(waveA.energy,2);assert.equal(waveB.energy,3);
game=fixture();game.bullets=[bullet(0,0)];game.enemyBullets=[bullet(0,0)];game.update(0);assert.equal(game.enemyBullets[0].active,true);
assert.ok(Number.isFinite(relativeHitTime({previousX:-4,previousY:0,x:4,y:0,radius:.2},{previousX:4,previousY:0,x:-4,y:0,radius:.2})));
console.log('PASS: wave interception, enemy/shot ordering, independent energy, moving crossings and normal-shot exclusion');

// Drops happen only through lethal HP damage, using the crystal's pre-regeneration position.
game=fixture();let dropCalls=[];game.items=[{active:false,activate(x,y,type){dropCalls.push([x,y,type]);}}];
try{
  Math.random=()=>.099;const dropTarget={...enemy(3,4),isCrystal:true,deactivate(){this.active=false;this.x=99;}};
  game.damageTarget(dropTarget,1);assert.deepEqual(dropCalls,[[3,4,'orb']]);game.damageTarget(dropTarget,1);assert.equal(dropCalls.length,1);
  Math.random=()=>.1;game.damageTarget({...enemy(3,4),isCrystal:true},1);assert.equal(dropCalls.length,1);
}finally{Math.random=randomBefore;}
console.log('PASS: ten-percent crystal HP-kill drop, boundary, no duplicate and original-position pickup');

function orbFixture(){const g=fixture();g.camera={left:-16,right:16,top:9,bottom:-9};g.player.x=g.player.y=0;g.player.previousX=g.player.previousY=0;g.orb=new OrbitOrb(new Asset());g.orb.equip();return g;}
context.innerWidth=1000;
for(const fps of [30,60,120]){
  game=orbFixture();const victim={...enemy(0,0,100),radius:10};game.enemies=[victim];game.orb.update(0,game);assert.equal(victim.hp,99);
  for(let i=0;i<fps*.6;i++)game.orb.update(1/fps,game);assert.equal(victim.hp,87);
  assert.ok(Math.abs(Math.hypot(game.orb.x,game.orb.y)-1.6)<1e-8);
}
game=orbFixture();game.orb.update(.5,game);assert.ok(Math.abs(game.orb.angle)<1e-8); // Two rotations per second.
game=orbFixture();game.enemies=[{...enemy(0,0,10),radius:10},{...enemy(0,0,10),radius:10}];game.orb.update(0,game);game.orb.update(.05,game);assert.ok(game.enemies.every(e=>e.hp===8));
game.enemies[0].generation=2;game.enemies[0].hp=10;game.orb.update(0,game);assert.equal(game.enemies[0].hp,9);
game.enemies[0].x=100;game.orb.update(.01,game);assert.equal(game.orb.contacts.has(game.enemies[0]),false);
game=orbFixture();const arcBullet={...bullet(1.6*Math.cos(.25),1.6*Math.sin(.25)),radius:.02};game.enemyBullets=[arcBullet,bullet(-1.6,0)];game.orb.update(.04,game);assert.equal(arcBullet.active,false);assert.equal(game.enemyBullets[1].active,true);
game=orbFixture();game.enemyBullets=[{...bullet(2,0),update(){this.previousX=2;this.previousY=0;this.x=-2;}}];game.update(.04);assert.equal(game.player.hp,5);assert.equal(game.enemyBullets[0].active,false);
game=orbFixture();game.player=Object.assign(Object.create(Player.prototype),{mesh:mesh()});game.player.reset();game.player.pickup('orb',game);game.orb.update(.1,game);const savedAngle=game.orb.angle;game.player.pickup('orb',game);assert.equal(game.orb.angle,savedAngle);
game.input.clear=()=>{};game.effects=[];game.start();assert.equal(game.player.hasOrb,false);assert.equal(game.orb.active,false);assert.equal(game.orb.contacts.size,0);
console.log('PASS: 50px orbit, 2Hz rotation, 50ms contact damage at 30/60/120fps, independent targets, swept protection, unique equipment and restart reset');
// Stage 2: stored terrain, swept collisions and missile interception.
assert.equal(STAGE2_DATA.sections.length,64);
STAGE2_DATA.sections.forEach((section,i)=>{assert.ok(section.top-section.bottom>=6);if(i){const previous=STAGE2_DATA.sections[i-1];assert.ok(Math.min(previous.top,section.top)-Math.max(previous.bottom,section.bottom)>1.6);}});
const rect={left:0,right:4,bottom:1,top:10,previousLeft:0};
assert.equal(terrainHitTime({x:2,y:0,radius:.2},rect),Infinity);
assert.ok(Number.isFinite(terrainHitTime({previousX:-2,previousY:2,x:6,y:2,radius:.2},rect)));
const terrain=new Terrain({add(){}});terrain.update(50);assert.ok(terrain.colliders.length>0);assert.ok(terrain.colliders.length<terrain.walls.length);
let gap=terrain.gapAt(-5);const terrainPlayer={x:-5,y:8,radius:.48,mesh:mesh()};assert.equal(terrain.resolvePlayer(terrainPlayer),true);assert.ok(terrainPlayer.y<=gap.top-.48);terrain.reset();assert.equal(terrain.hitTime(terrainPlayer),Infinity);
for(const isWave of [false,true]){game=fixture();game.terrain={hitTime:()=>.1,resolvePlayer:()=>false};const wave={...bullet(0,0),isWave,damage:16,energy:16,previousX:-2,previousY:0,updateAppearance(){}};game.bullets=[wave];game.enemies=[enemy(1,0,4)];game.update(.01);assert.equal(game.enemies[0].hp,4);assert.equal(wave.active,false);}
game=fixture();const hostile=Object.assign(Object.create(Missile.prototype),{hostile:true,mesh:mesh()});hostile.activate(0,0,game.player,3,Math.PI);assert.equal(hostile.hp,1);assert.equal(hostile.speed,6);hostile.update(.1);assert.ok(Math.abs(Math.hypot(hostile.vx,hostile.vy)-6)<1e-9);assert.ok(hostile.x<0);
game=fixture();game.enemyShots=[{...bullet(0,0),isEnemyMissile:true,hp:1}];game.bullets=[bullet(0,0)];game.update(.01);assert.equal(game.enemyShots[0].active,false);assert.equal(game.bullets[0].active,false);assert.equal(game.player.hp,5);
game=fixture();game.terrain={hitTime:()=>0,resolvePlayer:()=>false};game.enemyShots=[bullet(-10,0)];game.update(.01);assert.equal(game.player.hp,5);assert.equal(game.enemyShots[0].active,false);
console.log('PASS: pre-generated connected terrain, swept wall interception, player correction, HP1 enemy missiles at half speed and normal-shot interception');
// Clear sequence preserves equipment and freezes damage while the world fades.
game=fixture();game.stage=1;game.input.clear=()=>{};game.player.history={record(){}};game.updatePods=()=>{};game.transition={phase:'delay',time:0,nextStage:2};
assert.equal(game.updateTransition(3.99),false);assert.equal(game.transitionShield,undefined);
assert.equal(game.updateTransition(.01),true);assert.equal(game.transitionShield,true);game.player.damage(game);assert.equal(game.player.hp,5);
game.player.wide=3;game.player.podCount=2;game.player.hasOrb=true;game.player.hp=3;game.score=1234;game.terrain={update(){},reset(){}};game.effects=[];game.beginStage2();assert.equal(game.stage,2);assert.equal(game.player.wide,3);assert.equal(game.player.hp,3);assert.equal(game.score,1234);assert.equal(game.player.podCount,2);assert.equal(game.player.hasOrb,true);
game.transition={phase:'in',time:0};game.updateTransition(STAGE_CONFIG.fadeDuration);assert.equal(game.transition,null);assert.equal(game.transitionShield,false);assert.equal(game.fadeAmount,0);
game.effects=[];game.player.reset=Player.prototype.reset;game.start();assert.equal(game.stage,1);assert.equal(game.player.hp,5);assert.equal(game.transitionShield,false);
game=fixture();game.stage=1;const killedBoss={...enemy(0,0,1),isUnpo:true};game.enemies=[killedBoss];game.damageTarget(killedBoss,1);assert.equal(game.transition.nextStage,2);
game=fixture();game.stage=2;const killedShip={...enemy(0,0,1),isUnpo:true,isStage2Boss:true};game.enemies=[killedShip];game.damageTarget(killedShip,1);assert.equal(game.transition.nextStage,null);
console.log('PASS: four-second delay, transition shield, HP/equipment/score carryover, fade completion, restart and both stage-clear triggers');
game=fixture();game.stage=2;game.stageScroll=0;game.spawnedTurrets=new Set();game.turrets=STAGE2_DATA.turrets.map(()=>({activateAt(x,y,side,mapX){Object.assign(this,{active:true,x,y,side,mapX});}}));game.terrain={update(offset){this.offset=offset;},gapAt(){return {bottom:-6,top:6};}};let shipActivations=0;game.battleship={activate(){shipActivations++;}};
game.updateStage2(20);assert.equal(game.stageScroll,60);assert.ok(game.spawnedTurrets.size>0);const mounted=game.turrets.find(t=>t.active);const before=mounted.x;mounted.age=1;mounted.mesh=mesh();mounted.barrel=mesh();mounted.cooldown=99;mounted.deactivate=function(){this.active=false;};Turret.prototype.update.call(mounted,.1,game);assert.equal(mounted.x,mounted.mapX-game.stageScroll);game.updateStage2(1);Turret.prototype.update.call(mounted,.1,game);assert.equal(mounted.x,before-3);
game.updateStage2(100);assert.equal(game.stageScroll,STAGE2_DATA.bossDistance);assert.equal(shipActivations,1);game.updateStage2(100);assert.equal(shipActivations,1);assert.equal(game.spawnedTurrets.size,STAGE2_DATA.turrets.length);
game=fixture();game.stage=2;game.player.hp=4;game.player.wide=2;game.effects=[];game.input.clear=()=>{};game.updatePods=()=>{};game.transitionShield=true;game.transition={phase:'out',time:0,nextStage:null};game.updateTransition(STAGE_CONFIG.fadeDuration);assert.equal(game.state,'complete');assert.equal(game.player.hp,4);assert.equal(game.player.wide,2);
console.log('PASS: terrain-mounted turrets follow stored scroll positions, one-time ship entry and mission-clear completion');
// Pods compare their current world Y to the player's Y, including equality.
for(const offset of [1,0,-1]){
  game=fixture();game.player=Object.assign(Object.create(Player.prototype),{mesh:mesh()});game.player.reset();game.player.y=2;game.updatePods=()=>{};game.pods=[{active:true,x:-11,y:2+offset},{active:false,x:-12,y:5}];const shots=[];game.shoot=(...args)=>shots.push(args);
  game.player.update(0,{movement:{x:0,y:0},shotRequests:[1],chargeMs:0},game);
  assert.equal(shots.length,2);assert.equal(shots[0][3],0);assert.ok(Math.abs(Math.hypot(shots[1][2],shots[1][3])-24)<1e-9);assert.ok(Math.abs(Math.atan2(shots[1][3],shots[1][2])-(offset>0?1:-1)*Math.PI/18)<1e-9);assert.equal(shots[1][5],1);
  shots.length=0;game.player.update(0,{movement:{x:0,y:0},shotRequests:[16],chargeMs:0},game);assert.equal(shots.length,1);
}
game=fixture();game.debugInvincible=true;game.enemyBullets=[bullet(-10,0)];game.rocks=[{...enemy(-10,0),update(){}}];game.terrain={resolvePlayer:()=>true,hitTime:()=>Infinity,reset(){}};game.update(.01);assert.equal(game.player.hp,5);assert.equal(game.player.invulnerable,0);assert.equal(game.enemyBullets[0].active,false);
game.player.reset=Player.prototype.reset;game.input.clear=()=>{};game.effects=[];game.start();assert.equal(game.debugInvincible,true);game.player.damage(game);assert.equal(game.player.hp,5);game.debugInvincible=false;game.player.damage(game);assert.equal(game.player.hp,4);
console.log('PASS: pod upward/downward 10-degree shots including equal Y, unchanged speed/damage, no pod wave and persistent optional debug invincibility');
// Sloped outlines share boundaries; the geometry and collision query use them together.
const slopes=new Terrain({add(){}});slopes.update(60);
for(let i=0;i<STAGE2_DATA.sections.length-1;i++)for(const side of ['bottom','top']){const a=slopes.walls.find(w=>w.i===i&&w.side===side),b=slopes.walls.find(w=>w.i===i+1&&w.side===side);assert.equal(a.b,b.a);}
const triangle=[[0,0],[4,0],[0,4]];assert.equal(polygonHitTime({x:3,y:3,radius:.1},triangle),Infinity);assert.ok(Number.isFinite(polygonHitTime({previousX:-2,previousY:1,x:2,y:1,radius:.1},triangle)));
for(const fps of [30,60,120]){game=fixture();game.stage=2;game.terrain=slopes;const flyer=Object.assign(Object.create(Enemy.prototype),{mesh:mesh(),type:2,radius:.65});flyer.activate(0,0,0);flyer.x=8;game.player.y=7;let velocity=0;for(let i=0;i<fps*2;i++){const oldY=flyer.y;flyer.update(1/fps,game);const dy=(flyer.y-oldY)*fps;assert.ok(Number.isFinite(dy));const gap=slopes.safeGap(flyer.x,flyer.radius);assert.ok(flyer.y>=gap.bottom-.01&&flyer.y<=gap.top+.01);assert.ok(Math.abs(flyer.avoidVelocity-velocity)<=9/fps+.0001);velocity=flyer.avoidVelocity;}}
for(const [power,damage] of [[1,0],[2,1],[3,1],[16,8]]){game=fixture();const ship=enemy(9,0,512);game.enemies=[ship];const armour={owner:ship,isArmour:true,active:true};const shot={...bullet(0,0),energy:power,isWave:power>1};game.hitTarget(shot,armour);assert.equal(ship.hp,512-damage);assert.equal(shot.energy,0);assert.equal(shot.active,false);}
const shipTarget={...enemy(9,0,512),previousX:9,previousY:0};const armour={isArmour:true,owner:shipTarget};assert.ok(Number.isFinite(hitTime({previousX:0,previousY:-2,x:6,y:-2,radius:.16},armour)));assert.equal(hitTime({x:0,y:3,radius:.16},armour),Infinity);
game=fixture();game.terrain={active:true,safeGap:()=>({bottom:-3,top:3})};game.items=[{active:false,activate(x,y,type){Object.assign(this,{x,y,type,active:true});}}];const savedRandom=Math.random;try{let values=[.32,.99];Math.random=()=>values.shift();game.dropTurretItem({x:2,y:4,side:'top'});assert.equal(game.items[0].y,3);assert.equal(game.items[0].type,'pod');game.items[0].active=false;delete game.items[0].type;Math.random=()=>1/3;game.dropTurretItem({x:0,y:0});assert.equal(game.items[0].type,undefined);}finally{Math.random=savedRandom;}
game=fixture();const bossShot={...bullet(0,0),isBossWave:true};game.enemyShots=[bossShot];game.bullets=[{...bullet(0,0),isWave:true,energy:16,updateAppearance(){}}];game.update(.01);assert.equal(bossShot.active,true);assert.equal(game.bullets[0].energy,16);
console.log('PASS: connected sloped geometry, polygon sweeps, smooth terrain steering at 30/60/120fps, floor-half armour, absorbed wave energy, turret drop and protected boss waves');
const originalBossUpdate=UnpoEnemy.prototype.update;try{
  UnpoEnemy.prototype.update=function(dt){this.age+=dt;this.y=Math.sin(this.age);};
  const ship=Object.assign(Object.create(BattleshipEnemy.prototype),{x:9,y:0,age:0,waveTimer:0,waveCharge:0,chargeSparkTimer:0,mesh:mesh(),chargeGlow:{material:{},scale:{setScalar(){}}},ship:{userData:{flames:[]}}});
  game=fixture();let gatherings=0,launches=0;game.gatherParticles=()=>gatherings++;game.fireBossWave=()=>launches++;
  for(let i=0;i<119;i++)ship.update(1/60,game);assert.equal(launches,0);assert.ok(gatherings>10);assert.ok(ship.chargeGlow.material.opacity>0);ship.update(.02,game);assert.equal(launches,1);assert.equal(ship.waveCharge,0);assert.equal(ship.chargeGlow.material.opacity,0);assert.equal(ship.waveTimer,STAGE_CONFIG.shipWaveInterval);
  const timer=ship.waveTimer;game.transition={phase:'delay'};ship.update(1,game);assert.equal(ship.waveTimer,timer);assert.equal(launches,1);
}finally{UnpoEnemy.prototype.update=originalBossUpdate;}
const bossWave=Object.assign(Object.create(BossWave.prototype),{hostile:true,mesh:mesh(),aura:{scale:{set(){}}}});bossWave.activate(2,0,-STAGE_CONFIG.shipWaveSpeed,0,1);assert.equal(bossWave.radius,.65);assert.equal(bossWave.isBossWave,true);assert.equal(bossWave.damage,1);assert.equal(bossWave.isWave,false);
console.log('PASS: two-second boss charge, gathering particles, launch/recovery cadence, transition suppression and independent hostile wave appearance');
{
// Capped pickups emit fog; actual upgrades do not.
for(const type of ['energy','wide','missile','quick','pod','orb']){game=fixture();game.player=Object.assign(Object.create(Player.prototype),{mesh:mesh()});game.player.reset();game.player.wide=3;game.player.missileLevel=2;game.player.hasMissile=true;game.player.quick=true;game.player.podCount=2;game.player.hasOrb=true;let fogs=0;game.emitFog=(x,y)=>{fogs++;assert.ok(x<game.player.x);assert.equal(y,game.player.y);};game.player.pickup(type,game);assert.equal(fogs,1);}
game=fixture();game.player=Object.assign(Object.create(Player.prototype),{mesh:mesh()});game.player.reset();game.player.hp=4;let emitted=0;game.emitFog=()=>emitted++;for(const type of ['energy','wide','missile','quick','pod','orb'])game.player.pickup(type,game);assert.equal(emitted,0);
const fogFixture=()=>Object.assign(Object.create(YellowFog.prototype),{mesh:mesh(),material:{},contacts:new Map()});
for(const fps of [30,60,120]){game=fixture();game.enemies=[enemy(-4,0,100)];const fog=fogFixture();fog.activate(-3,0);for(let i=0;i<fps;i++)fog.update(1/fps,game);assert.equal(game.enemies[0].hp,90);const hp=game.enemies[0].hp;fog.update(.2,game);assert.equal(game.enemies[0].hp,hp);assert.equal(fog.active,true);assert.ok(fog.material.opacity>0&&fog.material.opacity<.3);fog.update(.31,game);assert.equal(fog.active,false);}
game=fixture();game.stage=2;const fog=fogFixture();fog.activate(0,0);fog.update(.2,game);assert.ok(Math.abs(fog.x+.6)<1e-9);
// A target entering after the damage window receives no damage, even across its final frame.
game=fixture();game.enemies=[{...enemy(0,0,5),previousX:10,previousY:0}];const lateFog=fogFixture();lateFog.activate(0,0);lateFog.age=.99;lateFog.update(.04,game);assert.equal(game.enemies[0].hp,5);
// Continue preserves world/gear and restores HP, score, orb and quick-charge input state.
game=fixture();game.player=Object.assign(Object.create(Player.prototype),{mesh:mesh()});game.player.reset();Object.assign(game.player,{hp:0,wide:3,missileLevel:2,hasMissile:true,quick:true,podCount:2,hasOrb:true});game.state='over';game.stage=2;game.stageScroll=87;game.score=999;game.input.clear=()=>{};game.updatePods=()=>{};let equipped=0;game.orb={equip(){equipped++;}};const survivor=enemy(8,0,10);game.enemies=[survivor];game.continueGame();assert.equal(game.state,'playing');assert.equal(game.player.hp,5);assert.equal(game.score,0);assert.equal(game.player.wide,3);assert.equal(game.player.missileLevel,2);assert.equal(game.player.podCount,2);assert.equal(game.stageScroll,87);assert.equal(survivor.hp,10);assert.equal(equipped,1);assert.equal(game.input.chargeMultiplier,1.5);assert.equal(game.player.invulnerable,2);
let starts=0,continues=0,prevented=0;game.ui.start={onclick(){starts++;}};game.continueGame=()=>continues++;const key=(code,repeat=false)=>({code,repeat,preventDefault(){prevented++;}});game.state='ready';game.menuKey(key('KeyS'));assert.equal(starts,1);game.menuKey(key('KeyS',true));assert.equal(starts,1);game.state='playing';game.menuKey(key('KeyS'));game.menuKey(key('KeyC'));assert.equal(starts,1);assert.equal(continues,0);game.state='over';game.menuKey(key('KeyC'));assert.equal(continues,1);assert.equal(prevented,2);
console.log('PASS: capped-item fog conversion, frame-independent 100ms damage, one-second cutoff, fade/scroll, gear-preserving continue and context-specific S/C keys');

}

// Terrain-following missiles: real integration and swept collisions at 30/60/120 fps.
function guidedMissile(x,y,heading=0,target=null){const m=Object.assign(Object.create(Missile.prototype),{mesh:mesh()});m.activate(x,y,target,3,heading);return m;}
function testCorridor(points,side='bottom'){
  const t=Object.create(Terrain.prototype);t.active=true;
  t.colliders=points.slice(1).map((p,i)=>{
    const a=points[i],b=p;const vertices=side==='bottom'?[[a[0],-12],[b[0],-12],b,a]:[a,b,[b[0],12],[a[0],12]];
    return {left:a[0],right:b[0],a:a[1],b:b[1],side,vertices,scroll:0};
  });return t;
}
for(const fps of [30,60,120])for(const side of ['bottom','top']){
  const sign=side==='bottom'?1:-1;
  const t=testCorridor([[-20,-4*sign],[-4,-4*sign],[2,-2*sign],[8,-3*sign],[20,-3*sign]],side);
  const target={active:true,generation:1,x:30,y:-7*sign};const m=guidedMissile(-8,-2.7*sign,-.3*sign,target);
  let turned=false;
  for(let i=0;i<fps*1.6;i++){
    m.update(1/fps,t);turned ||= m.heading*sign>.1;
    assert.equal(t.hitTime(m),Infinity,`smooth ${side} collision at ${fps} fps x=${m.x} y=${m.y}`);
    assert.ok(Math.abs(Math.hypot(m.vx,m.vy)-12)<1e-8);assert.ok(m.active);
  }
  assert.ok(turned);assert.ok(m.x>6);
}
// Left-facing missiles and lost targets still avoid terrain, without retargeting.
const leftTerrain=testCorridor([[-20,-2],[-4,-2],[3,-4],[20,-4]]);
const leftMissile=guidedMissile(7,-2.8,Math.PI+.2);
for(let i=0;i<80;i++){leftMissile.update(1/60,leftTerrain);assert.equal(leftTerrain.hitTime(leftMissile),Infinity);}
assert.ok(leftMissile.x<0);assert.equal(leftMissile.target,null);
// A discontinuous vertical step is not promoted to a smooth ramp.
const stepTerrain=testCorridor([[-20,-4],[0,-4]]);
stepTerrain.colliders.push(...testCorridor([[0,0],[20,0]]).colliders);
const stepMissile=guidedMissile(-3,-2);let stepContact=false;
for(let i=0;i<30;i++){stepMissile.update(1/60,stepTerrain);if(Number.isFinite(stepTerrain.hitTime(stepMissile))){stepContact=true;break;}}
assert.ok(stepContact);assert.equal(stepMissile.heading,0);
// Game collision ordering: wall absorbs once; enemy takes normal missile damage once.
for(const wallFirst of [false,true]){
  const g=fixture(),m=guidedMissile(0,0);g.missiles=[m];g.terrain={active:false,hitTime:()=>wallFirst?.1:Infinity,resolvePlayer:()=>false};g.enemies=[enemy(1.2,0,3)];let blasts=0;
  g.burst=()=>{blasts++;};g.update(.05);
  assert.equal(m.active,false);assert.equal(g.enemies[0].hp,wallFirst?3:1);assert.equal(blasts,wallFirst?1:2);
}
console.log('PASS: terrain-following missiles at 30/60/120 fps, floor/ceiling, leftward flight, lost targets, constant speed, vertical steps, wall/enemy ordering and one-hit damage');
for(const fps of [30,60,120])for(const initialOffset of [35,75,115])for(const side of ['bottom','top']){
  const t=new Terrain({add(){}});t.update(initialOffset);const gap=t.safeGap(-10,.22);
  const m=guidedMissile(-10,side==='bottom'?gap.bottom+.7:gap.top-.7,side==='bottom'?-.25:.25,{active:true,generation:1,x:30,y:side==='bottom'?-9:9});
  for(let i=0;i<fps*1.8;i++){
    t.update(initialOffset+(i+1)*3/fps);m.update(1/fps,t);
    assert.equal(t.hitTime(m),Infinity,`scroll ${side} ${initialOffset} ${fps}: ${m.x},${m.y}`);
  }
}
// A 90-degree corner must not be treated as a continuous navigable slope.
const corner=testCorridor([[-12,4],[-4,-4],[4,4],[12,4]]);
const probe={x:-5,y:-2,radius:.22,heading:-Math.PI/4,turnRadius:3};
const firstOnly=Object.create(Terrain.prototype);firstOnly.active=true;firstOnly.colliders=[corner.colliders[0]];
assert.equal(corner.missileHeading(probe,probe.heading),firstOnly.missileHeading(probe,probe.heading));
console.log('PASS: scrolling real stage terrain at 30/60/120 fps and 90-degree corner exclusion');

// New flight patterns preserve speed differences and a one-shot HP1 formation exit.
for(const fps of [30,60,120]){
  const g={stage:1,player:{x:-10,y:3},shots:0,shoot(){this.shots++;}};
  const seeker=Object.assign(Object.create(Enemy.prototype),{type:3,mesh:mesh()});seeker.activate(-3,0,0);
  for(let i=0;i<fps;i++)seeker.update(1/fps,g);
  assert.ok(seeker.y>0);assert.ok(Math.abs(seeker.x-11.5)<1e-8);
  const raider=Object.assign(Object.create(Enemy.prototype),{type:4,mesh:mesh()});raider.activate(2,0,0);
  assert.equal(raider.hp,1);assert.ok(raider.speed>seeker.speed);
  for(let i=0;i<fps*4&&raider.active;i++)raider.update(1/fps,g);
  assert.equal(g.shots,1);assert.equal(raider.active,false);assert.equal(raider.departing,true);
  raider.activate(-2,0,0);assert.equal(raider.fired,false);assert.equal(raider.departing,false);
}
game=fixture();game.spawnTimer=0;game.spawnCount=4;game.stage=1;game.elapsed=0;
game.enemies=Array.from({length:3},()=>Object.assign(Object.create(Enemy.prototype),{type:4,mesh:mesh(),active:false}));
game.update(0);assert.equal(game.enemies.filter(e=>e.active).length,3);assert.deepEqual(game.enemies.map(e=>e.hp),[1,1,1]);
console.log('PASS: seeker approach, fast HP1 three-ship formation, single aimed shot, exit and pool reset at 30/60/120fps');
