import * as THREE from 'three';
import { createViewmodel } from './viewmodel.js';
import { createDock, dockBounds } from './dock-scene.js';
import { createDockReflection } from './dock-reflection.js';
import { createTargetFragments } from './target-fragments.js';
import './style.css';

const range = document.querySelector('#range');
const overlay = document.querySelector('#overlay');
const title = document.querySelector('#title');
const result = document.querySelector('#result');
const action = document.querySelector('#action');
const timer = document.querySelector('#timer');
const scoreLabel = document.querySelector('#score');
const ammoLabel = document.querySelector('#ammo');
const hit = document.querySelector('#hit');
const roundLength = 60_000;
const capacity = 30;
const shotInterval = 100;
const crosshair = document.querySelector('#crosshair');
const reloadDuration = 1250;
const standingHeight = 1.7;
const crouchingHeight = 1.08;
const jumpSpeed = 5.2;
const gravity = 16;

function showMenu(heading, button, detail = '') {
  title.textContent = heading;
  action.textContent = button;
  result.textContent = detail;
  result.hidden = !detail;
  overlay.hidden = false;
}

async function startGame() {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  const canvas = renderer.domElement;
  range.prepend(canvas);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(71, 1, 0.05, 60);
  camera.rotation.order = 'YXZ';
  scene.add(camera);
  const [{ ground, obstacles, targetMaterial }, { model: blaster, poseReload, sightCenter, flash }] =
    await Promise.all([createDock(renderer, scene), createViewmodel()]);

  const target = new THREE.Group();
  const outer = new THREE.Mesh(new THREE.IcosahedronGeometry(0.59, 1), targetMaterial);
  outer.castShadow = true;
  outer.receiveShadow = true;
  const targetFace = new THREE.MeshBasicMaterial({ color: '#c9fa76', toneMapped: false });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.065, 10, 36), targetFace);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.21, 16, 12), targetFace);
  ring.position.z = 0.35;
  core.position.z = 0.57;
  target.add(outer, ring, core);
  const fragments = createTargetFragments(scene, outer, ring, core);
  scene.add(target);

  camera.add(blaster);
  scene.add(...flash.smoke);
  const viewmodelLight = new THREE.PointLight(0xc4dafc, 0.55, 1.1);
  viewmodelLight.position.set(-0.13, 0.04, -0.27);
  // The mirror camera only sees layer 0.
  viewmodelLight.layers.set(1);
  camera.layers.enable(1);
  camera.add(viewmodelLight);
  const reflection = createDockReflection(renderer, scene, ground, blaster);

  const positions = [[0, 2, -8], [-3.7, 2.5, -11], [4.3, 1.4, -10],
    [-5.4, 1.35, -13], [2.2, 3.1, -14], [-1.7, 2.8, -12], [6, 2.7, -13]];
  const ray = new THREE.Raycaster();
  const center = new THREE.Vector2();
  const keys = new Set();
  const movement = new THREE.Vector2();
  const obstruction = new THREE.Vector3();
  const playerRadius = 0.30;
  const crouchKeys = ['KeyC', 'ControlLeft', 'ControlRight'];
  const wantsToCrouch = () => crouchKeys.some(code => keys.has(code));
  let eyeHeight = standingHeight;
  let jumpHeight = 0;
  let verticalSpeed = 0;
  let state = 'ready';
  let elapsed = 0;
  let activeSince = 0;
  let score = 0;
  let ammo = capacity;
  let refilledAt = 0;
  let nextShot = 0;
  let fireTimer;
  let aimHeld = false;
  let aim = 0;
  const aimedPosition = new THREE.Vector3();
  let hitUntil = 0;
  let kick = 0;
  let flashAge = Infinity;
  let kickVelocity = 0;
  const turnLag = new THREE.Vector2();
  let breath = 0;
  let landing = 0;
  let stride = 0;
  let strideWeight = 0;
  let reloadProgress = 0;
  let targetIndex = 0;
  let shadowTick = -1;
  let audio;
  let shotNoise;
  function shotSound() {
    if (audio?.state !== 'running') return;
    if (!shotNoise) {
      shotNoise = audio.createBuffer(1, Math.ceil(audio.sampleRate * 0.19), audio.sampleRate);
      const samples = shotNoise.getChannelData(0);
      let low = 0;
      for (let i = 0; i < samples.length; i++) {
        const t = i / audio.sampleRate, white = Math.random() * 2 - 1;
        low += 0.09 * (white - low);
        samples[i] = white * Math.exp(-t * 134) + low * 1.6 * Math.exp(-t * 22);
      }
    }
    const burst = audio.createBufferSource();
    const volume = audio.createGain();
    volume.gain.value = 0.32;
    burst.buffer = shotNoise;
    burst.playbackRate.value = 0.94 + Math.random() * 0.12;
    burst.connect(volume).connect(audio.destination);
    burst.start();
    tone(135, 45, 0.10, 0.15, 'triangle');
  }

  function tone(from, to, length, volume, type = 'sine') {
    if (audio?.state !== 'running') return;
    const start = audio.currentTime;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, start);
    oscillator.frequency.exponentialRampToValueAtTime(to, start + length);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + length);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(start);
    oscillator.stop(start + length);
  }

  function updateAmmo() {
    ammoLabel.textContent = refilledAt ? '…' : String(ammo).padStart(2, '0');
  }

  function updateTarget(time) {
    const [x, y, z] = positions[targetIndex];
    const angle = time / 1_000 * (1.1 + time / 30_000) + targetIndex;
    target.position.set(x + Math.sin(angle) * Math.min(2, time / 20_000),
      y + Math.sin(angle * 1.3) * 0.36, z);
    target.lookAt(camera.position);
    target.updateMatrixWorld(true);
  }

  function canStandAt(x, z) {
    return obstacles.every(({ min, max }) =>
      x <= min.x - playerRadius || x >= max.x + playerRadius ||
      z <= min.z - playerRadius || z >= max.z + playerRadius);
  }

  function reset() {
    clearControls();
    aim = 0;
    flash.clearSmoke();
    fragments.clear();
    elapsed = score = refilledAt = nextShot = hitUntil = kick = targetIndex = 0;
    stride = strideWeight = reloadProgress = kickVelocity = landing = breath = 0;
    turnLag.set(0, 0);
    flashAge = Infinity;
    eyeHeight = standingHeight;
    jumpHeight = verticalSpeed = 0;
    ammo = capacity;
    camera.position.set(0, standingHeight, 3.3);
    camera.rotation.set(0, 0, 0);
    timer.textContent = '60';
    scoreLabel.textContent = '00';
    hit.style.opacity = '0';
    updateAmmo();
    updateTarget(0);
  }

  function finish() {
    state = 'finished';
    clearControls();
    keys.clear();
    timer.textContent = '00';
    hit.style.opacity = '0';
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    showMenu('训练结束', '再来一局', `命中 ${score} 个悬浮靶`);
  }

  function reload(time) {
    if (time >= roundLength || ammo === capacity || refilledAt) return;
    refilledAt = time + reloadDuration;
    updateAmmo();
    tone(170, 85, 0.08, 0.08, 'triangle');
  }

  function fire(time) {
    if (time >= roundLength || time < nextShot || refilledAt) return;
    if (!ammo) {
      reload(time);
      return;
    }
    ammo--;
    updateAmmo();
    nextShot = time + shotInterval;
    kickVelocity += 48;
    flashAge = 0;
    flash.sprite.material.rotation = Math.random() * Math.PI * 2;
    flash.sprite.scale.setScalar((0.17 + Math.random() * 0.12) * (1 - 0.32 * aim));
    flash.emitSmoke();
    shotSound();
    camera.updateMatrixWorld(true);
    ray.setFromCamera(center, camera);
    const [impact] = ray.intersectObjects(target.children);
    const blocked = impact && obstacles.some(bounds =>
      ray.ray.intersectBox(bounds, obstruction) &&
      obstruction.distanceToSquared(camera.position) < impact.distance ** 2);
    if (impact && !blocked) {
      fragments.breakTarget(target, impact.point);
      score++;
      scoreLabel.textContent = String(score).padStart(2, '0');
      hitUntil = time + 170;
      targetIndex = (targetIndex + 1) % positions.length;
      updateTarget(time);
      tone(530, 940, 0.12, 0.13);
    }
    if (!ammo) reload(time);
  }

  function clearControls() {
    clearTimeout(fireTimer);
    fireTimer = undefined;
    aimHeld = false;
  }
  function heldFire() {
    if (state !== 'playing' || document.pointerLockElement !== canvas) {
      clearControls();
      return;
    }
    const time = elapsed + performance.now() - activeSince;
    if (time >= roundLength) return;
    fire(time);
    fireTimer = setTimeout(heldFire, Math.max(8, nextShot - time, refilledAt - time));
  }
  canvas.addEventListener('contextmenu', event => event.preventDefault());
  canvas.addEventListener('mousedown', event => {
    if (state !== 'playing' || document.pointerLockElement !== canvas) return;
    if (event.button === 2) aimHeld = true;
    if (event.button === 0 && fireTimer === undefined) heldFire();
  });
  window.addEventListener('mouseup', event => {
    if (event.button === 2) aimHeld = false;
    if (event.button === 0) {
      clearTimeout(fireTimer);
      fireTimer = undefined;
    }
  });

  action.addEventListener('click', async () => {
    try {
      await canvas.requestPointerLock();
    } catch {
      showMenu('悬浮靶场', '重试', '浏览器未能锁定鼠标');
    }
  });
  document.addEventListener('pointerlockerror', () => {
    if (state !== 'playing') result.hidden = false;
    result.textContent = '浏览器未能锁定鼠标';
  });
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === canvas) {
      if (state !== 'paused') reset();
      state = 'playing';
      activeSince = performance.now();
      overlay.hidden = true;
      if (window.AudioContext) {
        audio ??= new AudioContext();
        void audio.resume().catch(() => {});
      }
    } else if (state === 'playing') {
      clearControls();
      elapsed += performance.now() - activeSince;
      if (elapsed >= roundLength) {
        finish();
        return;
      }
      state = 'paused';
      keys.clear();
      showMenu('训练暂停', '继续训练');
    }
  });
  document.addEventListener('mousemove', event => {
    if (state !== 'playing' || document.pointerLockElement !== canvas) return;
    const sensitivity = 0.0021 * (1 - 0.35 * aim);
    camera.rotation.y -= event.movementX * sensitivity;
    camera.rotation.x = THREE.MathUtils.clamp(camera.rotation.x - event.movementY * sensitivity, -1.42, 1.42);
    turnLag.x = THREE.MathUtils.clamp(turnLag.x + event.movementX * 0.00075, -0.095, 0.095);
    turnLag.y = THREE.MathUtils.clamp(turnLag.y + event.movementY * 0.0006, -0.07, 0.07);
  });
  const heldKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', ...crouchKeys]);
  window.addEventListener('keydown', event => {
    if (state !== 'playing' || document.pointerLockElement !== canvas) return;
    if (heldKeys.has(event.code)) {
      event.preventDefault();
      keys.add(event.code);
    }
    if (event.code === 'Space') {
      event.preventDefault();
      if (!event.repeat && !jumpHeight && !verticalSpeed && !wantsToCrouch()) {
        verticalSpeed = jumpSpeed;
      }
    }
    if (event.code === 'KeyR' && !event.repeat) {
      event.preventDefault();
      reload(elapsed + performance.now() - activeSince);
    }
  });
  window.addEventListener('keyup', event => keys.delete(event.code));
  window.addEventListener('blur', () => {
    clearControls();
    keys.clear();
    if (document.pointerLockElement === canvas) document.exitPointerLock();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearControls();
    if (document.hidden && document.pointerLockElement === canvas) document.exitPointerLock();
  });

  function resize() {
    const { clientWidth, clientHeight } = range;
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(clientWidth, clientHeight, false);
    reflection.resize(clientWidth, clientHeight);
  }
  window.addEventListener('resize', resize);
  resize();
  reset();
  let lastFrame = performance.now();
  renderer.setAnimationLoop(now => {
    const dt = Math.min(Math.max(0, now - lastFrame) / 1_000, 0.05);
    lastFrame = now;
    if (state === 'playing') {
      const time = elapsed + performance.now() - activeSince;
      if (time >= roundLength) {
        finish();
      } else {
        timer.textContent = String(Math.ceil((roundLength - time) / 1_000)).padStart(2, '0');
        if (refilledAt && time >= refilledAt) {
          refilledAt = 0;
          ammo = capacity;
          updateAmmo();
        }
        hit.style.opacity = time < hitUntil ? '1' : '0';
        if (jumpHeight || verticalSpeed) {
          jumpHeight += (verticalSpeed - gravity * dt / 2) * dt;
          verticalSpeed -= gravity * dt;
          if (jumpHeight <= 0) {
            landing = Math.min(1, -verticalSpeed / jumpSpeed);
            jumpHeight = verticalSpeed = 0;
          }
        }
        const airborne = jumpHeight > 0 || verticalSpeed > 0;
        const crouching = !airborne && wantsToCrouch();
        eyeHeight = THREE.MathUtils.damp(eyeHeight, crouching ? crouchingHeight : standingHeight, 18, dt);
        camera.position.y = eyeHeight + jumpHeight;
        movement.set(
          Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft')),
          Number(keys.has('KeyS') || keys.has('ArrowDown')) - Number(keys.has('KeyW') || keys.has('ArrowUp')),
        ).normalize().rotateAround(center, -camera.rotation.y).multiplyScalar((crouching ? 2.5 : 5) * dt);
        const x = THREE.MathUtils.clamp(camera.position.x + movement.x, dockBounds.left, dockBounds.right);
        const z = THREE.MathUtils.clamp(camera.position.z + movement.y, dockBounds.back, dockBounds.front);
        const oldX = camera.position.x, oldZ = camera.position.z;
        if (canStandAt(x, camera.position.z)) camera.position.x = x;
        if (canStandAt(camera.position.x, z)) camera.position.z = z;
        const distance = Math.hypot(camera.position.x - oldX, camera.position.z - oldZ);
        const walking = !airborne && distance > 0.00001;
        strideWeight = THREE.MathUtils.damp(strideWeight, Number(walking), 12, dt);
        if (!airborne) stride += distance * (crouching ? 2.4 : 1.8);
        reloadProgress = refilledAt ? 1 - (refilledAt - time) / reloadDuration : 0;
        updateTarget(time);
      }
    } else if (state === 'ready') {
      updateTarget(0);
      target.position.y += Math.sin(now / 500) * 0.2;
    }
    const motionDt = state === 'playing' || state === 'ready' ? dt : 0;
    const aimGoal = Number(aimHeld && state === 'playing' && !refilledAt);
    aim = THREE.MathUtils.damp(aim, aimGoal, 18, dt);
    if (Math.abs(aim - aimGoal) < 0.001) aim = aimGoal;
    const fov = 71 - 17 * aim;
    if (camera.fov !== fov) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    crosshair.hidden = aim > 0.8;
    breath += motionDt * 1.65;
    turnLag.multiplyScalar(Math.exp(-11 * motionDt));
    landing *= Math.exp(-12 * motionDt);
    // Exact damped spring step keeps the impulse consistent at different render rates.
    const phase = 24 * motionDt, decay = Math.exp(-16 * motionDt);
    const springY = (kickVelocity + 16 * kick) / 24;
    kickVelocity = decay * (kickVelocity * Math.cos(phase) - (24 * kick + 16 * springY) * Math.sin(phase));
    kick = decay * (kick * Math.cos(phase) + springY * Math.sin(phase));
    const tilt = THREE.MathUtils.smoothstep(reloadProgress, 0, 0.22)
      - THREE.MathUtils.smoothstep(reloadProgress, 0.73, 1);
    const bodyOffset = Math.min(0.265, camera.aspect * 0.27);
    const horizontalBob = Math.sin(stride) * strideWeight;
    const verticalBob = Math.sin(stride * 2) * strideWeight;
    blaster.position.set(bodyOffset + horizontalBob * 0.011 - turnLag.x * 0.19 - tilt * 0.045,
      -0.242 + verticalBob * 0.009 + Math.sin(breath) * 0.003 + tilt * 0.092 - landing * 0.032,
      -0.78 + kick * 0.058 - tilt * 0.055);
    blaster.rotation.set(0.09 + kick * 0.115 + turnLag.y + tilt * 0.14 - landing * 0.065,
      0.34 + turnLag.x + tilt * 0.14, -0.045 + horizontalBob * 0.017 - tilt * 0.36 + kick * 0.014);
    const hipWeight = 1 - aim;
    blaster.rotation.set(blaster.rotation.x * hipWeight + aim * kick * 0.036,
      blaster.rotation.y * hipWeight, blaster.rotation.z * hipWeight);
    // Rotate around the optic center so the dot stays on the camera's hit ray.
    aimedPosition.copy(sightCenter).applyQuaternion(blaster.quaternion).negate();
    aimedPosition.z -= 0.55 - kick * 0.028;
    blaster.position.lerp(aimedPosition, aim);
    poseReload(reloadProgress, bodyOffset);
    flash.updateSmoke(motionDt);
    fragments.update(motionDt);
    reflection.render(camera, now);
    const flashStrength = state === 'playing' ? Math.max(0, 1 - flashAge / 0.052) : 0;
    flash.sprite.visible = flashStrength > 0;
    flash.sprite.material.opacity = flashStrength;
    flash.light.intensity = 2.4 * flashStrength * flashStrength;
    flashAge += dt;
    // Refresh the moving target's shadows at most 30 times per second on average.
    const nextShadowTick = Math.floor(now * 30 / 1000);
    renderer.shadowMap.needsUpdate = nextShadowTick !== shadowTick;
    shadowTick = nextShadowTick;
    renderer.render(scene, camera);
  });

  if (!canvas.requestPointerLock || matchMedia('(pointer: coarse)').matches) {
    showMenu('悬浮靶场', '开始训练', '请使用带键盘和鼠标的桌面浏览器');
  } else {
    action.disabled = false;
  }
}

startGame().catch(error => {
  console.error(error);
  showMenu('悬浮靶场', '开始训练', '3D 场景加载失败，请检查浏览器是否支持 WebGL 2');
});
