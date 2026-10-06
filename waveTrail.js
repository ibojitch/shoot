// Lightweight 2D overlay: no extra WebGL objects or image assets.
export class WaveTrail {
  constructor(container) {
    this.canvas=document.createElement('canvas');
    this.canvas.className='wave-trails';
    this.canvas.setAttribute('aria-hidden','true');
    this.context=this.canvas.getContext('2d');
    container.append(this.canvas);
  }
  resize(width,height) {
    this.width=width;this.height=height;
    const ratio=Math.min(devicePixelRatio||1,1.5);
    this.canvas.width=Math.round(width*ratio);this.canvas.height=Math.round(height*ratio);
    this.context?.setTransform(ratio,0,0,ratio,0,0);
  }
  render(bullets,camera) {
    const ctx=this.context;if(!ctx)return;
    ctx.clearRect(0,0,this.width,this.height);
    ctx.globalCompositeOperation='lighter';
    const scale=this.width/(camera.right-camera.left);
    for(const bullet of bullets) {
      if(!bullet.active||!bullet.isWave||bullet.energy<=0)continue;
      const power=bullet.energy/16;
      const x=(bullet.x-camera.left)*scale;
      const y=(camera.top-bullet.y)*this.height/(camera.top-camera.bottom);
      const speed=Math.hypot(bullet.vx,bullet.vy)||1;
      const dx=bullet.vx/speed,dy=-bullet.vy/speed;
      // Minimum screen-space sizes keep even energy-1 tails visible on phones.
      const length=Math.max(22,(.8+bullet.energy*.32)*scale);
      const width=Math.max(2,(.08+power*.22)*scale);
      ctx.lineCap='round';
      for(let layer=3;layer>=1;layer--) {
        ctx.strokeStyle=`rgba(70,235,255,${.10/layer})`;
        ctx.lineWidth=width*layer*2;
        ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-dx*length,y-dy*length);ctx.stroke();
      }
      const count=8+Math.round(power*16);
      for(let i=0;i<count;i++) {
        const t=(i/count+bullet.age*1.8)%1;
        const spread=Math.sin(i*2.4+bullet.age*11)*width*t*2;
        const px=x-dx*t*length-dy*spread,py=y-dy*t*length+dx*spread;
        const radius=Math.max(1,Math.min(6,(1.5+power*3)*(1-t*.7)));
        ctx.fillStyle=`rgba(100,245,255,${(1-t)*.75})`;
        ctx.beginPath();ctx.arc(px,py,radius*2,0,Math.PI*2);ctx.fill();
        ctx.fillStyle=`rgba(220,255,255,${(1-t)*.95})`;
        ctx.beginPath();ctx.arc(px,py,radius,0,Math.PI*2);ctx.fill();
      }
    }
    ctx.globalCompositeOperation='source-over';
  }
}
