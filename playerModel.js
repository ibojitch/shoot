import * as THREE from 'three';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/loaders/GLTFLoader.js';

const MODEL_URL = new URL('./ibojitch_player.glb', import.meta.url).href;

export function loadIbojitchPlayer() {
  const loader = new GLTFLoader();
  return new Promise((resolve, reject) => {
    loader.load(
      MODEL_URL,
      (gltf) => {
        const root = gltf.scene;
        root.name = 'ibojitch-player';

        // The GLB is modeled facing +X, with the face toward +Z (camera side).
        // Scale is chosen to roughly match the current ORBIT player footprint.
        root.scale.setScalar(0.68);
        root.position.set(0, 0, 0);
        root.rotation.set(0, 0, 0);

        root.traverse((obj) => {
          if (!obj.isMesh) return;
          obj.frustumCulled = true;
          if (obj.material) {
            obj.material.side = THREE.FrontSide;
            obj.material.needsUpdate = true;
          }
        });

        resolve(root);
      },
      undefined,
      reject
    );
  });
}
