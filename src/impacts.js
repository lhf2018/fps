import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import { DecalGeometry } from 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/geometries/DecalGeometry.js';
import { isPuddle } from './dock-reflection.js';

export function createImpacts(scene) {
  const forward = new THREE.Vector3(0,0,1);
  const normal = new THREE.Vector3();
  const transform = new THREE.Matrix4();
  const normalMatrix = new THREE.Matrix3();
  const proxy = new THREE.Mesh();
  const rotation = new THREE.Euler();
  const size = new THREE.Vector3();
  const ripple = new THREE.RingGeometry(0.82,1,40);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.beginPath();
  for (let i=0; i<16; i++) {
    const angle = i * Math.PI / 8;
    const r = 20 + 7*Math.sin(i*4.2);
    ctx.lineTo(32+r*Math.cos(angle),32+r*Math.sin(angle));
  }
  ctx.closePath();
  ctx.fillStyle = '#aca39a';
  ctx.fill();
  const pit = ctx.createRadialGradient(31,32,3,31,32,20);
  pit.addColorStop(0,'#252324'); pit.addColorStop(1,'#38343200');
  ctx.fillStyle = pit; ctx.fill();
  const chip = new THREE.CanvasTexture(canvas);
  chip.colorSpace = THREE.SRGBColorSpace;
  const spark = new THREE.OctahedronGeometry(1);
  const smoke = document.createElement('canvas');
  smoke.width = smoke.height = 32;
  const brush = smoke.getContext('2d');
  const mist = brush.createRadialGradient(16,16,0,16,16,16);
  mist.addColorStop(0,'#c0aa90cc'); mist.addColorStop(1,'#a99d8c00');
  brush.fillStyle=mist; brush.fillRect(0,0,32,32);
  const dustMap = new THREE.CanvasTexture(smoke);
  const sparkMat = new THREE.MeshBasicMaterial({color:0xffbf70,toneMapped:false});
  const slots = Array.from({length:20}, () => {
    const material = new THREE.MeshBasicMaterial({ transparent:true, depthWrite:false, polygonOffset:true,
      polygonOffsetFactor:-1, polygonOffsetUnits:-2, map:chip });
    const mark = new THREE.Mesh(ripple,material);
    const wave = new THREE.Mesh(ripple,new THREE.MeshBasicMaterial({color:0xc9e1df, transparent:true,depthWrite:false}));
    const group = new THREE.Group();
    group.add(mark,wave); group.visible=false; scene.add(group);
    const dustMaterial = new THREE.SpriteMaterial({map:dustMap,transparent:true,depthWrite:false});
    const particles = Array.from({length:5},()=>{
      const ember=new THREE.Mesh(spark,sparkMat);
      const dust=new THREE.Sprite(dustMaterial);
      group.add(ember,dust);
      return {ember,dust,velocity:new THREE.Vector3()};
    });
    return {group, mark, wave, particles, dustMaterial, age:0};
  });
  let next=0;
  function emit(hit, target=false) {
    const slot=slots[next]; next=(next+1)%slots.length;
    const {object,point,face}=hit;
    proxy.geometry=object.geometry;
    proxy.matrixWorld.copy(object.matrixWorld);
    if (hit.instanceId != null) {
      object.getMatrixAt(hit.instanceId,transform);
      proxy.matrixWorld.multiply(transform);
    }
    normal.copy(face.normal).applyNormalMatrix(normalMatrix.getNormalMatrix(proxy.matrixWorld));
    const surface=object.userData.surface;
    const wet=surface==='ground' && isPuddle(point.x,point.z);
    slot.wet=wet;
    slot.hot=target || (surface!=='ground' && surface!=='soft');
    slot.life=target ? 0.19 : wet ? 0.55 : 1.65;
    slot.age=0; slot.group.visible=true;
    slot.mark.visible=!wet && !target;
    slot.wave.visible=wet;
    if (slot.mark.visible) {
      rotation.setFromQuaternion(slot.mark.quaternion.setFromUnitVectors(forward,normal));
      slot.mark.quaternion.identity();
      size.set(0.14,0.12,0.009);
      if (slot.mark.geometry!==ripple) slot.mark.geometry.dispose();
      slot.mark.geometry=new DecalGeometry(proxy,point,rotation,size);
      slot.mark.material.color.set(slot.hot ? 0xcac5ba : 0x91867b);
      slot.mark.material.opacity=1;
    }
    slot.wave.position.copy(point).addScaledVector(normal,0.004);
    slot.wave.quaternion.setFromUnitVectors(forward,normal);
    slot.wave.scale.setScalar(0.04); slot.wave.material.opacity=0.75;
    slot.dustMaterial.opacity=0.65;
    for (const {ember,dust,velocity} of slot.particles) {
      ember.visible=!wet && slot.hot; dust.visible=!wet && !slot.hot;
      velocity.randomDirection();
      velocity.addScaledVector(normal,1.4).multiplyScalar(slot.hot ? 1.3 : 0.32);
      const particle=slot.hot ? ember : dust;
      particle.position.copy(point).addScaledVector(velocity,0.012);
      if (slot.hot) {
        ember.quaternion.setFromUnitVectors(forward,velocity.clone().normalize());
        ember.scale.set(0.009,0.009,0.052);
      } else dust.scale.setScalar(0.07);
    }
  }
  function update(dt) {
    for (const slot of slots) {
      if (!slot.group.visible) continue;
      slot.age+=dt;
      if (slot.age>=slot.life) {slot.group.visible=false; continue;}
      const t=slot.age/slot.life;
      if (slot.wet) {
        slot.wave.scale.setScalar(0.04+0.34*t);
        slot.wave.material.opacity=0.75*(1-t);
        continue;
      }
      slot.mark.material.opacity=1-THREE.MathUtils.smoothstep(t,0.65,1);
      slot.dustMaterial.opacity=0.65*Math.max(0,1-slot.age/0.35);
      for (const {ember,dust,velocity} of slot.particles) {
        const particle=slot.hot ? ember : dust;
        particle.visible=slot.age<(slot.hot ? 0.16 : 0.35);
        particle.position.addScaledVector(velocity,dt);
        velocity.y-=dt*(slot.hot ? 7 : 0.45);
        if (!slot.hot) dust.scale.setScalar(0.07+slot.age*0.55);
      }
    }
  }
  function clear() { for (const slot of slots) slot.group.visible=false; }
  return {emit,update,clear};
}
