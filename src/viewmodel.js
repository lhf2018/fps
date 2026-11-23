import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

function woodFinish() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d');
  const image = context.createImageData(256, 256);
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const line = y + 3 * Math.sin(x / 67 + y / 18) + 1.3 * Math.sin(x / 22);
      const grain = 12 * Math.sin(line * 0.36) + 7 * Math.sin(line * 1.41) + 5 * Math.cos(line * 2.19);
      const i = (y * 256 + x) * 4;
      image.data[i] = 151 + grain;
      image.data[i + 1] = 83 + grain * 0.66;
      image.data[i + 2] = 44 + grain * 0.36;
      image.data[i + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  return new THREE.MeshStandardMaterial({ map, roughness: 0.57 });
}

export function createViewmodel() {
  const model = new THREE.Group();
  const alloy = new THREE.MeshStandardMaterial({ color: '#3d4347', roughness: 0.42, metalness: 0.28 });
  const dark = new THREE.MeshStandardMaterial({ color: '#25292b', roughness: 0.59, metalness: 0.16 });
  const rubber = new THREE.MeshStandardMaterial({ color: '#171b1d', roughness: 0.93 });
  const fabric = new THREE.MeshStandardMaterial({ color: '#343830', roughness: 1 });
  const wood = woodFinish();

  function part(surface, geometry, x, y, z) {
    const mesh = new THREE.Mesh(geometry, surface);
    mesh.position.set(x, y, z);
    model.add(mesh);
    return mesh;
  }

  function shell(surface, x, y, z, width, height, depth, radius = 0.012) {
    return part(surface, new RoundedBoxGeometry(width, height, depth, 2, radius), x, y, z);
  }

  shell(dark, 0, -0.015, 0.012, 0.106, 0.091, 0.32);
  shell(alloy, 0, 0.045, 0.004, 0.101, 0.065, 0.295, 0.028);
  shell(wood, 0, -0.018, -0.281, 0.104, 0.084, 0.222, 0.024);
  shell(wood, 0, 0.055, -0.292, 0.078, 0.045, 0.19, 0.019);
  shell(dark, 0, 0.007, -0.395, 0.085, 0.093, 0.027);
  shell(wood, 0, -0.058, 0.289, 0.1, 0.12, 0.27, 0.021).rotation.x = 0.16;
  shell(wood, 0, -0.117, 0.073, 0.078, 0.153, 0.083).rotation.x = -0.24;

  const frontTube = part(alloy, new THREE.CylinderGeometry(0.017, 0.017, 0.26, 16), 0, 0.026, -0.505);
  frontTube.rotation.x = Math.PI / 2;
  shell(dark, 0, 0.065, -0.556, 0.051, 0.087, 0.032);
  for (const side of [-1, 1]) {
    shell(alloy, side * 0.022, 0.111, -0.556, 0.012, 0.044, 0.031, 0.005);
  }
  shell(alloy, 0, 0.092, -0.115, 0.052, 0.023, 0.061, 0.008);

  // A bevel catches the room lights along the curved magazine silhouette.
  const profile = new THREE.Shape();
  profile.moveTo(0.026, -0.05);
  profile.lineTo(0.154, -0.05);
  profile.quadraticCurveTo(0.177, -0.192, 0.266, -0.275);
  profile.quadraticCurveTo(0.207, -0.306, 0.144, -0.307);
  profile.quadraticCurveTo(0.045, -0.226, 0.026, -0.05);
  const magazine = new THREE.ExtrudeGeometry(profile, {
    depth: 0.064, steps: 1, curveSegments: 10, bevelSize: 0.009, bevelThickness: 0.009, bevelSegments: 2,
  });
  magazine.translate(0, 0, -0.032);
  magazine.rotateY(Math.PI / 2);
  part(dark, magazine, 0, 0, 0);

  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      shell(alloy, side * 0.038, -0.104 - i * 0.034, -0.105 - i * 0.014,
        0.008, 0.011, 0.085, 0.004).rotation.x = -i * 0.075;
    }
  }

  // The support glove and sleeve remain attached during the reload gesture.
  const palm = part(rubber, new THREE.CapsuleGeometry(0.036, 0.082, 5, 12), -0.037, -0.083, -0.29);
  palm.rotation.x = 1.45;
  const finger = new THREE.CapsuleGeometry(0.013, 0.026, 4, 8);
  for (let index = 0; index < 4; index++) {
    part(fabric, finger, -0.056, -0.04, -0.341 + index * 0.025).rotation.z = -0.45;
  }
  const sleeve = part(fabric, new THREE.CapsuleGeometry(0.046, 0.28, 5, 12), -0.061, -0.168, -0.143);
  sleeve.rotation.x = -1.02;
  const gripGlove = part(rubber, new THREE.CapsuleGeometry(0.039, 0.074, 5, 12), 0.021, -0.123, 0.105);
  gripGlove.rotation.x = -0.36;

  return model;
}
