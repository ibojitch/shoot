import * as THREE from 'three';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/loaders/GLTFLoader.js';

export async function loadModel(url) {
  return (await new GLTFLoader().loadAsync(url)).scene;
}

export function fitModel(root, height) {
  const box=new THREE.Box3().setFromObject(root);
  const center=box.getCenter(new THREE.Vector3());
  const size=box.getSize(new THREE.Vector3());
  const wrapper=new THREE.Group();
  root.position.sub(center);wrapper.add(root);
  wrapper.scale.setScalar(height/Math.max(size.y,.001));
  return wrapper;
}
