import * as THREE from 'three';

// One low-poly model, shared primitive geometry, no textures or shadows.
export function createBattleship(){
  const ship=new THREE.Group(),box=new THREE.BoxGeometry(1,1,1);
  const metal=new THREE.MeshStandardMaterial({color:0x52677c,metalness:.65,roughness:.4,flatShading:true});
  const dark=new THREE.MeshStandardMaterial({color:0x192938,metalness:.5,roughness:.55});
  const armor=new THREE.MeshStandardMaterial({color:0x8b9caa,metalness:.55,roughness:.4});
  const glow=new THREE.MeshBasicMaterial({color:0xff8b41});
  const windows=new THREE.MeshBasicMaterial({color:0x66f4eb});
  const addBox=(x,y,z,sx,sy,sz,material=metal)=>{
    const mesh=new THREE.Mesh(box,material);mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);ship.add(mesh);return mesh;
  };
  const profile=new THREE.Shape();
  profile.moveTo(-7,-2.2);for(const [x,y] of [[-4.8,-1.15],[4.8,-1.15],[6,-1.9],[4.8,-3.45],[-4.5,-3.45]])profile.lineTo(x,y);profile.closePath();
  const hull=new THREE.Mesh(new THREE.ExtrudeGeometry(profile,{depth:2,bevelEnabled:false,steps:1}),metal);hull.position.z=-1;ship.add(hull);
  addBox(0,-1.2,0,10,.22,2.5,armor);
  addBox(.5,-.7,-.35,2.6,.8,1.2,dark);addBox(.5,-.25,-.25,1.9,.3,1.4,armor);
  for(let i=0;i<7;i++){
    addBox(-4.8+i*1.45,-2.25,1.06,1.1,.75,.16,i%2?armor:dark);
    addBox(-4.8+i*1.45,-2.9,1.15,.8,.055,.055,windows);
  }
  addBox(-5.2,-1.7,1.13,2,.13,.1,glow);
  addBox(3.4,-3.65,0,2.8,.35,1.2,dark);
  const engine=new THREE.CylinderGeometry(.38,.48,1.2,8),flame=new THREE.ConeGeometry(.3,1.8,6);
  const flameMaterial=new THREE.MeshBasicMaterial({color:0xffa83e,transparent:true,opacity:.6,depthWrite:false,blending:THREE.AdditiveBlending});
  ship.userData.flames=[];
  for(const z of [-.65,.65]){
    const nozzle=new THREE.Mesh(engine,dark);nozzle.rotation.z=-Math.PI/2;nozzle.position.set(5.5,-2.35,z);ship.add(nozzle);
    const fire=new THREE.Mesh(flame,flameMaterial);fire.rotation.z=-Math.PI/2;fire.position.set(6.9,-2.35,z);ship.add(fire);ship.userData.flames.push(fire);
  }
  return ship;
}
