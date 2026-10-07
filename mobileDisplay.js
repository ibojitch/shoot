// Fullscreen must be requested directly from a tap, never from resize or a timer.
export class MobileDisplay {
  constructor({onBlocked,onReady}) {
    this.onBlocked=onBlocked;this.onReady=onReady;this.active=false;this.blocked=false;this.pending=false;this.locked=false;
    this.mobileQuery=matchMedia('(pointer: coarse)');this.portraitQuery=matchMedia('(orientation: portrait)');
    this.panel=document.querySelector('#rotate-guide');this.status=document.querySelector('#rotate-status');
    document.querySelector('#fullscreen').onclick=()=>void this.enter();
    document.querySelector('#rotate-fullscreen').onclick=()=>void this.enter();
    this.portraitQuery.addEventListener('change',()=>this.sync());
    this.mobileQuery.addEventListener('change',()=>this.sync());
    addEventListener('resize',()=>this.sync());
    document.addEventListener('fullscreenchange',()=>{
      if(!document.fullscreenElement&&this.locked){try{screen.orientation?.unlock();}catch{}this.locked=false;}
      this.sync();
    });
  }
  sync() {
    const blocked=this.active&&this.mobileQuery.matches&&this.portraitQuery.matches;
    this.panel.hidden=!blocked;
    if(blocked===this.blocked)return;
    this.blocked=blocked;
    if(blocked)this.onBlocked();else this.onReady();
  }
  async enter() {
    if(!this.mobileQuery.matches)return;
    this.active=true;
    if(this.blocked)this.onBlocked(); // START / RESUME may have just re-enabled audio.
    if(this.pending){this.sync();return;}
    this.pending=true;this.status.textContent='';
    try {
      // Invoke before the first await so the START tap's activation is preserved.
      if(!document.fullscreenElement){
        const target=document.querySelector('#game');
        if(!target.requestFullscreen)throw new Error('Fullscreen unavailable');
        const request=target.requestFullscreen();this.sync();await request;
      }
      if(!screen.orientation?.lock)throw new Error('Orientation lock unavailable');
      await screen.orientation.lock('landscape');this.locked=true;
    } catch {
      // iPhone and embedded browsers can still play after manual rotation.
      this.status.textContent='自動切替に対応していない場合は、端末を横にしてください。';
    } finally {this.pending=false;this.sync();}
  }
  stop(){this.active=false;this.sync();}
}
