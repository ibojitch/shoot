// Procedural soundtrack and effects: no downloads, audio files or build step.
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const note = midi => 440 * 2 ** ((midi - 69) / 12);
export const SOUND_CONFIG = { bpm: 92, reverbSeconds: 2.4, musicVolume: .45, effectsVolume: .7, maxVoices: 64 };
const CHORDS = [[50,57,60,64], [46,53,57,60], [53,60,64,67], [48,55,58,62]];

export class Sound {
  constructor() {
    this.context = null; this.playing = false; this.voices = new Set(); this.lastEffects = {};
    this.musicVolume = SOUND_CONFIG.musicVolume; this.effectsVolume = SOUND_CONFIG.effectsVolume; this.muted = false;
    try {
      const saved = JSON.parse(localStorage.getItem('orbitSound') || 'null');
      if (saved) {
        if (Number.isFinite(saved.music)) this.musicVolume = clamp(saved.music, 0, 1);
        if (Number.isFinite(saved.effects)) this.effectsVolume = clamp(saved.effects, 0, 1);
        this.muted = saved.muted === true;
      }
    } catch { /* Storage is optional in private browsing. */ }
    this.bindControls();
  }
  bindControls() {
    const button = document.querySelector('#sound-toggle');
    const music = document.querySelector('#music-volume'), effects = document.querySelector('#effects-volume');
    const refresh = () => {
      button.textContent = this.muted ? 'SOUND OFF' : 'SOUND ON';
      button.setAttribute('aria-pressed', String(this.muted));
      music.value = Math.round(this.musicVolume * 100); effects.value = Math.round(this.effectsVolume * 100);
    };
    button.onclick = () => { this.muted = !this.muted; this.applyVolumes(); this.save(); refresh(); if (!this.muted && this.playing) void this.unlock(); };
    music.oninput = () => { this.musicVolume = Number(music.value) / 100; this.applyVolumes(); this.save(); };
    effects.oninput = () => { this.effectsVolume = Number(effects.value) / 100; this.applyVolumes(); this.save(); };
    refresh();
  }
  save() { try { localStorage.setItem('orbitSound', JSON.stringify({music:this.musicVolume,effects:this.effectsVolume,muted:this.muted})); } catch {} }
  gain(value = 1) { const n = this.context.createGain(); n.gain.value = value; return n; }
  initialize() {
    const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Context) return false;
    const c = this.context = new Context({latencyHint:'interactive'});
    this.music = this.gain(); this.effects = this.gain(); this.master = this.gain(.65);
    const compressor = c.createDynamicsCompressor();
    compressor.threshold.value = -18; compressor.knee.value = 18; compressor.ratio.value = 5;
    compressor.attack.value = .004; compressor.release.value = .18;
    this.master.connect(compressor); compressor.connect(c.destination);
    this.music.connect(this.master); this.effects.connect(this.master);
    // One shared, filtered stereo reverb. Its impulse and noise are made once.
    const reverb = c.createConvolver(), impulse = c.createBuffer(2, Math.ceil(c.sampleRate * SOUND_CONFIG.reverbSeconds), c.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel); let smooth = 0;
      for (let i = 0; i < data.length; i++) { smooth = smooth * .55 + (Math.random() * 2 - 1) * .45; data[i] = i < c.sampleRate * .025 ? 0 : smooth * (1 - i / data.length) ** 2.8; }
    }
    reverb.buffer = impulse;
    const wet = this.gain(.32), lowpass = c.createBiquadFilter();
    lowpass.type = 'lowpass'; lowpass.frequency.value = 4800;
    this.musicSend = this.gain(.48); this.effectsSend = this.gain(.32);
    // Send after the volume faders, so zero volume also silences the reverb.
    this.music.connect(this.musicSend); this.effects.connect(this.effectsSend);
    this.musicSend.connect(reverb); this.effectsSend.connect(reverb);
    reverb.connect(lowpass); lowpass.connect(wet); wet.connect(this.master);
    this.noiseBuffer = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const noise = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < noise.length; i++) noise[i] = Math.random() * 2 - 1;
    this.applyVolumes(); return true;
  }
  async unlock() {
    try {
      if (!this.context && !this.initialize()) throw new Error('Web Audio unavailable');
      if (this.context.state !== 'running') await this.context.resume();
      if (this.playing && this.context.state === 'running') {
        // Restart the scheduling clock after an OS/browser suspension.
        if (this.nextBeat < this.context.currentTime) this.nextBeat = this.context.currentTime + .04;
        this.tick();
      }
      document.querySelector('#sound-status').textContent = this.playing ? '再生中 · REVERB' : '音声準備完了';
    } catch {
      const button = document.querySelector('#sound-toggle');
      if (button) { button.textContent = 'SOUND unavailable'; button.title = '音声を開始できません。ブラウザの音声設定を確認してください。'; }
    }
  }
  applyVolumes() {
    if (!this.context) return;
    this.music.gain.setTargetAtTime(this.muted ? 0 : this.musicVolume, this.context.currentTime, .025);
    this.effects.gain.setTargetAtTime(this.muted ? 0 : this.effectsVolume, this.context.currentTime, .025);
  }
  start(reset = true) {
    if (reset) { this.step = 0; this.setCharge(0); for (const voice of [...this.voices]) voice.cancel(); }
    this.playing = true; this.nextBeat = (this.context?.currentTime || 0) + .04;
    // Called directly from START / RESUME to satisfy mobile autoplay rules.
    void this.unlock();
  }
  pause() {
    this.playing = false; this.setCharge(0);
    for (const voice of [...this.voices]) voice.cancel();
    // Suspending also freezes the reverb tail instead of leaking sound while paused.
    if (this.context) void this.context.suspend().catch(() => {});
    document.querySelector('#sound-status').textContent = '一時停止';
  }
  finish() {
    this.playing = false; this.setCharge(0);
    for (const voice of [...this.voices]) voice.cancel();
    this.effect('over');
    document.querySelector('#sound-status').textContent = 'ゲーム終了';
  }
  // Each temporary voice disconnects on completion; a hard cap bounds polyphony.
  voice({time, duration, frequency=440, endFrequency, type='sine', volume=.1, bus=this.effects, cutoff=5000, pan=0, attack=.008, noise=false}) {
    const c = this.context;
    if (!c || c.state !== 'running' || this.voices.size >= SOUND_CONFIG.maxVoices) return;
    const source = noise ? c.createBufferSource() : c.createOscillator();
    if (noise) { source.buffer = this.noiseBuffer; source.loop = true; }
    else { source.type = type; source.frequency.setValueAtTime(frequency, time); if (endFrequency) source.frequency.exponentialRampToValueAtTime(endFrequency, time + duration); }
    const filter = c.createBiquadFilter(); filter.type = noise && cutoff > 6000 ? 'highpass' : 'lowpass'; filter.frequency.value = cutoff;
    const envelope = this.gain(0), stereo = c.createStereoPanner(); stereo.pan.value = clamp(pan, -1, 1);
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(volume, time + Math.min(attack, duration / 3));
    envelope.gain.exponentialRampToValueAtTime(.0001, time + duration);
    source.connect(filter); filter.connect(envelope); envelope.connect(stereo); stereo.connect(bus);
    const voice = {bus,cancel:() => { envelope.gain.cancelScheduledValues(c.currentTime); envelope.gain.setValueAtTime(0, c.currentTime); source.stop(c.currentTime); }};
    this.voices.add(voice);
    source.onended = () => { source.disconnect(); filter.disconnect(); envelope.disconnect(); stereo.disconnect(); this.voices.delete(voice); };
    source.start(time); source.stop(time + duration + .02); return voice;
  }
  tick() {
    const c = this.context;
    if (!this.playing || !c || c.state !== 'running' || this.muted || this.musicVolume === 0) return;
    // Short lookahead driven by the existing render loop; never catch up missed bars.
    if (this.nextBeat < c.currentTime - .1) this.nextBeat = c.currentTime + .02;
    const beat = 60 / SOUND_CONFIG.bpm / 2;
    while (this.nextBeat < c.currentTime + .12) {
      this.scheduleBeat(this.step++, this.nextBeat, beat); this.nextBeat += beat;
    }
  }
  scheduleBeat(step, time, beat) {
    const chord = CHORDS[Math.floor(step / 16) % CHORDS.length], position = step % 16;
    const play = options => this.voice({time, bus:this.music, ...options});
    if (position === 0) {
      chord.forEach((midi,i) => {
        // Slow attack and two detuned layers make the pad breathe in stereo.
        play({frequency:note(midi+12)*.998,duration:beat*15.5,volume:.032,type:'triangle',attack:.65,cutoff:1600,pan:i%2?.65:-.65});
        play({frequency:note(midi+12)*1.003,duration:beat*15.5,volume:.025,attack:.8,pan:i%2?-.45:.45});
      });
    }
    if (position % 2 === 0) {
      play({frequency:note(chord[0]-12+(position===10?7:0)),duration:beat*1.6,volume:.2,cutoff:450,type:'triangle'});
    }
    if ([0,6,8,14].includes(position)) play({frequency:140,endFrequency:42,duration:.26,volume:.45,cutoff:800});
    if (position===4 || position===12) {
      play({noise:true,duration:.17,volume:.095,cutoff:2700,pan:.08});
      play({frequency:185,endFrequency:95,duration:.13,volume:.12});
    }
    play({noise:true,duration:position%2?.07:.035,volume:position%2?.022:.013,cutoff:7800,pan:position%2?.3:-.3});
    if (position % 2 === 1) {
      const pitch = chord[[0,2,1,3,2,1,3,1][Math.floor(position/2)]] + 24;
      play({frequency:note(pitch),duration:beat*1.9,volume:.042,attack:.012,cutoff:3200,pan:Math.sin(step*.7)*.55});
      play({time:time+beat*.75,frequency:note(pitch),duration:beat,volume:.014,pan:-.6,cutoff:2200});
    }
  }
  effect(kind, power = 1, x = 0) {
    const c = this.context;
    if (!c || c.state !== 'running' || this.muted || this.effectsVolume === 0) return;
    const time = c.currentTime, pan = clamp(x / 18, -.8, .8);
    const cooldown = {shot:.065,enemy:.12,hit:.07,explosion:.08}[kind] ?? 0;
    if (time - (this.lastEffects[kind] ?? -Infinity) < cooldown) return;
    this.lastEffects[kind] = time;
    const play = options => this.voice({time,pan,...options});
    switch (kind) {
      case 'shot':
        play({frequency:1000,endFrequency:210,duration:.13,volume:.12,type:'triangle',cutoff:2300});
        play({noise:true,duration:.055,volume:.045,cutoff:3500}); break;
      case 'enemy': case 'missile':
        play({noise:true,duration:.32,volume:.14,cutoff:1400});
        play({frequency:kind==='missile'?180:330,endFrequency:70,duration:.28,volume:.16}); break;
      case 'wave': {
        const strength = clamp(power/16, .125, 1);
        play({frequency:90+strength*65,endFrequency:36,duration:.45+strength*.4,volume:.24+strength*.18});
        play({frequency:900,endFrequency:130,duration:.5,volume:.13,type:'sawtooth',cutoff:1200});
        play({noise:true,duration:.4+strength*.35,volume:.1+strength*.16,cutoff:2600}); break;
      }
      case 'hit': play({noise:true,duration:.085,volume:.09,cutoff:1900}); break;
      case 'explosion':
        // Sharp midrange crack remains audible on phone speakers, followed by a bass thump.
        play({noise:true,duration:.065,volume:.52,cutoff:5200,attack:.002});
        play({noise:true,duration:.38,volume:.36,cutoff:1900,attack:.003});
        play({frequency:220,endFrequency:62,duration:.25,volume:.34,type:'triangle',cutoff:1700,attack:.002});
        play({frequency:105,endFrequency:32,duration:.5,volume:.42,attack:.002}); break;
      case 'bossExplosion':
        // Reserve space for the boss cue even during a busy firefight.
        for(const voice of [...this.voices])if(voice.bus===this.effects){voice.cancel();this.voices.delete(voice);}
        play({noise:true,duration:.1,volume:.75,cutoff:5600,attack:.002});
        play({frequency:250,endFrequency:42,duration:.6,volume:.55,type:'triangle',cutoff:2000,attack:.003});
        play({noise:true,duration:1.8,volume:.46,cutoff:1400,attack:.01});
        play({frequency:85,endFrequency:25,duration:1.9,volume:.6,attack:.006});
        for(let i=1;i<=5;i++){
          play({time:time+i*.16,noise:true,duration:.22+i*.05,volume:.38-i*.035,cutoff:3200-i*300,pan:clamp(pan+(i%2?.3:-.3),-1,1),attack:.002});
          play({time:time+i*.16,frequency:150-i*12,endFrequency:35,duration:.4,volume:.25,attack:.003});
        }
        break;
      case 'damage':
        play({frequency:180,endFrequency:48,duration:.48,volume:.32,type:'triangle',cutoff:1100});
        play({noise:true,duration:.25,volume:.18,cutoff:1800}); break;
      case 'pickup': [74,81,86].forEach((midi,i)=>play({time:time+i*.085,frequency:note(midi),duration:.6,volume:.12,pan:pan+(i-1)*.15})); break;
      case 'over': [62,58,53,50].forEach((midi,i)=>play({time:time+i*.24,frequency:note(midi),duration:1.1,volume:.16,type:'triangle',cutoff:1600})); break;
    }
  }
  setCharge(amount) {
    const c = this.context;
    if (!c || c.state !== 'running') return;
    amount = clamp(amount, 0, 1);
    if (!amount) {
      if (this.charge) {
        const {source,envelope} = this.charge;
        envelope.gain.cancelScheduledValues(c.currentTime);
        envelope.gain.setTargetAtTime(0,c.currentTime,.018);
        source.stop(c.currentTime+.12); this.charge = null;
      }
      return;
    }
    if (!this.playing) return;
    if (!this.charge) {
      const source = c.createOscillator(), filter = c.createBiquadFilter(), envelope = this.gain(0);
      source.type='triangle'; filter.type='lowpass'; filter.frequency.value=1600;
      source.connect(filter); filter.connect(envelope); envelope.connect(this.effects);
      source.onended=()=>{source.disconnect();filter.disconnect();envelope.disconnect();};
      source.start(); this.charge={source,envelope};
    }
    this.charge.source.frequency.setTargetAtTime(110+amount*550,c.currentTime,.045);
    this.charge.envelope.gain.setTargetAtTime(.025+amount*.07,c.currentTime,.045);
  }
}
