// Test the real Web Audio graph/lifecycle with deterministic mock nodes.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
class Param {
  constructor(value=0){this.value=value;this.events=[];}
  setValueAtTime(v,t){assert.ok(Number.isFinite(v)&&Number.isFinite(t));this.value=v;this.events.push(['set',v,t]);}
  linearRampToValueAtTime(v,t){this.setValueAtTime(v,t);}
  exponentialRampToValueAtTime(v,t){assert.ok(v>0);this.setValueAtTime(v,t);}
  setTargetAtTime(v,t){this.setValueAtTime(v,t);}
  cancelScheduledValues(){}
}
class Node {
  constructor(){for(const p of ['gain','frequency','pan','threshold','knee','ratio','attack','release'])this[p]=new Param();this.connections=[];}
  connect(node){this.connections.push(node);}
  disconnect(){this.disconnected=true;}
  start(t=0){this.started=t;}
  stop(t){this.stopped=t;}
}
class Context {
  constructor(){this.currentTime=0;this.sampleRate=8000;this.state='suspended';this.destination=new Node();this.sources=[];}
  createGain(){return new Node();} createDynamicsCompressor(){return new Node();}
  createBiquadFilter(){return new Node();} createConvolver(){return new Node();} createStereoPanner(){return new Node();}
  createOscillator(){const n=new Node();this.sources.push(n);return n;}
  createBufferSource(){return this.createOscillator();}
  createBuffer(channels,length){const data=Array.from({length:channels},()=>new Float32Array(length));return{getChannelData:i=>data[i]};}
  async resume(){this.state='running';} async suspend(){this.state='suspended';}
}
const elements = new Map();
const document = {querySelector:id=>{if(!elements.has(id))elements.set(id,{setAttribute(){}});return elements.get(id);}};
const context = vm.createContext({AudioContext:Context,document,Math,localStorage:{getItem(){return null;},setItem(){}}});
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../sound.js'),'utf8').replace(/export /g,'')+'\nglobalThis.Sound=Sound;globalThis.config=SOUND_CONFIG;',context);
(async()=>{
  const audio = new context.Sound(); assert.equal(audio.context,null); // No autoplay on page load.
  audio.start();await audio.unlock();
  assert.equal(audio.context.state,'running');assert.ok(audio.context.sources.length>10);
  for(const kind of ['shot','enemy','missile','wave','hit','explosion','damage','pickup'])audio.effect(kind,16,5);
  const count=audio.context.sources.length;audio.effect('shot');assert.equal(audio.context.sources.length,count); // Pods don't multiply the sound.
  audio.setCharge(.5);const charge=audio.charge;audio.setCharge(1);assert.equal(audio.charge,charge);
  audio.setCharge(0);assert.equal(audio.charge,null);assert.ok(charge.source.stopped>0);
  audio.muted=true;audio.applyVolumes();assert.equal(audio.music.gain.value,0);assert.equal(audio.effects.gain.value,0);
  audio.effect('wave',16);assert.equal(audio.context.sources.length,count+1);
  audio.muted=false;audio.applyVolumes();
  // Saturated polyphony stays bounded; ended voices disconnect and free slots.
  for(let i=0;i<100;i++)audio.voice({time:0,duration:.2});
  assert.equal(audio.voices.size,context.config.maxVoices);
  const completed=audio.context.sources.find(s=>s.onended);completed.onended();assert.ok(completed.disconnected);assert.equal(audio.voices.size,context.config.maxVoices-1);
  audio.pause();assert.equal(audio.playing,false);assert.equal(audio.context.state,'suspended');
  elements.get('#sound-toggle').onclick();elements.get('#sound-toggle').onclick();
  assert.equal(audio.context.state,'suspended'); // Unmuting while paused must not wake reverb tails.
  assert.ok([...audio.voices].every(v=>typeof v.cancel==='function'));
  // Mock the browser's asynchronous onended notifications.
  for(const s of audio.context.sources)if(s.onended)s.onended();
  audio.start(false);await audio.unlock();assert.equal(audio.playing,true);
  audio.context.currentTime=100;audio.tick();assert.ok(audio.nextBeat>100);assert.ok(audio.nextBeat<101); // No scheduling backlog.
  for(const s of audio.context.sources)if(s.onended)s.onended();
  audio.finish();assert.equal(audio.playing,false);assert.equal(audio.voices.size,4);
  const beforeBoss=audio.context.sources.length;
  audio.effect('bossExplosion');
  const bossSources=audio.context.sources.slice(beforeBoss);
  assert.equal(bossSources.length,14);assert.ok(bossSources.some(s=>s.started>=audio.context.currentTime+.8));
  assert.ok(bossSources.some(s=>s.stopped>=audio.context.currentTime+1.9));
  // Missing Web Audio is a graceful audio-only failure.
  context.AudioContext=undefined;const unsupported=new context.Sound();unsupported.start();await unsupported.unlock();assert.equal(unsupported.context,null);
  console.log('PASS: gesture startup, music scheduling, all effects, charge cleanup, mute, voice cap, pause/resume, game over and unsupported browsers');
})().catch(e=>{console.error(e);process.exitCode=1;});
