import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import { RoundedBoxGeometry } from 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/geometries/RoundedBoxGeometry.js';

const sphere = new THREE.SphereGeometry(1, 16, 12);
const glove = new THREE.MeshStandardMaterial({ color: '#353a36', roughness: 0.94 });
const seam = new THREE.MeshStandardMaterial({ color: '#555950', roughness: 0.88 });

export async function loadHand(side) {
  const root = new THREE.Group();
  const palm = new THREE.Mesh(new RoundedBoxGeometry(0.081, 0.095, 0.033, 3, 0.014), glove);
  palm.position.set(0, -0.046, -0.002);
  root.add(palm);

  const fingers = [];
  const fingerXs = [-0.029, -0.010, 0.010, 0.029];
  const fingerLengths = [0.047, 0.055, 0.051, 0.043];
  for (let i = 0; i < fingerXs.length; i++) {
    const pivot = new THREE.Group();
    pivot.position.set(fingerXs[i], -0.083, 0.001);
    root.add(pivot);

    const length = fingerLengths[i];
    const proximal = new THREE.Mesh(new THREE.CapsuleGeometry(0.0084, length * 0.42, 3, 8), glove);
    proximal.position.set(0, -length * 0.26, -0.001);
    pivot.add(proximal);

    const joint = new THREE.Group();
    joint.position.set(0, -length * 0.48, 0);
    pivot.add(joint);
    const middle = new THREE.Mesh(new THREE.CapsuleGeometry(0.0072, length * 0.27, 3, 8), glove);
    middle.position.set(0, -length * 0.18, -0.001);
    joint.add(middle);

    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.0072, 12, 8), seam);
    tip.scale.set(0.9, 1.2, 0.9);
    tip.position.set(0, -length * 0.36, -0.001);
    joint.add(tip);
    fingers.push({ pivot, joint, index: i });
  }

  const thumb = new THREE.Group();
  const inward = side === 'left' ? 1 : -1;
  thumb.position.set(-inward * 0.034, -0.033, 0.003);
  thumb.rotation.z = -inward * 0.48;
  root.add(thumb);
  const thumbBase = new THREE.Mesh(new THREE.CapsuleGeometry(0.010, 0.028, 3, 8), glove);
  thumbBase.rotation.z = -inward * 0.38;
  thumbBase.position.set(-inward * 0.013, -0.015, 0.002);
  thumb.add(thumbBase);
  const thumbTip = new THREE.Mesh(new THREE.SphereGeometry(0.009, 12, 8), seam);
  thumbTip.position.set(-inward * 0.025, -0.033, 0.004);
  thumb.add(thumbTip);

  return {
    root,
    grip(amount, release = 0) {
      const squeeze = THREE.MathUtils.clamp(amount - 0.68 * release, 0, 1.35);
      for (const finger of fingers) {
        const curl = squeeze * (0.32 + finger.index * 0.025);
        finger.pivot.rotation.x = curl;
        finger.joint.rotation.x = curl * 0.72;
      }
      thumb.rotation.x = -0.16 * squeeze;
      thumb.rotation.y = -inward * 0.12 * squeeze;
    },
  };
}
