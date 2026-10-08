import * as THREE from 'three';
import { STAGE2_DATA } from './stage2Data.js';

// Segment vs expanded rectangle. Terrain scroll is included in relative motion.
export function terrainHitTime(entity, rect) {
  const radius=entity.radius;
  const x=(entity.previousX??entity.x)-((rect.previousLeft??rect.left)-rect.left),y=entity.previousY??entity.y;
  const dx=entity.x-x,dy=entity.y-y;
  let enter=0,exit=1;
  for(const [origin,velocity,lo,hi] of [[x,dx,rect.left-radius,rect.right+radius],[y,dy,rect.bottom-radius,rect.top+radius]]){
    if(Math.abs(velocity)<1e-9){if(origin<lo||origin>hi)return Infinity;continue;}
    const a=(lo-origin)/velocity,b=(hi-origin)/velocity;
    enter=Math.max(enter,Math.min(a,b));exit=Math.min(exit,Math.max(a,b));
    if(enter>exit)return Infinity;
  }
  return enter;
}

// Swept circle against a convex counter-clockwise outline (expanded half planes).
export function polygonHitTime(entity,vertices,scroll=0){
  const x=(entity.previousX??entity.x)-scroll,y=entity.previousY??entity.y;
  const dx=entity.x-x,dy=entity.y-y;let enter=0,exit=1;
  for(let i=0;i<vertices.length;i++){
    const a=vertices[i],b=vertices[(i+1)%vertices.length],ex=b[0]-a[0],ey=b[1]-a[1];
    const distance=ex*(y-a[1])-ey*(x-a[0])+entity.radius*Math.hypot(ex,ey),speed=ex*dy-ey*dx;
    if(Math.abs(speed)<1e-9){if(distance<0)return Infinity;continue;}
    const time=-distance/speed;if(speed>0)enter=Math.max(enter,time);else exit=Math.min(exit,time);
    if(enter>exit)return Infinity;
  }
  return enter;
}

