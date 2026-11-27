import * as THREE from 'three';

import { isPuddle } from './dock-reflection.js';

export function createImpacts(scene) {
  const forward = new THREE.Vector3(0,0,1);
  const normal = new THREE.Vector3();
  const transform = new THREE.Matrix4();
  const normalMatrix = new THREE.Matrix3();
  const proxy = new THREE.Mesh();
  const decal = new THREE.PlaneGeometry(.10,.095);
  const direction = new THREE.Vector3();
  const pulse = new THREE.PointLight(0xffbb73,0,3);
  scene.add(pulse);
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
    const mark = new THREE.Mesh(decal,material);
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
  const brass = new THREE.MeshStandardMaterial({color:0xbb9554,metalness:.84,roughness:.31});
  const shellShape = new THREE.CylinderGeometry(.007,.008,.036,8);
  const streakShape = new THREE.CylinderGeometry(.004,.002,1,5);
  const streakMaterial = new THREE.MeshBasicMaterial({color:new THREE.Color(2.4,1.1,.35)});
  const up = new THREE.Vector3(0,1,0);
  const paths = Array.from({length:14},()=>{
    const shell=new THREE.Mesh(shellShape,brass), streak=new THREE.Mesh(streakShape,streakMaterial);
    shell.visible=streak.visible=false;
    scene.add(shell,streak);
    return {shell,streak,velocity:new THREE.Vector3(),age:2};
  });
  let shotIndex=0;
  function launch(model, muzzle, ray, distance) {
    const p=paths[shotIndex++ % paths.length];
    p.age=0;
    model.localToWorld(p.shell.position.set(.055,.03,-.05));
    p.velocity.set(1.5,1.2,-.2).transformDirection(model.matrixWorld).multiplyScalar(2.1);
    muzzle.getWorldPosition(p.streak.position);
    direction.copy(ray.direction).multiplyScalar(Math.min(20,distance)).add(ray.origin).sub(p.streak.position);
    p.streak.scale.y = Math.min(2.5,direction.length()*.3);
    p.streak.position.addScaledVector(direction,.48);
    p.streak.quaternion.setFromUnitVectors(up,direction.normalize());
    p.shell.visible=p.streak.visible=true;
  }
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
      slot.mark.position.copy(point).addScaledVector(normal,.003);
      slot.mark.quaternion.setFromUnitVectors(forward,normal);
      slot.mark.material.color.set(slot.hot ? 0xcac5ba : 0x91867b);
      slot.mark.material.opacity=1;
    }
    slot.wave.position.copy(point).addScaledVector(normal,0.004);
    slot.wave.quaternion.setFromUnitVectors(forward,normal);
    slot.wave.scale.setScalar(0.04); slot.wave.material.opacity=0.75;
    slot.dustMaterial.color.set(surface==='soft' ? 0xc39062 : 0xb2b5ae);
    if(slot.hot) {
      pulse.position.copy(point).addScaledVector(normal,.15);
      pulse.intensity=5;
    }
    slot.dustMaterial.opacity=0.65;
    for (const {ember,dust,velocity} of slot.particles) {
      ember.visible=!wet && slot.hot; dust.visible=!wet && !slot.hot;
      velocity.randomDirection();
      velocity.addScaledVector(normal,1.4).multiplyScalar(slot.hot ? 1.3 : 0.32);
      const particle=slot.hot ? ember : dust;
      particle.position.copy(point).addScaledVector(velocity,0.012);
      if (slot.hot) {
        ember.quaternion.setFromUnitVectors(forward,direction.copy(velocity).normalize());
        ember.scale.set(0.009,0.009,0.052);
      } else dust.scale.setScalar(0.07);
    }
  }
  function update(dt) {
    pulse.intensity=Math.max(0,pulse.intensity-dt*48);
    for(const p of paths) {
      if (!p.shell.visible) continue;
      p.age+=dt;
      p.shell.position.addScaledVector(p.velocity,dt);
      p.shell.rotation.x+=dt*13;
      p.velocity.y-=dt*9;
      if(p.shell.position.y<.016){p.shell.position.y=.016;p.velocity.multiplyScalar(.35);p.velocity.y=Math.abs(p.velocity.y);}
      p.streak.visible=p.age<.038;
      p.shell.visible=p.age<1.7;
    }
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
  function clear() {
    for (const slot of slots) slot.group.visible=false;
    for (const p of paths) p.shell.visible=p.streak.visible=false;
    pulse.intensity=0;
  }
  return {emit,update,clear,launch};
}
