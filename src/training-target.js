import * as THREE from 'three';

export function createTrainingTarget(steel) {
  const target = new THREE.Group();
  const edge = new THREE.MeshStandardMaterial({ color: '#979b94', metalness: 0.78, roughness: 0.37 });
  const armor = new THREE.MeshStandardMaterial({ color: '#383f43', metalness: 0.62, roughness: 0.49 });
  const marker = new THREE.MeshStandardMaterial({ color: '#b5d66e', emissive: '#b9f960', emissiveIntensity: 1.15, roughness: 0.42 });
  function part(geometry, material, x=0, y=0, z=0) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x,y,z);
    mesh.castShadow = mesh.receiveShadow = true;
    target.add(mesh);
    return mesh;
  }
  function rim(radius, tube, z, material) {
    part(new THREE.TorusGeometry(radius, tube, 8, 48), material, 0, 0, z);
  }
  const profile = [[0.415,-0.10],[0.53,-0.12],[0.57,-0.08],[0.57,0.09],[0.54,0.13],[0.42,0.13],[0.405,0.10],[0.415,-0.10]];
  const shell = new THREE.LatheGeometry(profile.map(([r,z]) => new THREE.Vector2(r,z)), 9, 0, Math.PI/3-0.045);
  shell.rotateX(Math.PI/2);
  // Center each segment on its own pivot so it can separate on impact.
  shell.computeBoundingSphere();
  const offset = shell.boundingSphere.center.clone();
  shell.translate(-offset.x,-offset.y,-offset.z);
  for (let i=0; i<6; i++) {
    const segment = part(shell,armor);
    segment.rotation.z = i*Math.PI/3;
    segment.position.copy(offset).applyQuaternion(segment.quaternion);
  }
  rim(0.551,0.012,0.102,edge);
  rim(0.454,0.019,0.135,marker);
  rim(0.22,0.021,0.048,edge);
  const plate = new THREE.CylinderGeometry(0.21,0.225,0.09,40);
  plate.rotateX(Math.PI/2);
  part(plate,steel);
  rim(0.131,0.007,0.047,edge);
  const boss = new THREE.CylinderGeometry(0.058,0.069,0.018,24);
  boss.rotateX(Math.PI/2);
  part(boss,armor,0,0,0.051);
  const spoke = new THREE.BoxGeometry(0.065,0.245,0.055);
  const bolt = new THREE.CylinderGeometry(0.022,0.023,0.014,6);
  bolt.rotateX(Math.PI/2);
  for (let i=0; i<6; i++) {
    const angle = (i+0.5)*Math.PI/3;
    const x = -Math.sin(angle), y = Math.cos(angle);
    part(bolt,edge,0.508*x,0.508*y,0.135);
    if (i%2 === 0) part(spoke,steel,0.32*x,0.32*y,-0.035).rotation.z = angle;
  }
  return target;
}
