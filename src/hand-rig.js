import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const fingers = ['index', 'middle', 'ring', 'pinky'];
const segments = ['phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip'];

async function loadSkinnedHand(side) {
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
const glove = new THREE.MeshStandardMaterial({ color: '#353a36', roughness: 0.94 });
const seam = new THREE.MeshStandardMaterial({ color: '#555950', roughness: 0.88 });

export async function loadHand(side) {
  try { return await loadSkinnedHand(side); }
  catch { return proceduralHand(side); }
}

function proceduralHand(side) {
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
