// Exercise real game logic without a browser/WebGL dependency.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
class Asset { constructor() {} }
const THREE = new Proxy({}, {get:(_,name)=>name==='MathUtils'?{lerp:(a,b,t)=>a+(b-a)*t}:Asset});
const source=fs.readFileSync(require('node:path').join(__dirname,'../game.js'),'utf8')
  .replace(/^import .*;$/gm,'').split('// Finish loading')[0];
const context=vm.createContext({THREE,Math,document:{},performance:{now:()=>context.clock??0}});
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../unpoConfig.js'),'utf8').replace('export const','const')+source+'\nglobalThis.logic={Game,UI,Player,Bullet,Enemy,UnpoEnemy,UnpoCrystal,UNPO_CONFIG,Rock,Input,chargeDamage,splitVelocity,bulletHits,overlap};',context);
const {Game,UI,Player,Bullet,Enemy,UnpoEnemy,UnpoCrystal,UNPO_CONFIG,Rock,Input,chargeDamage,splitVelocity,bulletHits,overlap}=context.logic;
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
let lines=0;crystal.fire({x:-10,y:0},{say(){lines++;}});assert.equal(lines,1);assert.equal(crystal.phase,'flying');
const chaseGame={player:{x:5,y:10},burst(){}};const initialHeading=crystal.heading;crystal.update(.1,chaseGame);assert.ok(Math.abs(crystal.heading-initialHeading)<=UNPO_CONFIG.homingTurnRate*.1+1e-8);
for(let i=0;i<Math.ceil(UNPO_CONFIG.homingDuration/.1)+1;i++)crystal.update(.1,chaseGame);const frozenVelocity=[crystal.vx,crystal.vy];chaseGame.player={x:-100,y:-100};crystal.update(.1,chaseGame);assert.deepEqual([crystal.vx,crystal.vy],frozenVelocity);
for(const reason of ['destroyed','player','terrain','offscreen']){
  crystal.deactivate(reason);assert.equal(crystal.phase,'regenerating');assert.equal(crystal.active,false);assert.equal(crystal.materials[0].opacity,0);
  crystal.fire(chaseGame.player,{say(){throw Error('Fired while regenerating');}});
  crystal.update(UNPO_CONFIG.regenerationDuration/2,chaseGame);assert.equal(crystal.materials[0].opacity,.5);
  crystal.update(UNPO_CONFIG.regenerationDuration/2,chaseGame);assert.equal(crystal.phase,'held');assert.equal(crystal.hp,16);assert.equal(crystal.active,true);
}
game=fixture();game.crystals=[crystal];shot=wave(crystal.x,crystal.y,16);game.hitTarget(shot,crystal);assert.equal(crystal.phase,'regenerating');assert.equal(shot.energy,0);assert.equal(game.score,0);
crystalOwner.active=false;crystal.deactivate('owner-dead');assert.equal(crystal.phase,'inactive');assert.equal(crystalMesh.visible,false);
const boss=Object.assign(Object.create(UnpoEnemy.prototype),{mesh:mesh(),visual:mesh(),crystal:{hold(){},deactivate(){}},isUnpo:true});boss.activate();assert.equal(boss.hp,256);assert.equal(boss.radius,UNPO_CONFIG.bodyRadius);
console.log('PASS: Unpo HP, independent crystal HP, launch, bounded turn, pursuit cutoff, all regeneration reasons, fade, firing lock and owner cleanup');
assert.equal(UNPO_CONFIG.homingDuration,2);
boss.update(.1,{});assert.ok(Math.abs(boss.visual.rotation.y)<=UNPO_CONFIG.bodySwayAmplitude);
const sway=boss.visual.rotation.y;boss.update(UNPO_CONFIG.bodySwayPeriod,{});assert.ok(Math.abs(boss.visual.rotation.y-sway)<1e-8);
const hpElements={'#enemy-hp':{style:{}},'#enemy-hp-value':{},'#enemy-hp-fill':{style:{}}};
context.document.querySelector=selector=>hpElements[selector];context.innerWidth=960;context.innerHeight=540;
const hud=Object.create(UI.prototype);boss.hp=128;hud.enemyHealth([boss],{left:-16,right:16,top:9,bottom:-9});assert.equal(hpElements['#enemy-hp'].hidden,false);assert.equal(hpElements['#enemy-hp-value'].textContent,'128 / 256');assert.equal(hpElements['#enemy-hp-fill'].style.width,'50%');
boss.active=false;hud.enemyHealth([boss],{});assert.equal(hpElements['#enemy-hp'].hidden,true);
console.log('PASS: two-second homing, bounded periodic Y sway, head HP percentage and hiding');
