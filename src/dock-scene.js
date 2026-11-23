import * as THREE from 'three';
import { createDockMaterials } from './dock-materials.js';

export const dockBounds = { left: -10, right: 10, back: -16.7, front: 5.3 };
const floorWidth = 52;
const floorDepth = 45;
const floorCenterZ = -11;

function corrugatedPanel(width, height) {
  const positions = [];
  const uv = [];
  const indices = [];
  const profile = [[0, 0], [0.15, 0], [0.29, 0.085], [0.71, 0.085], [0.85, 0], [1, 0]];
  const panels = Math.round(width * 3.2);
  for (let panel = 0; panel < panels; panel++) {
    for (let i = 0; i < profile.length - 1; i++) {
      const [left, leftDepth] = profile[i];
      const [right, rightDepth] = profile[i + 1];
      const u = (panel + left) / panels;
      const v = (panel + right) / panels;
      const ax = (u - 0.5) * width;
      const bx = (v - 0.5) * width;
      const first = positions.length / 3;
      positions.push(ax, 0, leftDepth, bx, 0, rightDepth, bx, height, rightDepth, ax, height, leftDepth);
      uv.push(u, 0, v, 0, v, 1, u, 1);
      indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function groundOcclusion(obstacles) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  for (const { min, max } of obstacles) {
    const x = width * (0.5 + min.x / floorWidth);
    const y = height * (0.5 + (min.z - floorCenterZ) / floorDepth);
    const w = width * (max.x - min.x) / floorWidth;
    const h = height * (max.z - min.z) / floorDepth;
    ctx.shadowColor = '#000b';
    ctx.shadowBlur = 14;
    ctx.fillStyle = '#555';
    ctx.fillRect(x, y, w, h);
  }
  return new THREE.CanvasTexture(canvas);
}

export function createDock(renderer, scene) {
  scene.background = new THREE.Color('#26374a');
  scene.fog = new THREE.FogExp2('#26374a', 0.034);
  scene.add(new THREE.HemisphereLight(0xb4d6ff, 0x514c44, 1.05));
  const moonlight = new THREE.DirectionalLight(0xb4d5ff, 0.64);
  moonlight.position.set(-8, 11, -12);
  scene.add(moonlight);

  const materials = createDockMaterials(renderer);
  const { floor, galvanized, rubber, wood, plaque, rustRed, paintedBlue } = materials;
  const solid = (color, roughness, metalness = 0) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const steel = solid('#535a5b', 0.55, 0.54);
  const redFrame = solid('#452b24', 0.71, 0.29);
  const blueFrame = solid('#293b44', 0.69, 0.31);
  const hardware = solid('#828984', 0.49, 0.72);
  const lineMaterial = solid('#9e7841', 0.82);
  const seamMaterial = solid('#313637', 0.91);
  const obstacles = [];
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const tubeGeometry = new THREE.CylinderGeometry(1, 1, 1, 14);

  function mesh(geometry, material, x, y, z, parent = scene) {
    const object = new THREE.Mesh(geometry, material);
    object.position.set(x, y, z);
    object.castShadow = object.receiveShadow = true;
    parent.add(object);
    return object;
  }

  function box(parent, material, x, y, z, w, h, d) {
    const object = mesh(boxGeometry, material, x, y, z, parent);
    object.scale.set(w, h, d);
    return object;
  }

  function tube(parent, material, x, y, z, radius, length) {
    const object = mesh(tubeGeometry, material, x, y, z, parent);
    object.scale.set(radius, length, radius);
    return object;
  }

  function group(x, y, z, rotation = 0) {
    const object = new THREE.Group();
    object.position.set(x, y, z);
    object.rotation.y = rotation;
    scene.add(object);
    return object;
  }

  function block(object) {
    obstacles.push(new THREE.Box3().setFromObject(object));
  }

  function container(x, y, z, rotation, length, cladding, frame) {
    const root = group(x, y, z, rotation);
    box(root, frame, 0, 1.32, -1.22, length, 2.63, 2.35);
    mesh(corrugatedPanel(length - 0.2, 2.47), cladding, 0, 0.095, 0, root);
    const end = mesh(corrugatedPanel(2.29, 2.47), frame, length / 2 + 0.02, 0.095, -1.17, root);
    end.rotation.y = Math.PI / 2;
    for (const height of [0.09, 2.60]) {
      box(root, frame, 0, height, 0.09, length + 0.12, 0.16, 0.24);
      box(root, frame, length / 2, height, -1.15, 0.20, 0.16, 2.45);
    }
    for (const side of [-1, 1]) {
      const edge = side * length / 2;
      box(root, frame, edge, 1.34, 0.065, 0.17, 2.65, 0.22);
      for (const height of [0.14, 2.53]) {
        box(root, steel, edge, height, 0.09, 0.25, 0.22, 0.26);
      }
    }
    for (const pin of [-0.30, -0.86, -1.45, -2.02]) {
      tube(root, steel, length / 2 + 0.13, 1.33, pin, 0.023, 2.30);
      for (const height of [0.34, 2.31]) {
        box(root, hardware, length / 2 + 0.123, height, pin, 0.063, 0.13, 0.083);
      }
    }
    if (y < 0.1) block(root);
  }

  const ground = mesh(new THREE.PlaneGeometry(floorWidth, floorDepth), floor, 0, -0.012, floorCenterZ);
  ground.rotation.x = -Math.PI / 2;
  ground.castShadow = false;
  for (const x of [-9, -6, -3, 0, 3, 6, 9]) {
    box(scene, seamMaterial, x, -0.010, -7, 0.014, 0.002, 29).castShadow = false;
  }
  for (let z = -20; z <= 8; z += 3.5) {
    box(scene, seamMaterial, 0, -0.010, z, 28, 0.002, 0.017).castShadow = false;
    for (const x of [-5.5, 5.5]) {
      box(scene, lineMaterial, x, -0.007, z + 0.45, 0.085, 0.002, 0.95).castShadow = false;
    }
  }

  container(-8.65, 0, -5.15, Math.PI / 2, 10.4, rustRed, redFrame);
  container(-8.65, 2.68, -5.15, Math.PI / 2, 10.4, paintedBlue, blueFrame);
  container(8.9, 0, -9.5, -Math.PI / 2, 10.6, paintedBlue, blueFrame);
  container(8.9, 2.68, -9.5, -Math.PI / 2, 10.6, rustRed, redFrame);
  container(-4.85, 0, -18.2, 0, 9.5, paintedBlue, blueFrame);
  container(4.8, 0, -18.2, 0, 9.3, rustRed, redFrame);
  container(4.8, 2.68, -18.2, 0, 9.3, paintedBlue, blueFrame);
  container(1.7, 0, 8.2, Math.PI, 9.3, rustRed, redFrame);
  for (let i = 0; i < 12; i++) {
    const height = 2.5 + (i * 13 % 7) * 0.58;
    box(scene, blueFrame, -26 + 4.6 * i, height / 2, -27 - (i % 4) * 1.6,
      3.9, height, 2.9).castShadow = false;
  }

  function lamp(x, z, height, reachX, reachZ, power, shadowSize) {
    const pole = tube(scene, galvanized, x, height / 2, z, 0.086, height);
    block(pole);
    box(scene, galvanized, x, height - 0.1, z + 0.52, 0.12, 0.12, 1.24);
    box(scene, steel, x, height - 0.14, z + 1.14, 0.51, 0.19, 0.79);
    const emitter = new THREE.MeshBasicMaterial({
      color: new THREE.Color().setRGB(5.8, 3.15, 0.91),
    });
    const lens = box(scene, emitter, x, height - 0.245, z + 1.14, 0.39, 0.022, 0.66);
    lens.castShadow = false;
    const light = new THREE.SpotLight(0xffbb70, power, 25, 0.91, 0.62);
    light.position.set(x, height - 0.30, z + 1.14);
    light.target.position.set(reachX, 0, reachZ);
    light.castShadow = shadowSize > 0;
    if (light.castShadow) {
      light.shadow.mapSize.set(shadowSize, shadowSize);
      light.shadow.camera.near = 0.45;
      light.shadow.camera.far = 24;
      light.shadow.normalBias = 0.026;
      light.shadow.bias = -0.00016;
      light.shadow.radius = 2.3;
    }
    scene.add(light, light.target);
  }

  lamp(-5.45, -5.6, 5.6, -1.7, -3.5, 535, 768);
  lamp(5.95, -13.35, 6.4, 1.2, -9.9, 685, 1024);
  lamp(-7.9, -20, 6.5, -3, -14, 580, 0);
  const bouncedLight = new THREE.PointLight(0x8ab9f1, 13, 11);
  bouncedLight.position.set(2.2, 2.8, -1.6);
  scene.add(bouncedLight);

  function pallet(x, z, angle) {
    const root = group(x, 0, z, angle);
    for (const px of [-0.55, 0, 0.55]) {
      box(root, wood, px, 0.11, 0, 0.12, 0.12, 0.97);
      box(root, wood, px, 0.027, 0, 0.15, 0.039, 0.99);
    }
    for (let i = 0; i < 6; i++) {
      const pz = -0.43 + i * 0.172;
      box(root, wood, 0, 0.193, pz, 1.33, 0.052, 0.14);
      for (const px of [-0.55, 0, 0.55]) {
        tube(root, hardware, px, 0.222, pz, 0.009, 0.005);
      }
    }
    block(root);
  }
  pallet(-4.35, -4.25, -0.14);
  pallet(-6.7, -11.8, 0.10);

  const rail = group(4.85, 0, -4.5, -0.16);
  for (const x of [-1.09, 1.09]) {
    box(rail, galvanized, x, 0.027, 0, 0.22, 0.054, 0.28);
    box(rail, galvanized, x, 0.44, 0, 0.105, 0.83, 0.108);
    for (const z of [-0.093, 0.093]) tube(rail, hardware, x, 0.063, z, 0.023, 0.024);
  }
  for (const y of [0.44, 0.83]) box(rail, galvanized, 0, y, 0, 2.37, 0.10, 0.11);
  box(rail, rubber, 0, 0.48, 0.114, 0.88, 0.21, 0.17);
  for (let i = -3; i <= 3; i++) box(rail, rubber, i * 0.106, 0.49, 0.216, 0.054, 0.148, 0.041);
  block(rail);

  const tire = mesh(new THREE.TorusGeometry(0.36, 0.109, 14, 42), rubber, 6.35, 0.49, -3.9);
  tire.rotation.y = -0.22;
  block(tire);

  const sign = group(3.55, 0, -5.72, -0.08);
  box(sign, galvanized, 0, 0.61, -0.09, 0.115, 1.23, 0.13);
  box(sign, steel, 0, 0.037, -0.09, 0.58, 0.074, 0.44);
  box(sign, steel, 0, 1.18, 0, 0.90, 0.49, 0.048);
  box(sign, plaque, 0, 1.18, 0.032, 0.864, 0.454, 0.028);
  for (const x of [-0.396, 0.396]) {
    for (const y of [0.987, 1.373]) {
      const screw = tube(sign, hardware, x, y, 0.055, 0.016, 0.014);
      screw.rotation.x = Math.PI / 2;
    }
  }
  block(sign);
  floor.aoMap = groundOcclusion(obstacles);

  // Capture the actual yard so metals pick up broad shapes and lamp colors.
  const probeTarget = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType });
  const probe = new THREE.CubeCamera(0.1, 65, probeTarget);
  probe.position.set(0.8, 2.4, -6.5);
  probe.updateMatrixWorld(true);
  renderer.shadowMap.needsUpdate = true;
  renderer.shadowMap.autoUpdate = false;
  probe.update(renderer, scene);
  renderer.shadowMap.autoUpdate = true;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromCubemap(probeTarget.texture);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.84;
  pmrem.dispose();
  probeTarget.dispose();

  return { ground, obstacles, targetMaterial: steel };
}
