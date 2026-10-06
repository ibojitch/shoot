import * as THREE from 'three';
import { loadModel } from './modelLoader.js';

const MODEL_URL = new URL('./ibojitch_player.glb', import.meta.url).href;

// Face parts are geometry, not textures. Replace only the original expression.
function applyHappyFace(root) {
  const oldFace = [];
  root.traverse(obj => {
    if (/^(eye_[LR]_\d+|brow_[LR]|mouth_outer|mouth_inner|tongue)$/.test(obj.name)) {
      oldFace.push(obj);
    }
  });
  oldFace.forEach(obj => obj.removeFromParent());

  const face = new THREE.Group();
  face.name = 'happy-face';
  const dark = new THREE.MeshStandardMaterial({ color: 0x241024, roughness: .7 });
  const lip = new THREE.MeshStandardMaterial({ color: 0xec7994, roughness: .65 });
  const eyeGeometry = new THREE.CylinderGeometry(.027, .027, 1, 6);
  const circleGeometry = new THREE.SphereGeometry(1, 16, 10);

  // Two strokes per eye: low ends and a raised middle make a clear ^ shape.
  for (const centerX of [.43, .89]) {
    for (const side of [-1, 1]) {
      const dx = side * .10;
      const dy = -.12;
      const stroke = new THREE.Mesh(eyeGeometry, dark);
      stroke.scale.y = Math.hypot(dx, dy);
      stroke.rotation.z = -Math.atan2(dx, dy);
      stroke.position.set(centerX + dx / 2, .39 + dy / 2, .72);
      face.add(stroke);
    }
  }

  // A round open mouth with a thin pink lip, without a tongue or smile arc.
  const rim = new THREE.Mesh(circleGeometry, lip);
  rim.scale.set(.19, .20, .035);
  rim.position.set(.67, -.075, .705);
  face.add(rim);
  const opening = new THREE.Mesh(circleGeometry, dark);
  opening.scale.set(.145, .155, .025);
  opening.position.set(.67, -.075, .737);
  face.add(opening);
  root.add(face);
}

export async function loadIbojitchPlayer() {
        const root = await loadModel(MODEL_URL);
        root.name = 'ibojitch-player';
        applyHappyFace(root);

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

        return root;
}
