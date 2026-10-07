import * as THREE from 'three';

// Original procedural artwork. Its private PRNG never consumes combat randomness.
function randomSource(seed) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}
function texture(width, height, paint) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  paint(canvas.getContext('2d'), width, height);
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; return map;
}
function plane(map, width, height, z) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({map, transparent:true, depthWrite:false, fog:false}));
  mesh.position.z = z; return mesh;
}
export class Scenery {
  constructor(scene, walls = []) {
    this.time = 0; this.space = new THREE.Group(); this.fortress = new THREE.Group();
    scene.add(this.space, this.fortress);
    const rng = randomSource(7026);
    const nebula = texture(1536, 768, (ctx, w, h) => {
      ctx.fillStyle = '#040914'; ctx.fillRect(0, 0, w, h);
      for(let i=0;i<75;i++) {
        const x=rng()*w, y=h*.5+Math.sin(x/w*6)*h*.28+(rng()-.5)*150, r=70+rng()*180;
        const g=ctx.createRadialGradient(x,y,0,x,y,r);
        g.addColorStop(0,i%3?'rgba(33,86,123,.12)':'rgba(102,48,141,.15)'); g.addColorStop(1,'transparent');
        ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);
      }
      for(let i=0;i<850;i++){ctx.fillStyle=`rgba(169,210,238,${.12+rng()*.5})`;ctx.fillRect(rng()*w,rng()*h,rng()<.03?2:1,1);}
    });
    this.cloud=plane(nebula,76,38,-38);this.space.add(this.cloud);
    const planet=texture(768,768,(ctx,w,h)=>{
      const x=w/2,y=h/2,r=w*.42;
      const halo=ctx.createRadialGradient(x,y,r*.92,x,y,r*1.17);
      halo.addColorStop(0,'#38789a');halo.addColorStop(.4,'rgba(62,151,203,.25)');halo.addColorStop(1,'transparent');
      ctx.fillStyle=halo;ctx.fillRect(0,0,w,h);
      ctx.save();ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.clip();
      const surface=ctx.createLinearGradient(100,100,650,550);surface.addColorStop(0,'#395b7b');surface.addColorStop(.4,'#15283f');surface.addColorStop(1,'#020610');ctx.fillStyle=surface;ctx.fillRect(0,0,w,h);
      for(let i=0;i<70;i++){ctx.strokeStyle=`rgba(128,169,190,${rng()*.08})`;ctx.lineWidth=2+rng()*12;ctx.beginPath();ctx.ellipse(x,y+(rng()-.5)*r*2,r*1.2,10+rng()*50,-.4,0,Math.PI*2);ctx.stroke();}
      const shadow=ctx.createRadialGradient(x+160,y+80,70,x+80,y+50,r*1.1);shadow.addColorStop(0,'rgba(1,4,12,.97)');shadow.addColorStop(.65,'rgba(1,4,12,.8)');shadow.addColorStop(1,'transparent');ctx.fillStyle=shadow;ctx.fillRect(0,0,w,h);ctx.restore();
    });
    this.planet=plane(planet,22,22,-30);this.planet.position.set(10,6,-30);this.space.add(this.planet);
    const rift=texture(1024,256,(ctx,w,h)=>{
      ctx.translate(w/2,h/2);ctx.scale(1,.16);
      const g=ctx.createRadialGradient(0,0,0,0,0,w*.49);g.addColorStop(0,'rgba(159,169,255,.35)');g.addColorStop(.16,'rgba(112,68,187,.2)');g.addColorStop(1,'transparent');ctx.fillStyle=g;ctx.fillRect(-w/2,-h*4,w,h*8);
    });
    this.rift=plane(rift,44,10,-27);this.rift.position.set(-4,4,-27);this.rift.rotation.z=.28;this.space.add(this.rift);
    this.stars=[];
    for(let layer=0;layer<3;layer++){
      const positions=new Float32Array(100*3);
      for(let i=0;i<100;i++){positions[i*3]=(rng()-.5)*80;positions[i*3+1]=(rng()-.5)*44;positions[i*3+2]=-20-layer*2;}
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
      const points=new THREE.Points(geometry,new THREE.PointsMaterial({color:[0x8ea8bb,0x748798,0x506077][layer],size:.035+layer*.012,transparent:true,opacity:.6,fog:false}));
      this.space.add(points);this.stars.push({points,speed:.25+layer*.25});
    }
    const station=texture(768,768,(ctx,w,h)=>{
      ctx.fillStyle='#071219';ctx.fillRect(0,0,w,h);
      for(let row=0;row<6;row++)for(let col=0;col<4;col++){
        const x=col*192,y=row*128;
        const g=ctx.createLinearGradient(x,y,x+192,y+128);g.addColorStop(0,'#15232d');g.addColorStop(1,'#08121a');ctx.fillStyle=g;ctx.fillRect(x+3,y+3,186,122);
        ctx.strokeStyle='#20343e';ctx.strokeRect(x+12,y+12,168,104);
        ctx.fillStyle='#263e46';for(let j=0;j<6;j++)ctx.fillRect(x+25+j*23,y+29,13,3);
        ctx.fillStyle=row%3===0?'#826443':'#306569';ctx.fillRect(x+24,y+93,56,3);
        ctx.fillStyle='#091219';ctx.fillRect(x+120,y+32,40,49);
        ctx.fillStyle='#1e323d';for(let j=0;j<5;j++)ctx.fillRect(x+122,y+36+j*9,36,2);
      }
      for(const y of [245,510]){ctx.fillStyle='#030b11';ctx.fillRect(0,y,768,17);ctx.fillStyle='#29404a';ctx.fillRect(0,y+2,768,3);ctx.fillStyle='#13232c';ctx.fillRect(0,y+9,768,6);}
      const vignette=ctx.createLinearGradient(0,0,0,h);vignette.addColorStop(0,'transparent');vignette.addColorStop(.5,'rgba(0,3,8,.55)');vignette.addColorStop(1,'transparent');ctx.fillStyle=vignette;ctx.fillRect(0,0,w,h);
    });
    this.panels=[];
    for(let i=0;i<5;i++){const mesh=plane(station,24,24,-18);this.fortress.add(mesh);this.panels.push(mesh);}
    const beamGeometry=new THREE.BoxGeometry(.3,28,.3),beamMaterial=new THREE.MeshBasicMaterial({color:0x1c333d,fog:false});
    const lightGeometry=new THREE.BoxGeometry(.045,3,.05),lightMaterial=new THREE.MeshBasicMaterial({color:0x458582,fog:false});
    this.beams=[];
    for(let i=0;i<10;i++){
      const beam=new THREE.Mesh(beamGeometry,beamMaterial);beam.position.z=-12;this.fortress.add(beam);this.beams.push(beam);
      for(const y of [-6,6]){const light=new THREE.Mesh(lightGeometry,lightMaterial);light.position.set(.18,y,.2);beam.add(light);}
    }
    const armour=texture(256,256,(ctx,w,h)=>{
      ctx.fillStyle='#7a8b91';ctx.fillRect(0,0,w,h);
      for(let i=0;i<1500;i++){ctx.fillStyle=`rgba(20,30,35,${rng()*.13})`;ctx.fillRect(rng()*w,rng()*h,1+rng()*6,1);}
      ctx.strokeStyle='#45565f';ctx.lineWidth=3;ctx.strokeRect(3,3,250,250);
      ctx.strokeStyle='#96a4a6';ctx.lineWidth=1;ctx.strokeRect(6,6,244,244);
      for(const x of [15,241])for(const y of [15,241]){ctx.fillStyle='#3d4e58';ctx.beginPath();ctx.arc(x,y,3,0,Math.PI*2);ctx.fill();}
      ctx.fillStyle='#536770';for(let i=0;i<5;i++)ctx.fillRect(85,110+i*7,86,2);
    });
    armour.wrapS=armour.wrapT=THREE.RepeatWrapping;
    const edgeMaterial=new THREE.LineBasicMaterial({color:0x708e97,transparent:true,opacity:.6});
    for(const wall of walls){
      // Texture coordinates and trim only; collision outlines/vertices stay untouched.
      const geometry=wall.mesh.geometry,p=geometry.attributes.position,uv=new Float32Array(p.count*2);
      for(let i=0;i<p.count;i++){uv[i*2]=p.getX(i)/4;uv[i*2+1]=p.getY(i)/4;}
      geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));wall.mesh.material.map=armour;wall.mesh.material.needsUpdate=true;
      const trim=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,wall.a,.27),new THREE.Vector3(4,wall.b,.27)]);
      wall.mesh.add(new THREE.Line(trim,edgeMaterial));
    }
    this.update(0,1,0);
  }
  update(dt,stage,scroll) {
    this.time+=dt;this.space.visible=stage!==2;this.fortress.visible=stage===2;
    if(stage===2){
      this.panels.forEach((mesh,i)=>{mesh.position.x=i*24-48-(scroll*.22%24);});
      this.beams.forEach((mesh,i)=>{mesh.position.x=i*8-36-(scroll*.4%8);});
    }else{
      this.planet.position.x=10+Math.sin(this.time*.025)*.6;this.rift.material.opacity=.8+Math.sin(this.time*.25)*.12;
      for(const {points,speed} of this.stars){const p=points.geometry.attributes.position;for(let i=0;i<p.count;i++){p.array[i*3]-=speed*dt;if(p.array[i*3]<-40)p.array[i*3]+=80;}p.needsUpdate=true;}
    }
  }
}
