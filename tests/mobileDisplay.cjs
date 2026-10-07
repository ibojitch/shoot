const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'../mobileDisplay.js'),'utf8').replace('export class','class');
function fixture({mobile=true,portrait=true,fullscreen=true,lock=true,reject=false}={}){
  const queries=new Map(),elements=new Map(),events={},calls=[];let blocked=0,ready=0;
  const document={fullscreenElement:null,querySelector(id){if(!elements.has(id))elements.set(id,{});return elements.get(id);},addEventListener(name,callback){events[name]=callback;}};
  const screen={orientation:{unlock(){calls.push('unlock');}}};
  const context=vm.createContext({document,screen,matchMedia(query){const item={matches:query.includes('coarse')?mobile:portrait,addEventListener(name,callback){this.change=callback;}};queries.set(query,item);return item;},addEventListener(){}});
  vm.runInContext(source+'\nglobalThis.MobileDisplay=MobileDisplay;',context);
  const target=document.querySelector('#game');
  if(fullscreen)target.requestFullscreen=async()=>{calls.push('fullscreen');if(reject)throw Error('Denied');document.fullscreenElement=target;};
  if(lock)screen.orientation.lock=async value=>{calls.push(value);const q=queries.get('(orientation: portrait)');q.matches=false;q.change();};
  const display=new context.MobileDisplay({onBlocked(){blocked++;},onReady(){ready++;}});
  return{display,calls,queries,elements,document,events,get blocked(){return blocked;},get ready(){return ready;}};
}
(async()=>{
  let f=fixture();const entering=f.display.enter();assert.equal(f.calls[0],'fullscreen');assert.equal(f.display.blocked,true);
  await entering;assert.deepEqual(f.calls,['fullscreen','landscape']);assert.equal(f.display.blocked,false);assert.equal(f.ready,1);assert.equal(f.elements.get('#rotate-guide').hidden,true);
  f.document.fullscreenElement=null;f.events.fullscreenchange();assert.equal(f.calls.at(-1),'unlock');
  f=fixture({fullscreen:false,lock:false});await f.display.enter();assert.equal(f.display.blocked,true);assert.equal(f.blocked,1);assert.equal(f.elements.get('#rotate-guide').hidden,false);
  await f.display.enter();assert.equal(f.blocked,2); // Retrying re-silences audio until rotated.
  const portrait=f.queries.get('(orientation: portrait)');portrait.matches=false;portrait.change();assert.equal(f.display.blocked,false);assert.equal(f.ready,1);
  portrait.matches=true;portrait.change();assert.equal(f.display.blocked,true);assert.equal(f.blocked,3);
  f.display.stop();assert.equal(f.display.blocked,false);assert.equal(f.elements.get('#rotate-guide').hidden,true);
  f=fixture({reject:true});await f.display.enter();assert.equal(f.display.pending,false);assert.equal(f.display.blocked,true);assert.deepEqual(f.calls,['fullscreen']);
  f=fixture({mobile:false});await f.display.enter();assert.equal(f.display.active,false);assert.equal(f.calls.length,0);
  f=fixture({portrait:false,lock:false});await f.display.enter();assert.equal(f.display.blocked,false);assert.equal(f.elements.get('#rotate-guide').hidden,true);
  // A slow fullscreen request cannot spawn concurrent orientation-lock requests.
  f=fixture();let complete;f.document.querySelector('#game').requestFullscreen=()=>new Promise(resolve=>complete=resolve);
  const waiting=f.display.enter();await f.display.enter();complete();await waiting;assert.deepEqual(f.calls,['landscape']);
  console.log('PASS: gesture fullscreen, landscape lock, manual rotation fallback, game/audio gate, retry, desktop, denied API and pending requests');
})().catch(e=>{console.error(e);process.exitCode=1;});
