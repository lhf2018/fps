import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

const terrainMaterial = color => new THREE.MeshStandardMaterial({
  color,
  roughness: 0.94,
  metalness: 0.04,
});

function createWater() {
  const geometry = new THREE.PlaneGeometry(460, 330, 180, 132);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, -3.2, -203);

  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      uniform float uTime;
      varying vec3 vWorld;
      float wave(vec2 p) {
        return sin(dot(p, vec2(0.74, 0.68)) * 0.17 + uTime * 0.47) * 0.20
          + sin(dot(p, vec2(-0.91, 0.42)) * 0.31 - uTime * 0.68) * 0.085
          + sin(dot(p, vec2(0.22, -0.97)) * 0.57 + uTime * 0.9) * 0.035;
      }
      void main() {
        vec3 p = position;
        p.y += wave(p.xz);
        vec4 world = modelMatrix * vec4(p, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec3 vWorld;
      float wave(vec2 p) {
        return sin(dot(p, vec2(0.74, 0.68)) * 0.17 + uTime * 0.47) * 0.20
          + sin(dot(p, vec2(-0.91, 0.42)) * 0.31 - uTime * 0.68) * 0.085
          + sin(dot(p, vec2(0.22, -0.97)) * 0.57 + uTime * 0.9) * 0.035;
      }
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      void main() {
        vec2 p = vWorld.xz;
        float hx = wave(p + vec2(0.16, 0.0)) - wave(p - vec2(0.16, 0.0));
        float hz = wave(p + vec2(0.0, 0.16)) - wave(p - vec2(0.0, 0.16));
        vec3 normal = normalize(vec3(-hx * 1.8, 1.0, -hz * 1.8));
        vec3 viewDirection = normalize(cameraPosition - vWorld);
        vec3 reflected = reflect(-viewDirection, normal);
        float sky = smoothstep(-0.18, 0.45, reflected.y);
        vec3 color = mix(vec3(0.021, 0.048, 0.061), vec3(0.079, 0.135, 0.17), sky);
        float cloud = noise(p * 0.014 + vec2(uTime * 0.006, -uTime * 0.004));
        color += vec3(0.019, 0.029, 0.035) * cloud;
        float fresnel = pow(1.0 - max(dot(normal, viewDirection), 0.0), 4.4);
        float moon = pow(max(dot(reflected, normalize(vec3(-0.55, 0.75, -0.36))), 0.0), 58.0);
        float shimmer = smoothstep(0.67, 0.97, noise(p * vec2(0.09, 0.23) + uTime * 0.13));
        color += vec3(0.43, 0.52, 0.58) * moon * shimmer * (0.24 + fresnel * 0.72);
        float lampLeft = exp(-abs(p.x + 5.45) * 0.47) * exp(-max(0.0, -p.y - 46.0) * 0.021);
        float lampRight = exp(-abs(p.x - 5.95) * 0.39) * exp(-max(0.0, -p.y - 53.0) * 0.019);
        float brokenReflection = 0.32 + 0.68 * noise(vec2(p.x * 1.4, p.y * 0.27) + uTime * 0.22);
        color += vec3(0.74, 0.36, 0.105) * (lampLeft * 0.43 + lampRight * 0.46)
          * brokenReflection * (0.18 + fresnel * 0.82);
        float foamBand = (1.0 - smoothstep(-54.0, -48.0, p.y)) * smoothstep(-62.0, -56.0, p.y);
        float foam = smoothstep(0.57, 0.83, noise(p * vec2(0.42, 0.18) + uTime * 0.05));
        color = mix(color, vec3(0.24, 0.31, 0.32), foamBand * foam * 0.24);
        float crest = smoothstep(0.66, 0.86, noise(p * 0.34 + vec2(uTime * 0.11, 0.0)));
        color = mix(color, vec3(0.20, 0.26, 0.28), crest * 0.10);
        float fog = smoothstep(96.0, 310.0, length(cameraPosition.xz - p));
        vec3 haze = vec3(0.037, 0.055, 0.072);
        color = mix(color, haze, fog * 0.82);
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const ocean = new THREE.Mesh(geometry, material);
  ocean.frustumCulled = false;
  ocean.receiveShadow = false;
  return { ocean, material };
}

function createBreakwater(scene) {
  const rock = terrainMaterial('#263238');
  const concrete = terrainMaterial('#414445');
  const geometry = new THREE.IcosahedronGeometry(1, 1);
  const count = 86;
  const rocks = new THREE.InstancedMesh(geometry, rock, count);
  const dummy = new THREE.Object3D();
  let index = 0;
  for (const side of [-1, 1]) {
    for (let i = 0; i < count / 2; i++) {
      const x = side * (28 + (i % 3) * 1.15 + Math.sin(i * 1.7) * 0.5);
      const z = -41 - i * 1.6;
      const scale = 0.65 + (i * 17 % 9) * 0.12;
      dummy.position.set(x, -2.45 + scale * 0.16, z);
      dummy.rotation.set(i * 0.37, i * 1.91, i * 0.71);
      dummy.scale.set(scale * 1.45, scale * 0.72, scale * 1.18);
      dummy.updateMatrix();
      rocks.setMatrixAt(index++, dummy.matrix);
    }
  }
  rocks.instanceMatrix.needsUpdate = true;
  scene.add(rocks);

  const wall = new THREE.Mesh(new THREE.BoxGeometry(58, 3.45, 1.7), concrete);
  wall.position.set(0, -1.18, -40.6);
  wall.receiveShadow = true;
  scene.add(wall);
  for (let x = -28; x <= 28; x += 4) {
    const fender = new THREE.Mesh(new THREE.BoxGeometry(0.72, 2.1, 0.32), terrainMaterial('#20292b'));
    fender.position.set(x, -1.35, -39.58);
    scene.add(fender);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.085, 0.4), terrainMaterial('#5a5145'));
    cap.position.set(x, 0.045, -39.56);
    scene.add(cap);
  }
}

