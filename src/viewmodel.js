import * as THREE from 'three';
import { loadHand } from './hand-rig.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function wornFinish(cloth) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const pixels = ctx.createImageData(256, 256);
  let seed = 1729;
  function noise() {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const pattern = cloth ? ((x + (y >> 1)) % 4 === 0 ? 35 : 0) : 9 * Math.sin(y * 1.5);
      const v = 178 + pattern + noise() * 43 + 10 * Math.sin(x * 0.08 + Math.sin(y * 0.043));
      const i = (y * 256 + x) * 4;
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = v;
      pixels.data[i + 3] = 255;
    }
  }
  ctx.putImageData(pixels, 0, 0);
  if (!cloth) {
    ctx.lineWidth = 0.55;
    for (let i = 0; i < 46; i++) {
      const x = noise() * 256, y = noise() * 256;
      ctx.strokeStyle = i % 3 ? '#fff3' : '#25262930';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 2 + noise() * 19, y + noise() * 4 - 2);
      ctx.stroke();
    }
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  return map;
}

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
  return new THREE.MeshStandardMaterial({ map, color: '#c2ab99', roughness: 0.52, bumpMap: map, bumpScale: 0.00035 });
}

// Cross sections along the length of the stock, from its narrow neck to the heel.
function stockGeometry() {
  const rings = [
    [0.14, -0.026, 0.037, 0.041], [0.175, -0.028, 0.039, 0.041],
    [0.218, -0.044, 0.033, 0.038], [0.28, -0.052, 0.038, 0.051],
    [0.415, -0.064, 0.044, 0.072], [0.426, -0.064, 0.043, 0.071],
  ];
  const vertices = [], uvs = [], indices = [];
  const sides = 16;
  for (const [z, y, w, h] of rings) {
    for (let i = 0; i <= sides; i++) {
      const angle = i * 2 * Math.PI / sides;
      const xRadius = Math.cos(angle), yRadius = Math.sin(angle);
      vertices.push(w * Math.sign(xRadius) * Math.sqrt(Math.abs(xRadius)),
        y + h * Math.sign(yRadius) * Math.sqrt(Math.abs(yRadius)), z);
      uvs.push((z - 0.14) * 3, i / sides);
    }
  }
  for (let ring = 0; ring < rings.length - 1; ring++) {
    for (let i = 0; i < sides; i++) {
      const a = ring * (sides + 1) + i, b = a + sides + 1;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export async function createViewmodel() {
  const [left, right] = await Promise.all([loadHand('left'), loadHand('right')]);
  const model = new THREE.Group();
  const parts = new Map();
  const wear = new THREE.TextureLoader().load('/materials/metal-rough.jpg');
  const steelFinish = wornFinish(false);
  const alloy = new THREE.MeshPhysicalMaterial({
    color: '#515a64', map: steelFinish, roughnessMap: wear, roughness: 0.64, metalness: 0.72,
    bumpMap: steelFinish, bumpScale: 0.00012, clearcoat: 0.21, clearcoatRoughness: 0.3,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: '#333c43', roughness: 0.48, metalness: 0.57, bumpMap: steelFinish, bumpScale: 0.0001,
  });
  const contact = new THREE.MeshStandardMaterial({ color: '#707981', roughness: 0.33, metalness: 0.76 });
  const polymer = new THREE.MeshStandardMaterial({
    color: '#444337', roughness: 0.87, bumpMap: steelFinish, bumpScale: 0.00035,
  });
  const rubber = new THREE.MeshStandardMaterial({ color: '#171b1d', roughness: 0.93 });
  const weave = wornFinish(true);
  const fabric = new THREE.MeshStandardMaterial({ color: '#646451', map: weave, bumpMap: weave, bumpScale: 0.0005, roughness: 0.94 });
  const wood = woodFinish();

  function part(surface, geometry, x, y, z) {
    const mesh = new THREE.Mesh(geometry, surface);
    mesh.position.set(x, y, z);
    if (!parts.has(surface)) parts.set(surface, []);
    parts.get(surface).push(mesh);
    return mesh;
  }

  function shell(surface, x, y, z, width, height, depth, radius = 0.012) {
    return part(surface, new RoundedBoxGeometry(width, height, depth, 2, radius), x, y, z);
  }

  shell(dark, 0, -0.015, 0.012, 0.106, 0.091, 0.32);
  shell(alloy, 0, 0.045, 0.004, 0.101, 0.065, 0.295, 0.028);
  shell(polymer, 0, -0.018, -0.281, 0.086, 0.076, 0.222, 0.024);
  shell(polymer, 0, 0.055, -0.292, 0.078, 0.045, 0.19, 0.019);
  shell(dark, 0, 0.007, -0.395, 0.085, 0.093, 0.027);
  part(wood, stockGeometry(), 0, 0, 0);
  shell(rubber, 0, -0.064, 0.426, 0.088, 0.144, 0.018, 0.013);
  shell(polymer, 0, -0.114, 0.073, 0.052, 0.126, 0.062, 0.018).rotation.x = -0.24;

  const frontTube = part(alloy, new THREE.CylinderGeometry(0.017, 0.017, 0.26, 16), 0, 0.026, -0.505);
  frontTube.rotation.x = Math.PI / 2;
  shell(dark, 0, 0.065, -0.556, 0.051, 0.087, 0.032);
  for (const side of [-1, 1]) {
    shell(alloy, side * 0.022, 0.111, -0.556, 0.012, 0.044, 0.031, 0.005);
  }
  shell(alloy, 0, 0.092, -0.115, 0.052, 0.023, 0.061, 0.008);
  for (const side of [-1, 1]) {
    shell(dark, side * 0.019, 0.107, -0.098, 0.013, 0.020, 0.018, 0.003);
    for (const z of [-0.112, -0.079, 0.103]) {
      const rivet = part(contact, new THREE.CylinderGeometry(0.006, 0.006, 0.006, 10),
        side * 0.053, -0.012, z);
      rivet.rotation.z = Math.PI / 2;
    }
    for (let i = 0; i < 3; i++) {
      shell(dark, side * 0.038, 0.012, -0.22 - i * 0.054, 0.008, 0.011, 0.032, 0.004);
    }
  }
  shell(alloy, 0, 0.079, 0.106, 0.041, 0.012, 0.056, 0.004);
  for (const z of [0.026, 0.050, 0.074]) {
    shell(alloy, 0, 0.051, z, 0.102, 0.058, 0.005, 0.002);
  }
  shell(alloy, -0.054, 0.002, -0.007, 0.006, 0.014, 0.072, 0.003);
  shell(dark, 0, -0.088, 0.002, 0.017, 0.012, 0.085, 0.005);
  shell(dark, 0, -0.069, -0.037, 0.017, 0.045, 0.012, 0.005);
  right.root.position.set(0.049, -0.115, 0.177);
  right.root.rotation.set(1.61, 0.28, 0.03, 'YXZ');
  right.grip(1.10);
  model.add(right.root);
  const sightCenter = new THREE.Vector3(0, 0.158, -0.012);
  shell(dark, 0, 0.099, -0.026, 0.073, 0.041, 0.095, 0.007);
  for (const z of [-0.048, -0.018]) {
    part(alloy, new THREE.TorusGeometry(0.042, 0.005, 8, 40), 0, sightCenter.y, z);
  }
  for (const side of [-1, 1]) {
    shell(dark, side * 0.041, 0.142, -0.033, 0.009, 0.037, 0.039, 0.004);
  }
  const glass = new THREE.Mesh(new THREE.CircleGeometry(0.038, 40),
    new THREE.MeshPhysicalMaterial({
      color: 0x649e9c, metalness: 0.24, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.12,
      transparent: true, opacity: 0.16, depthWrite: false,
    }));
  glass.position.copy(sightCenter);
  glass.position.z -= 0.012;
  model.add(glass);
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.0017, 20),
    new THREE.MeshBasicMaterial({ color: 0xff4932, toneMapped: false }));
  dot.position.copy(sightCenter);
  model.add(dot);
  flushParts(model);

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

  const mag = new THREE.Group();
  flushParts(mag);
  model.add(mag, left.root);
  const sleeve = new THREE.Group();
  const cloth = part(fabric, new THREE.CylinderGeometry(0.035, 0.065, 0.94, 16), 0, 0.47, 0);
  cloth.scale.set(1, 0.99, 0.9);
  part(rubber, new THREE.CylinderGeometry(0.032, 0.036, 0.07, 16), 0, 0.959, 0);
  for (const y of [0.30, 0.46, 0.78]) {
    const r = 0.065 - 0.032 * y;
    part(fabric, new THREE.CylinderGeometry(r, r + 0.005, 0.055, 16), 0, y, 0).rotation.z = 0.01;
  }
  flushParts(sleeve);
  const rightSleeve = sleeve.clone();
  const upperSleeve = new THREE.Group();
  part(fabric, new THREE.CylinderGeometry(0.069, 0.084, 1.04, 16), 0, 0.50, 0);
  flushParts(upperSleeve);
  model.add(sleeve, rightSleeve, upperSleeve);

  function flushParts(group) {
    const sourceGeometries = new Set();
    for (const [material, meshes] of parts) {
      const geometries = meshes.map(mesh => {
        const source = mesh.geometry;
        sourceGeometries.add(source);
        mesh.updateMatrix();
        const geometry = source.index ? source.toNonIndexed() : source.clone();
        return geometry.applyMatrix4(mesh.matrix);
      });
      group.add(new THREE.Mesh(mergeGeometries(geometries), material));
      for (const geometry of geometries) geometry.dispose();
    }
    for (const geometry of sourceGeometries) geometry.dispose();
    parts.clear();
  }

  const elbow = new THREE.Vector3();
  const shoulder = new THREE.Vector3();
  const rightArmStart = new THREE.Vector3();
  const bodyToModel = new THREE.Matrix4();
  const reachAxis = new THREE.Vector3();
  const elbowBend = new THREE.Vector3();
  const wrist = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  function alignSleeve(arm, start, end) {
    wrist.copy(end).sub(start);
    arm.position.copy(start);
    arm.scale.y = wrist.length();
    arm.quaternion.setFromUnitVectors(up, wrist.normalize());
  }
  const supportWrist = new THREE.Vector3(-0.063, -0.074, -0.194);
  const magazineWrist = new THREE.Vector3(-0.059, -0.167, -0.106);
  const movingGrip = new THREE.Vector3();
  const supportRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(1.79, 0.26, 0.19, 'YXZ'));
  const gripRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(1.22, 0.32, 0.14, 'YXZ'));
  const movingRotation = new THREE.Quaternion();
  function poseReload(progress, bodyOffset = 0.31) {
    const ease = (a, b) => THREE.MathUtils.smoothstep(progress, a, b);
    const travel = ease(0.075, 0.29) - ease(0.78, 0.95);
    const release = ease(0.01, 0.095) - ease(0.25, 0.34)
      + ease(0.735, 0.81) - ease(0.925, 0.995);
    const draw = ease(0.345, 0.51) - ease(0.535, 0.73);
    mag.position.set(-0.039 * draw, -0.155 * draw, -0.025 * draw);
    mag.rotation.x = -0.12 * draw;
    movingGrip.copy(magazineWrist).applyQuaternion(mag.quaternion).add(mag.position);
    movingRotation.multiplyQuaternions(mag.quaternion, gripRotation);
    left.root.position.lerpVectors(supportWrist, movingGrip, travel);
    const clearance = 4 * travel * (1 - travel);
    left.root.position.x -= 0.072 * clearance;
    left.root.position.y -= 0.029 * clearance;
    left.root.quaternion.slerpQuaternions(supportRotation, movingRotation, travel);
    left.grip(0.82 + 0.29 * travel, release);
    model.updateMatrix();
    bodyToModel.copy(model.matrix).invert();
    shoulder.set(bodyOffset - 0.34, -0.40, -0.30).applyMatrix4(bodyToModel);
    rightArmStart.set(bodyOffset + 0.23, -0.55, -0.15).applyMatrix4(bodyToModel);
    alignSleeve(rightSleeve, rightArmStart, right.root.position);
    // Solve the elbow in the outward/downward plane while the wrist follows the grip.
    reachAxis.subVectors(left.root.position, shoulder);
    const distance = reachAxis.length();
    reachAxis.divideScalar(distance);
    const upper = 0.36, forearm = 0.32;
    const along = Math.min(upper, (upper * upper - forearm * forearm + distance * distance) / (2 * distance));
    const bend = Math.sqrt(Math.max(0, upper * upper - along * along));
    elbowBend.set(-0.7, -1, 0);
    elbowBend.addScaledVector(reachAxis, -elbowBend.dot(reachAxis)).normalize();
    elbow.copy(shoulder).addScaledVector(reachAxis, along).addScaledVector(elbowBend, bend);
    alignSleeve(upperSleeve, shoulder, elbow);
    alignSleeve(sleeve, elbow, left.root.position);
  }
  model.traverse(object => { if (object.isMesh) object.receiveShadow = true; });
  const muzzle = new THREE.Group();
  muzzle.position.set(0, 0.026, -0.635);
  muzzle.visible = false;
  model.add(muzzle);
  // Three crossed sheets share a hot spine and taper into irregular orange tips.
  const flareGeometry = new THREE.BufferGeometry();
  const tip = [0.008, 0, -0.214];
  flareGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0, 0.033, 0, -0.041, 0, 0, -0.069,
    0, 0, -0.069, 0.033, 0, -0.041, 0.022, 0, -0.092,
    0, 0, -0.069, 0.022, 0, -0.092, ...tip,
    0, 0, 0, 0, 0, -0.069, -0.029, 0, -0.054,
    0, 0, -0.069, -0.014, 0, -0.126, -0.029, 0, -0.054,
    0, 0, -0.069, ...tip, -0.014, 0, -0.126,
  ], 3));
  const white = new THREE.Color(0xffeed2);
  const orange = new THREE.Color(0xe34d09).multiplyScalar(0.48);
  const colors = [white, orange, white, white, orange, orange, white, orange, orange,
    white, white, orange, white, orange, orange, white, orange, orange];
  flareGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors.flatMap(color => color.toArray()), 3));
  const flareMaterial = new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    transparent: true, depthWrite: false, toneMapped: false, forceSinglePass: true,
  });
  const sheets = Array.from({ length: 3 }, (_, i) => {
    const sheet = new THREE.Mesh(flareGeometry, flareMaterial);
    sheet.rotation.z = i * Math.PI / 3;
    muzzle.add(sheet);
    return sheet;
  });
  const light = new THREE.PointLight(0xffac64, 0, 3.4);
  function setStrength(strength) {
    muzzle.visible = strength > 0;
    flareMaterial.opacity = strength;
    light.intensity = 3.8 * strength * strength;
    if (muzzle.visible) muzzle.getWorldPosition(light.position);
  }
  function ignite(aim) {
    muzzle.rotation.z = Math.random() * Math.PI * 2;
    const width = (0.85 + Math.random() * 0.3) * (1 - 0.4 * aim);
    muzzle.scale.set(width, width, 0.82 + Math.random() * 0.35);
    for (const sheet of sheets) sheet.scale.x = 0.8 + Math.random() * 0.45;
    emitSmoke();
  }
  const mist = document.createElement('canvas');
  mist.width = mist.height = 64;
  const brush = mist.getContext('2d');
  for (let i = 0; i < 18; i++) {
    const x = 18 + Math.random() * 28, y = 18 + Math.random() * 28;
    const fog = brush.createRadialGradient(x, y, 0, x, y, 16);
    fog.addColorStop(0, '#c4c4ba60');
    fog.addColorStop(1, '#aaa89e00');
    brush.fillStyle = fog;
    brush.fillRect(x - 16, y - 16, 32, 32);
  }
  const mistMap = new THREE.CanvasTexture(mist);
  const puffs = Array.from({ length: 6 }, () => {
    const puff = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistMap, depthWrite: false }));
    puff.visible = false;
    return { puff, age: 1, velocity: new THREE.Vector3() };
  });
  let puffIndex = 0;
  function emitSmoke() {
    const item = puffs[puffIndex];
    puffIndex = (puffIndex + 1) % puffs.length;
    muzzle.getWorldPosition(item.puff.position);
    model.getWorldDirection(item.velocity).multiplyScalar(-0.55);
    item.velocity.y += 0.32;
    item.velocity.x += 0.10 * Math.random();
    item.age = 0;
    item.puff.material.rotation = Math.random() * Math.PI;
    item.puff.scale.setScalar(0.055);
    item.puff.material.opacity = 0.28;
    item.puff.visible = true;
  }
  function updateSmoke(dt) {
    for (const item of puffs) {
      if (!item.puff.visible) continue;
      item.age += dt;
      item.puff.position.addScaledVector(item.velocity, dt);
      item.puff.scale.setScalar(0.055 + item.age * 0.45);
      item.puff.material.opacity = 0.28 * Math.max(0, 1 - item.age / 0.46);
      item.puff.visible = item.age < 0.46;
    }
  }
  function clearSmoke() {
    for (const { puff } of puffs) puff.visible = false;
  }
  return { model, poseReload, sightCenter, dot,
    flash: { light, smoke: puffs.map(item => item.puff), ignite, setStrength, updateSmoke, clearSmoke } };
}
