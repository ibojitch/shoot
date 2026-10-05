// Exercise real game logic without a browser/WebGL dependency.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
class Asset { constructor() {} }
const THREE = new Proxy({}, {get:(_,name)=>name==='MathUtils'?{lerp:(a,b,t)=>a+(b-a)*t}:Asset});
const source=fs.readFileSync(require('node:path').join(__dirname,'../game.js'),'utf8')
  .replace(/^import .*;$/gm,'').replace('new Game(await loadIbojitchPlayer());','');
const context=vm.createContext({THREE,Math,document:{},performance:{now:()=>0}});
vm.runInContext(source+'\nglobalThis.logic={Game,Player,Bullet,Enemy,overlap};',context);
const {Game,Player,Bullet,Enemy,overlap}=context.logic;
const mesh=()=>({visible:true,position:{set(){}},rotation:{x:0,y:0}});
const bullet=(x,y)=>({x,y,radius:.16,active:true,update(){},deactivate(){this.active=false;}});
const enemy=(x,y,hp=1)=>({x,y,hp,type:0,age:1,radius:.65,active:true,update(){},deactivate(){this.active=false;}});
function fixture(){return Object.assign(Object.create(Game.prototype),{elapsed:0,score:0,spawnTimer:99,spawnCount:0,state:'playing',input:{},player:{x:-10,y:0,radius:.48,hp:5,update(){},damage:Player.prototype.damage,invulnerable:0,mesh:mesh()},enemies:[],bullets:[],enemyBullets:[],burst(){},ui:{update(){},show(){},hide(){},pause:{}},});}
let game=fixture(); game.enemies=[enemy(0,0)];game.bullets=[bullet(0,0)];game.update(.016);
assert.equal(game.score,100);assert.equal(game.enemies[0].active,false);assert.equal(game.bullets[0].active,false);
game=fixture();game.enemies=[enemy(0,0,2)];game.bullets=[bullet(0,0)];game.update(.016);assert.equal(game.score,0);assert.equal(game.enemies[0].hp,1);
game=fixture();game.enemies=[enemy(0,0)];game.enemies[0].age=.2;game.bullets=[bullet(0,0)];game.update(.016);assert.equal(game.enemies[0].hp,1);
game=fixture();game.enemyBullets=[bullet(-10,0)];game.update(.016);assert.equal(game.player.hp,4);assert.equal(game.enemyBullets[0].active,false);
game.player.damage(game);assert.equal(game.player.hp,4); // invulnerability prevents repeated damage
game=fixture();game.player.hp=1;game.input.clear=()=>{};game.enemyBullets=[bullet(-10,0)];game.update(.016);assert.equal(game.state,'over');assert.equal(game.player.hp,0);
game.player.reset=Player.prototype.reset;game.input.clear=()=>{};game.effects=[];game.start();assert.equal(game.state,'playing');assert.equal(game.player.hp,5);assert.equal(game.score,0);assert.equal(game.enemyBullets[0].active,false);
let shotCount=0;const player=Object.assign(Object.create(Player.prototype),{mesh:mesh(),engine:{scale:{}},radius:.48});player.reset();game.shoot=()=>shotCount++;player.update(1,{movement:{x:-1,y:1},firing:true},game);assert.equal(player.x,-15);assert.equal(player.y,7.5);assert.equal(shotCount,1);player.update(.05,{movement:{x:0,y:0},firing:true},game);assert.equal(shotCount,1);player.update(.11,{movement:{x:0,y:0},firing:true},game);assert.equal(shotCount,2);
const hunter=Object.assign(Object.create(Enemy.prototype),{type:2,mesh:mesh()});hunter.activate(4,0,0);hunter.cooldown=0;game.player.x=-10;game.player.y=0;hunter.x=10;game.shoot=(x,y,vx,vy,hostile)=>{assert.ok(vx<0);assert.ok(vy<0);assert.equal(hostile,true);};hunter.update(.1,game);assert.ok(hunter.y<4);
assert.equal(overlap({x:0,y:0,radius:1},{x:3,y:0,radius:1}),false);
const b=Object.assign(Object.create(Bullet.prototype),{mesh:mesh()});b.activate(18,0,24,0);b.update(1);assert.equal(b.active,false);
console.log('PASS: scoring, enemy HP, entry protection, damage, invulnerability, game over, restart, bounds, autofire, aimed shots, bullet cleanup');
