import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const fingers = ['index', 'middle', 'ring', 'pinky'];
const segments = ['phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip'];

export async function loadHand(side) {
  const { scene } = await loader.loadAsync(`/hands/${side}.glb`);
  let mesh;
  scene.traverse(object => { if (object.isSkinnedMesh) mesh = object; });
  const wrist = mesh.skeleton.getBoneByName('wrist');
  const sign = side === 'left' ? 1 : -1;
  scene.updateMatrixWorld(true);
  const joints = [];
  // WebXR supplies absolute joint poses. Restore finger chains for local animation.
  for (const finger of [...fingers, 'thumb']) {
    const prefix = finger === 'thumb' ? 'thumb' : finger + '-finger';
    const names = ['metacarpal', ...segments].filter(name => finger !== 'thumb' || name !== 'phalanx-intermediate');
    let parent = wrist;
    for (const name of names) {
      const bone = mesh.skeleton.getBoneByName(prefix + '-' + name);
      const worldRotation = bone.getWorldQuaternion(new THREE.Quaternion());
      parent.attach(bone);
      if (name !== 'tip' && name !== 'metacarpal') {
        const axis = finger === 'thumb' ? new THREE.Vector3(0, -sign, 0) : new THREE.Vector3(0, 0, sign);
        axis.applyQuaternion(worldRotation.invert());
        const curl = finger === 'thumb' ? 0.47 : [0.76, 1.05, 0.60][segments.indexOf(name)];
        const weight = finger === 'index' ? 0.82 : 1 + 0.045 * fingers.indexOf(finger);
        const delay = finger === 'thumb' ? 0.05 : fingers.indexOf(finger) * 0.025;
        joints.push({ bone, axis, rest: bone.quaternion.clone(), curl: curl * weight, delay });
      }
      parent = bone;
    }
  }
  // Tint the palm and fingertips separately using the undeformed skin weights.
  const { position, normal, skinIndex, skinWeight } = mesh.geometry.attributes;
  const colors = [], base = new THREE.Color('#b77c61'), rosy = new THREE.Color('#d8957c');
  const tint = new THREE.Color();
  const roughness = [];
  const knuckle = new THREE.Color('#b96e5d');
  for (let i = 0; i < position.count; i++) {
    let tips = 0, jointsWeight = 0;
    for (let k = 0; k < 4; k++) {
      const bone = mesh.skeleton.bones[skinIndex.getComponent(i, k)];
      const weight = skinWeight.getComponent(i, k);
      if (/distal|tip/.test(bone.name)) tips += weight;
      if (/proximal|intermediate/.test(bone.name)) jointsWeight += weight;
    }
    tint.copy(base).lerp(rosy, THREE.MathUtils.clamp(0.18 + normal.getX(i) * sign * 0.26 + tips * 0.42, 0, 1));
    const palm = THREE.MathUtils.clamp(0.5 + sign * normal.getX(i) * 0.5, 0, 1);
    tint.lerp(knuckle, jointsWeight * (1-palm) * 0.36);
    roughness.push(0.69 + palm*0.12 - tips*0.07);
    colors.push(tint.r, tint.g, tint.b);
  }
  mesh.geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  mesh.material.dispose();
  mesh.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.73 });
  mesh.geometry.setAttribute('skinRoughness', new THREE.Float32BufferAttribute(roughness, 1));
  mesh.material.onBeforeCompile = shader => {
    shader.vertexShader = 'attribute float skinRoughness; varying float handRoughness;\n' +
      shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nhandRoughness = skinRoughness;');
    shader.fragmentShader = 'varying float handRoughness;\n' +
      shader.fragmentShader.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = handRoughness;');
  };
  mesh.frustumCulled = false;
  scene.position.copy(wrist.position).negate();
  const root = new THREE.Group();
  root.add(scene);
  const rotation = new THREE.Quaternion();
  function grip(amount, release = 0) {
    for (const joint of joints) {
      const opening = THREE.MathUtils.smoothstep(release, joint.delay, 0.94 + joint.delay);
      rotation.setFromAxisAngle(joint.axis, joint.curl * (amount - 0.68 * opening));
      joint.bone.quaternion.copy(joint.rest).multiply(rotation);
    }
  }
  return { root, grip };
}