function createDistantHarbor(scene) {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const city = new THREE.InstancedMesh(geometry, terrainMaterial('#28333a'), 46);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 46; i++) {
    const side = i % 2 ? 1 : -1;
    const x = side * (34 + (i * 19 % 73));
    const z = -104 - (i * 23 % 67);
    const width = 8 + (i * 7 % 11);
    const height = 4 + (i * 13 % 17);
    const depth = 7 + (i * 11 % 14);
    dummy.position.set(x, height / 2 - 0.75, z);
    dummy.scale.set(width, height, depth);
    dummy.rotation.y = (i * 0.61) % 0.26 - 0.13;
    dummy.updateMatrix();
    city.setMatrixAt(i, dummy.matrix);
  }
  city.instanceMatrix.needsUpdate = true;
  scene.add(city);

  const coastGeometry = new THREE.PlaneGeometry(600, 46, 160, 20);
  const positions = coastGeometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = positions.getY(i);
    const ridge = Math.sin(x * 0.018) * 4.2 + Math.sin(x * 0.043 + 1.3) * 2.1
      + Math.sin(x * 0.097 - 0.6) * 0.72;
    positions.setZ(i, Math.max(0, ridge) + Math.max(0, Math.sin(x * 0.009 + 0.8) * 6.5));
    positions.setY(i, z);
  }
  coastGeometry.computeVertexNormals();
  coastGeometry.rotateX(-Math.PI / 2);
  const coast = new THREE.Mesh(coastGeometry, terrainMaterial('#26353b'));
  coast.position.set(0, -1.7, -280);
  coast.receiveShadow = false;
  scene.add(coast);

  const craneMaterial = terrainMaterial('#30383a');
  const craneInstances = [];
  function addBeam(a, b, thickness) {
    const from = new THREE.Vector3(...a);
    const to = new THREE.Vector3(...b);
    const direction = to.clone().sub(from);
    const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
    craneInstances.push(new THREE.Matrix4().compose(from.add(to).multiplyScalar(0.5), rotation,
      new THREE.Vector3(thickness, direction.length(), thickness)));
  }
  for (const [x, z, height] of [[-48, -87, 17], [52, -112, 21], [-105, -142, 23], [120, -151, 18]]) {
    addBeam([x - 6, 0, z], [x - 4, height, z], 0.42);
    addBeam([x + 5, 0, z], [x + 3, height, z], 0.42);
    addBeam([x - 8, height, z], [x + 18, height, z], 0.36);
    addBeam([x - 8, height - 1.8, z], [x + 18, height - 1.8, z], 0.2);
    addBeam([x + 11, height, z], [x + 11, 4.5, z], 0.08);
    addBeam([x - 4, height, z], [x + 12, height - 1.8, z], 0.16);
  }
  const cranes = new THREE.InstancedMesh(geometry, craneMaterial, craneInstances.length);
  craneInstances.forEach((matrix, i) => cranes.setMatrixAt(i, matrix));
  cranes.instanceMatrix.needsUpdate = true;
  scene.add(cranes);

  const shipHull = terrainMaterial('#20292e');
  const shipDeck = terrainMaterial('#30383b');
  const shipCargo = new THREE.InstancedMesh(geometry, terrainMaterial('#39403e'), 16);
  const containerTransform = new THREE.Object3D();
  const ships = [[18, -128, 1], [-65, -207, 1.45]];
  let cargoIndex = 0;
  for (const [x, z, scale] of ships) {
    const hull = new THREE.Mesh(new THREE.BoxGeometry(27 * scale, 1.5 * scale, 5.2 * scale), shipHull);
    hull.position.set(x, -2.6 + 0.45 * scale, z);
    hull.scale.z = 0.82;
    scene.add(hull);
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(4.2 * scale, 4.1 * scale, 4.7 * scale), shipDeck);
    bridge.position.set(x + 9.4 * scale, 0.5 * scale, z);
    scene.add(bridge);
    for (let row = 0; row < 2; row++) {
      for (let column = 0; column < 4; column++) {
        containerTransform.position.set(x - 7.7 * scale + column * 4.3 * scale,
          0.1 * scale + row * 1.72 * scale, z + (row ? 0.68 : -0.68) * scale);
        containerTransform.scale.set(4.08 * scale, 1.55 * scale, 1.25 * scale);
        containerTransform.updateMatrix();
        shipCargo.setMatrixAt(cargoIndex++, containerTransform.matrix);
      }
    }
  }
  shipCargo.instanceMatrix.needsUpdate = true;
  scene.add(shipCargo);

  const beaconMaterial = new THREE.MeshBasicMaterial({ color: 0xffa552, toneMapped: false });
  for (const [x, z] of [[-48, -87], [52, -112], [-105, -142], [120, -151]]) {
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), beaconMaterial);
    beacon.position.set(x + 9, 18, z);
    scene.add(beacon);
  }
}

export function createHarbor(scene) {
  createBreakwater(scene);
  createDistantHarbor(scene);
  const { ocean, material } = createWater();
  scene.add(ocean);
  return time => { material.uniforms.uTime.value = time; };
}
