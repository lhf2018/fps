import * as THREE from 'three';
import { loadHand } from './hand-rig.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { fbm } from './dock-materials.js';

function wornFinish(cloth, colorSpace = THREE.SRGBColorSpace) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
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
  map.colorSpace = colorSpace;
  map.anisotropy = 4;
  return map;
}

function proceduralNormal() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const pixels = ctx.createImageData(256, 256);
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const offset = (y * 256 + x) * 4;
      pixels.data[offset] = 128 + 10 * Math.sin(y * 0.72 + Math.sin(x * 0.09));
      pixels.data[offset + 1] = 128 + 8 * Math.sin(x * 0.65 + y * 0.11);
      pixels.data[offset + 2] = 250;
      pixels.data[offset + 3] = 255;
    }
  }
  ctx.putImageData(pixels, 0, 0);
  return new THREE.CanvasTexture(canvas);
}

function woodFinish() {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 384;
  const context = canvas.getContext('2d');
  const image = context.createImageData(256, 256);
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const warp = fbm(x / 240, y / 72);
      const line = y + 19 * warp + 3 * Math.sin(x / 127 + y / 24);
      const grain = 53 * (fbm(x / 105, line / 7) - .5)
        + 23 * (fbm(x / 14, line * 1.2) - .5) - 16 * Math.pow(Math.abs(Math.sin(line * .13)), 12);
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
  return new THREE.MeshPhysicalMaterial({ map, color: '#b5a28d', roughness: .64, roughnessMap: map,
    bumpMap: map, bumpScale: .00018, clearcoat: .2, clearcoatRoughness: .42 });
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
  const coating = wornFinish(false);
  const wear = wornFinish(false, THREE.NoColorSpace);
  const normal = proceduralNormal();
  for (const texture of [coating, normal, wear]) texture.anisotropy = 4;
  const steelFinish = wornFinish(false);
  const alloy = new THREE.MeshPhysicalMaterial({
    color: '#606465', map: coating, roughnessMap: wear, roughness: .82, metalness: .79,
    normalMap: normal, normalScale: new THREE.Vector2(.17, .17), vertexColors: true,
    clearcoat: .10, clearcoatRoughness: .38,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: '#424648', map: coating, roughness: .91, roughnessMap: wear, metalness: .58,
    normalMap: normal, normalScale: new THREE.Vector2(.12, .12), vertexColors: true,
  });
  const contact = new THREE.MeshStandardMaterial({ color: '#707981', roughness: 0.33, metalness: 0.76 });
  const polymer = new THREE.MeshStandardMaterial({
    color: '#444337', map: coating, roughness: .96, roughnessMap: wear,
    normalMap: normal, normalScale: new THREE.Vector2(.31, .31),
  });
  const rubber = new THREE.MeshStandardMaterial({ color: '#232526', roughness: .92,
    bumpMap: steelFinish, bumpScale: .00017 });
  const weave = wornFinish(true);
  const fabric = new THREE.MeshStandardMaterial({ color: '#646451', map: weave, bumpMap: weave, bumpScale: 0.0005, roughness: 0.94 });
  const wood = woodFinish();

  function part(surface, geometry, x, y, z) {
    if (surface.vertexColors) {
      const normals = geometry.attributes.normal;
      const positions = geometry.attributes.position;
      const colors = new Float32Array(normals.count * 3).fill(1);
      if (geometry instanceof RoundedBoxGeometry) {
        for (let i = 0; i < normals.count; i++) {
          const bevel = 1 - Math.max(Math.abs(normals.getX(i)), Math.abs(normals.getY(i)), Math.abs(normals.getZ(i)));
          const patch = fbm((positions.getZ(i) + z) * 64, (positions.getX(i) + x + positions.getY(i) + y) * 90);
          const polish = bevel * 6 * patch;
          colors.set([1 + polish, 1 + polish * .94, 1 + polish * .85], i * 3);
        }
      }
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }
    const mesh = new THREE.Mesh(geometry, surface);
    mesh.position.set(x, y, z);
    if (!parts.has(surface)) parts.set(surface, []);
    parts.get(surface).push(mesh);
    return mesh;
  }

  function shell(surface, x, y, z, width, height, depth, radius = 0.012) {
    return part(surface, new RoundedBoxGeometry(width, height, depth, 2, radius), x, y, z);
  }

  const classicStock = new THREE.Mesh(stockGeometry(), wood);
  const sandStock = new THREE.Group();
  shell(alloy,0,-.005,.254,.051,.046,.195,.015);
  shell(polymer,0,-.018,.341,.079,.069,.16,.014);
  shell(polymer,0,-.073,.397,.083,.123,.052,.012);
  shell(polymer,0,-.079,.325,.056,.035,.166,.009).rotation.x=.28;
  flushParts(sandStock);
  model.add(classicStock, sandStock);

  shell(dark, 0, -0.015, 0.012, 0.106, 0.091, 0.32);
  shell(alloy, 0, 0.045, 0.004, 0.101, 0.065, 0.295, 0.028);
  shell(polymer, 0, -0.018, -0.281, 0.086, 0.076, 0.222, 0.024);
  shell(polymer, 0, 0.055, -0.292, 0.078, 0.045, 0.19, 0.019);
  shell(dark, 0, 0.007, -0.395, 0.085, 0.093, 0.027);

  shell(rubber, 0, -0.064, 0.426, 0.088, 0.144, 0.018, 0.013);
  shell(polymer, 0, -0.114, 0.073, 0.052, 0.126, 0.062, 0.018).rotation.x = -0.24;

  const frontTube = part(alloy, new THREE.CylinderGeometry(0.017, 0.017, 0.26, 16), 0, 0.026, -0.505);
  frontTube.rotation.x = Math.PI / 2;
  part(contact,new THREE.TorusGeometry(.0175,.003,8,24),0,.026,-.614);
  for(let i=0;i<6;i++) {
    const a=i*Math.PI/3;
    const lug=shell(dark,.016*Math.sin(a),.026+.016*Math.cos(a),-.623,.009,.009,.027,.002);
    lug.rotation.z=-a;
  }
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
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff4932).multiplyScalar(3.2) }));
  dot.position.copy(sightCenter);
  model.add(dot);
  // Continuous outer casings support the raised surface detail.
  shell(dark,0,.023,-.27,.074,.048,.244,.012);
  shell(alloy,0,.016,-.164,.086,.066,.046,.01);
  shell(dark,0,.079,-.034,.064,.021,.101,.004);
  const hood=part(dark,new THREE.CylinderGeometry(.043,.043,.034,64,1,true),0,sightCenter.y,-.033);
  hood.rotation.x=Math.PI/2;
  const lining=part(dark,new THREE.CylinderGeometry(.039,.039,.034,64,1,true),0,sightCenter.y,-.033);
  lining.rotation.x=Math.PI/2;lining.scale.x=-1;
  for(const side of [-1,1]){
    shell(dark,side*.029,.119,-.034,.017,.037,.065,.005);
    for(let i=0;i<6;i++){
      shell(alloy,side*.038,.025,-.196-i*.033,.008,.018,.013,.003).rotation.x=.23;
    }
  }
  // Cosmetic relief and surface markings, baked into material batches.
  const inset=new THREE.MeshStandardMaterial({color:0x161b1b,roughness:.67});
  const edge=new THREE.MeshStandardMaterial({color:0x717875,roughness:.51,metalness:.74});
  for(const side of [-1,1]){
    for(let i=0;i<8;i++){
      const z=-.199-i*.025;
      shell(inset,side*.043,-.004,z,.003,.016,.018,.002);
      shell(polymer,side*.043,-.027,z,.006,.023,.006,.002);
    }
    for(let i=0;i<11;i++){
      shell(rubber,side*.039,-.063+(i-5)*.01,.433,.011,.005,.008,.0015);
    }
    for(let i=0;i<6;i++){
      shell(rubber,side*.025,-.12+(i-2.5)*.012,.076-(i-2.5)*.003,.004,.003,.043,.001);
    }
    for(const [y,z] of [[.026,-.127],[.025,.122],[-.03,.125],[-.039,-.129],[.096,-.052]]){
      const x=side*(y>.09?.038:.053);
      const head=part(edge,new THREE.CylinderGeometry(.005,.005,.003,16),x,y,z);
      head.rotation.z=Math.PI/2;
      const socket=part(inset,new THREE.CylinderGeometry(.0025,.0025,.0033,6),x+side*.0005,y,z);
      socket.rotation.z=Math.PI/2;
    }
    for(let i=0;i<12;i++){
      const z=-.188-i*.018;
      shell(alloy,side*.018,.08,z,.029,.009,.01,.002);
    }

  }
  for(let i=0;i<4;i++){
    part(dark,new THREE.TorusGeometry(.0395,.0018,8,48),0,sightCenter.y,-.019-i*.008);
  }
  {
    const dial=part(dark,new THREE.CylinderGeometry(.015,.015,.015,40),.046,sightCenter.y,-.033);
    dial.rotation.z=Math.PI/2;
    for(let k=0;k<24;k++){
      const a=k*Math.PI/12;
      shell(alloy,.049,sightCenter.y+.015*Math.cos(a),-.033+.015*Math.sin(a),.01,.002,.002,.0005);
    }

  }
  const labelCanvas=document.createElement('canvas');
  labelCanvas.width=768;labelCanvas.height=160;
  const ctx=labelCanvas.getContext('2d');
  ctx.fillStyle='#bfc1b9';ctx.font='bold 49px monospace';
  ctx.font='24px monospace';ctx.fillText('FIELD SERIES   •   N° 0048',24,116);
  for(let k=0;k<40;k++)ctx.fillRect(550+k*4,26,1+(k*k%3),56);
  const ink=new THREE.CanvasTexture(labelCanvas);ink.colorSpace=THREE.SRGBColorSpace;
  for(const side of [-1,1]){
    const decal=new THREE.Mesh(new THREE.PlaneGeometry(.128,.026),
      new THREE.MeshBasicMaterial({map:ink,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}));
    decal.rotation.y=side*Math.PI/2;decal.position.set(side*.0533,-.019,.027);model.add(decal);
  }
  function setVariant(variant) {
    const modern = variant === 'sand';
    classicStock.visible = !modern;
    sandStock.visible = modern;
    polymer.color.set(modern ? '#a5906d' : '#454a40');
    ctx.clearRect(0, 0, 500, 70);
    ctx.font = 'bold 49px monospace';
    ctx.fillText(modern ? 'AX / 02' : 'AX / 01', 24, 62);
    ink.needsUpdate = true;
  }
  setVariant('classic');

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
    for(let i=0;i<4;i++){
      shell(dark,side*.041,-.17,-.085-i*.018,.005,.131,.006,.002).rotation.x=.36;
    }
    for (let i = 0; i < 5; i++) {
      shell(alloy, side * 0.038, -0.104 - i * 0.034, -0.105 - i * 0.014,
        0.008, 0.011, 0.085, 0.004).rotation.x = -i * 0.075;
    }
  }

  const mag = new THREE.Group();
  flushParts(mag);
  // A separate carrier makes the final bolt-rack beat readable instead of moving the whole receiver.
  const boltCarrier = new THREE.Group();
  shell(dark, 0, 0.122, -0.145, 0.068, 0.038, 0.155, 0.006);
  shell(alloy, 0.047, 0.139, -0.145, 0.018, 0.022, 0.086, 0.004);
  shell(contact, -0.047, 0.139, -0.145, 0.018, 0.022, 0.086, 0.004);
  flushParts(boltCarrier);
  model.add(mag, boltCarrier, left.root);
  const sleeve = new THREE.Group();
  const cloth = part(fabric, new THREE.CylinderGeometry(0.035, 0.065, 0.94, 16), 0, 0.47, 0);
  cloth.scale.set(1, 0.99, 0.9);
  const cuff = part(fabric, new THREE.CylinderGeometry(0.035, 0.039, 0.12, 20), 0, 0.965, 0);
  cuff.scale.z = 0.93;
  part(rubber, new THREE.CylinderGeometry(0.033, 0.035, 0.026, 20), 0, 1.022, 0);
  for (const y of [0.30, 0.46, 0.78]) {
    const r = 0.065 - 0.032 * y;
    const fold = part(fabric, new THREE.CylinderGeometry(r - 0.001, r + 0.004, 0.048, 20), 0, y, 0);
    fold.rotation.z = 0.04 * Math.sin(y * 20);
    fold.scale.z = 0.92;
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
  const supportRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(
    1.79, 0.26, 0.19, 'YXZ',
  ));
  const gripRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(1.22, 0.32, 0.14, 'YXZ'));
  const movingRotation = new THREE.Quaternion();
  function poseReload(progress, bodyOffset = 0.31) {
    const ease = (a, b) => THREE.MathUtils.smoothstep(progress, a, b);
    const travel = ease(0.075, 0.29) - ease(0.78, 0.95);
    const release = ease(0.01, 0.095) - ease(0.25, 0.34)
      + ease(0.735, 0.81) - ease(0.925, 0.995);
    const draw = ease(0.345, 0.51) - ease(0.535, 0.73);
    const boltTravel = ease(0.775, 0.84) - ease(0.91, 0.985);
    mag.position.set(-0.039 * draw, -0.155 * draw, -0.025 * draw);
    mag.rotation.x = -0.12 * draw;
    boltCarrier.position.z = boltTravel * 0.082;
    boltCarrier.rotation.x = -boltTravel * 0.045;
    movingGrip.copy(magazineWrist).applyQuaternion(mag.quaternion).add(mag.position);
    movingRotation.multiplyQuaternions(mag.quaternion, gripRotation);
    left.root.position.lerpVectors(supportWrist, movingGrip, travel);
    const clearance = 4 * travel * (1 - travel);
    left.root.position.x -= 0.083 * clearance;
    left.root.position.y -= 0.041 * clearance;
    left.root.position.z += 0.018 * clearance;
    left.root.quaternion.slerpQuaternions(supportRotation, movingRotation, travel);
    left.grip(0.93 + 0.17 * travel, release);
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
  const white = new THREE.Color(0xffeed2).multiplyScalar(4.2);
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
  return { model, setVariant, poseReload, sightCenter, dot,
    flash: { muzzle, light, smoke: puffs.map(item => item.puff), ignite, setStrength, updateSmoke, clearSmoke } };
}
