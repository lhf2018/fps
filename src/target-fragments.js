import * as THREE from 'three';

export function createTargetFragments(scene, outer, ring, core) {
  const pieces = [];
  const impact = new THREE.Vector3();
  const geometry = new THREE.IcosahedronGeometry(outer.geometry.parameters.radius);
  const vertices = geometry.attributes.position;
  // Each triangular panel rotates about its own center.
  for (let i = 0; i < vertices.count; i += 3) {
    const triangle = [0, 1, 2].map(k => new THREE.Vector3().fromBufferAttribute(vertices, i + k));
    const center = triangle[0].clone().add(triangle[1]).add(triangle[2]).multiplyScalar(1 / 3);
    const inner = triangle.map(v => v.clone().multiplyScalar(0.76));
    const panel = new THREE.BufferGeometry();
    panel.setAttribute('position', new THREE.Float32BufferAttribute(
      [...triangle, ...inner].flatMap(v => v.sub(center).toArray()), 3));
    panel.setIndex([0,1,2, 5,4,3, 0,3,4, 0,4,1, 1,4,5, 1,5,2, 2,5,3, 2,3,0]);
    panel.computeVertexNormals();
    pieces.push({ geometry: panel, material: outer.material, center });
  }
  geometry.dispose();
  const arc = Math.PI / 4;
  const { radius, tube } = ring.geometry.parameters;
  for (let i = 0; i < 8; i++) {
    const angle = arc * i;
    const center = new THREE.Vector3(radius * Math.cos(angle + arc / 2), radius * Math.sin(angle + arc / 2), 0);
    const segment = new THREE.TorusGeometry(radius, tube, 6, 6, arc * 0.97);
    segment.rotateZ(angle).translate(-center.x, -center.y, 0);
    pieces.push({ geometry: segment, material: ring.material, center: center.add(ring.position) });
  }
  const chip = new THREE.TetrahedronGeometry(core.geometry.parameters.radius * 0.62);
  for (let i = 0; i < 4; i++) {
    const center = core.position.clone();
    center.x += Math.cos(i * Math.PI / 2) * 0.09;
    center.y += Math.sin(i * Math.PI / 2) * 0.09;
    pieces.push({ geometry: chip, material: core.material, center });
  }

  const bursts = Array.from({ length: 8 }, () => {
    const group = new THREE.Group();
    group.visible = false;
    scene.add(group);
    const shards = pieces.map(piece => {
      const mesh = new THREE.Mesh(piece.geometry, piece.material);
      group.add(mesh);
      return { mesh, center: piece.center, velocity: new THREE.Vector3(), spin: new THREE.Vector3() };
    });
    return { group, shards, age: 0 };
  });
  let next = 0;
  function breakTarget(target, worldPoint) {
    const burst = bursts[next];
    next = (next + 1) % bursts.length;
    target.getWorldPosition(burst.group.position);
    target.getWorldQuaternion(burst.group.quaternion);
    impact.copy(worldPoint);
    target.worldToLocal(impact);
    burst.age = 0;
    burst.group.visible = true;
    for (const { mesh, center, velocity, spin } of burst.shards) {
      mesh.position.copy(center);
      mesh.rotation.set(0, 0, 0);
      mesh.scale.setScalar(1);
      velocity.copy(center).sub(impact).normalize().multiplyScalar(1.2 + Math.random() * 2.3);
      velocity.addScaledVector(center, 2.8);
      velocity.y += 1.4;
      spin.random().subScalar(0.5).multiplyScalar(14);
    }
    // Debris moves in world space after the initial target pose.
    for (const { mesh, velocity } of burst.shards) {
      mesh.position.applyQuaternion(burst.group.quaternion);
      mesh.quaternion.copy(burst.group.quaternion);
      velocity.applyQuaternion(burst.group.quaternion);
    }
    burst.group.quaternion.identity();
  }
  function update(dt) {
    for (const burst of bursts) {
      if (!burst.group.visible) continue;
      burst.age += dt;
      burst.group.visible = burst.age < 0.85;
      for (const { mesh, velocity, spin } of burst.shards) {
        mesh.position.addScaledVector(velocity, dt);
        velocity.y -= 10 * dt;
        mesh.position.y = Math.max(0.025 - burst.group.position.y, mesh.position.y);
        mesh.rotation.x += spin.x * dt;
        mesh.rotation.y += spin.y * dt;
        mesh.rotation.z += spin.z * dt;
        mesh.scale.setScalar(1 - THREE.MathUtils.smoothstep(burst.age, 0.48, 0.85));
      }
    }
  }
  function clear() {
    for (const burst of bursts) burst.group.visible = false;
  }
  return { breakTarget, update, clear };
}