function boundary(i,side){const a=STAGE2_DATA.sections[Math.max(0,i-1)],b=STAGE2_DATA.sections[Math.min(i,STAGE2_DATA.sections.length-1)];return (a[side]+b[side])/2;}
function rockGeometry(points,index){
  const positions=[],center=[2,points.reduce((sum,p)=>sum+p[1],0)/4,1.2+.4*Math.sin(index*2.3)];
  const tri=(a,b,c)=>positions.push(...a,...b,...c);
  for(let i=0;i<4;i++){
    const a=points[i],b=points[(i+1)%4],frontA=[...a,.25],frontB=[...b,.25],backA=[...a,-2.5],backB=[...b,-2.5];
    tri(frontA,frontB,center);tri(frontB,frontA,backA);tri(frontB,backA,backB);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.computeVertexNormals();return geometry;
}
export class Terrain {
  constructor(scene){
    const materials=[0x314857,0x405765,0x354b60,0x4c5963].map(color=>new THREE.MeshStandardMaterial({color,roughness:.85,metalness:.2,flatShading:true,side:THREE.DoubleSide}));
    this.walls=STAGE2_DATA.sections.flatMap((section,i)=>['bottom','top'].map(side=>{
      const a=boundary(i,side),b=boundary(i+1,side),width=STAGE2_DATA.width;
      const outline=side==='bottom'?[[0,-10],[width,-10],[width,b],[0,a]]:[[0,a],[width,b],[width,10],[0,10]];
      const mesh=new THREE.Mesh(rockGeometry(outline,i),materials[i%materials.length]);scene.add(mesh);
      return {mesh,section,i,side,a,b,outline,left:0,right:0,bottom:0,top:0,vertices:outline.map(p=>p.slice())};
    }));this.reset();
  }
  reset(){this.active=false;this.offset=0;this.colliders=[];for(const wall of this.walls)wall.mesh.visible=false;}
  update(offset){
    const old=this.offset;this.offset=offset;this.active=true;this.colliders.length=0;
    for(const wall of this.walls){
      wall.left=STAGE2_DATA.startX+wall.i*STAGE2_DATA.width-offset;wall.right=wall.left+STAGE2_DATA.width;wall.scroll=offset-old;
      wall.mesh.visible=wall.right>-19&&wall.left<20;if(!wall.mesh.visible)continue;
      wall.mesh.position.set(wall.left,0,0);
      wall.vertices.forEach((p,i)=>{p[0]=wall.left+wall.outline[i][0];p[1]=wall.outline[i][1];});this.colliders.push(wall);
    }
  }
  gapAt(x){
    const map=(x+this.offset-STAGE2_DATA.startX)/STAGE2_DATA.width,i=Math.floor(map),t=map-i;
    if(i<0||i>=STAGE2_DATA.sections.length)return {bottom:-8,top:8};
    return {bottom:boundary(i,'bottom')*(1-t)+boundary(i+1,'bottom')*t,top:boundary(i,'top')*(1-t)+boundary(i+1,'top')*t};
  }
  safeGap(x,radius){const a=this.gapAt(x-radius),b=this.gapAt(x+radius);return {bottom:Math.max(a.bottom,b.bottom)+radius+.08,top:Math.min(a.top,b.top)-radius-.08};}
  missileHeading(missile, desired) {
    if(!this.active)return desired;
    const direction=Math.cos(missile.heading)>=0?1:-1;
    const local=angle=>Math.atan2(Math.sin(angle),Math.cos(angle)*direction);
    // Inspect only connected traversable surfaces. A vertical face/discontinuity
    // remains a solid collision, rather than a route to climb or teleport over.
    const look=Math.max(3,Math.min(6,missile.turnRadius*1.5));
    let lower=-Math.PI/2+.02,upper=Math.PI/2-.02,constrained=false;
    for(const side of ['bottom','top']){
      const walls=this.colliders.filter(w=>w.side===side).sort((a,b)=>direction*(a.left-b.left));
      let current=walls.findIndex(w=>missile.x>=w.left&&missile.x<=w.right);
      if(current<0)continue;
      const reachable=[];
      for(let i=current;i<walls.length;i++){
        const wall=walls[i];
        if(!(wall.right>wall.left)||!Number.isFinite(wall.a)||!Number.isFinite(wall.b))break;
        if(i>current){
          const prior=walls[i-1];
          const joined=direction>0?Math.abs(prior.right-wall.left)<1e-5&&Math.abs(prior.b-wall.a)<1e-5:Math.abs(prior.left-wall.right)<1e-5&&Math.abs(prior.a-wall.b)<1e-5;
          const angle=w=>Math.atan2(w.b-w.a,w.right-w.left);
          if(!joined||Math.abs(angle(wall)-angle(prior))>=Math.PI/2-1e-6)break;
        }
        reachable.push(wall);
      }
      for(let distance=.35;distance<=look;distance+=.35){
        const x=missile.x+direction*distance,wall=reachable.find(w=>x>=w.left&&x<=w.right);
        if(!wall)break;
        const slope=(wall.b-wall.a)/(wall.right-wall.left),height=wall.a+(x-wall.left)*slope;
        // Normal clearance includes the projectile radius and a small air gap.
        const margin=(missile.radius+.22)*Math.hypot(1,slope);
        const bound=Math.atan2(height+(side==='bottom'?margin:-margin)-missile.y,distance);
        if(side==='bottom')lower=Math.max(lower,bound);else upper=Math.min(upper,bound);
        constrained=true;
      }
    }
    if(!constrained||lower>upper)return desired;
    const angle=Math.max(lower,Math.min(upper,local(desired)));
    return Math.atan2(Math.sin(angle),Math.cos(angle)*direction);
  }
  hitTime(entity){let first=Infinity;if(this.active)for(const wall of this.colliders)first=Math.min(first,polygonHitTime(entity,wall.vertices,wall.scroll));return first;}
  resolvePlayer(player){
    if(!this.active||!Number.isFinite(this.hitTime(player)))return false;
    const gap=this.safeGap(player.x,player.radius);player.y=Math.max(gap.bottom,Math.min(gap.top,player.y));player.mesh.position.set(player.x,player.y,0);return true;
  }
}
