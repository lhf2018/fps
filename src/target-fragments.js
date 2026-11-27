import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

export function createTargetFragments(scene, target) {
  const pieces = target.children;
  const impact = new THREE.Vector3();

  const bursts = Array.from({ length: 8 }, () => {
    const group = new THREE.Group();
    group.visible = false;
    scene.add(group);
    const shards = pieces.map(piece => {
      const mesh = new THREE.Mesh(piece.geometry, piece.material);
      group.add(mesh);
      return { mesh, center: piece.position, rotation: piece.quaternion, velocity: new THREE.Vector3(), spin: new THREE.Vector3() };
    });
    return { group, shards, age: 0 };
  });
  let next = 0;
  function breakTarget(target, worldPoint, direction) {
    const burst = bursts[next];
    next = (next + 1) % bursts.length;
    target.getWorldPosition(burst.group.position);
    target.getWorldQuaternion(burst.group.quaternion);
    impact.copy(worldPoint);
    target.worldToLocal(impact);
    burst.age = 0;
    burst.group.visible = true;
    for (const { mesh, center, rotation, velocity, spin } of burst.shards) {
      mesh.position.copy(center);
      mesh.quaternion.copy(rotation);
      mesh.scale.setScalar(1);
      velocity.copy(center).sub(impact).normalize().multiplyScalar(1.2 + Math.random() * 2.3);
      velocity.addScaledVector(center, 2.8);
      velocity.y += 1.4;
      spin.random().subScalar(0.5).multiplyScalar(14);
    }
    // Debris moves in world space after the initial target pose.
    for (const { mesh, velocity } of burst.shards) {
      mesh.position.applyQuaternion(burst.group.quaternion);
      mesh.quaternion.premultiply(burst.group.quaternion);
      velocity.applyQuaternion(burst.group.quaternion).addScaledVector(direction, 2.6);
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
