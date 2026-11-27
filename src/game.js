import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import { RangeAudio } from './synth-audio.js';
import { isPuddle } from './dock-reflection.js';
import { createViewmodel } from './viewmodel.js';
import { createDock, dockBounds } from './dock-scene.js';
import { createDockReflection } from './dock-reflection.js';
import { createTargetFragments } from './target-fragments.js';
import { createTrainingTarget } from './training-target.js';
import { createImpacts } from './impacts.js';
import './style.css';

const range = document.querySelector('#range');
const overlay = document.querySelector('#overlay');
const title = document.querySelector('#title');
const result = document.querySelector('#result');
const action = document.querySelector('#action');
const settlement = document.querySelector('#settlement');
const nextRound = document.querySelector('#next-round');
const settlementError = document.querySelector('#settlement-error');
const finalStats = ['score', 'hits', 'shots', 'accuracy']
  .map(name => document.querySelector(`#final-${name}`));
const timer = document.querySelector('#timer');
const scoreLabel = document.querySelector('#score');
const ammoLabel = document.querySelector('#ammo');
const hit = document.querySelector('#hit');
const impactFx = document.querySelector('#impact-fx');
const roundLength = 60_000;
const capacity = 30;
const shotInterval = 100;
const flashDuration = 50;
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
  const camera = new THREE.PerspectiveCamera(71, 1, 0.05, 450);
  camera.rotation.order = 'YXZ';
  scene.add(camera);
  const [{ ground, obstacles, surfaces, targetMaterial, rainTime, updateHarbor }, { model: blaster, setVariant, poseReload, sightCenter, dot, flash }] =
    await Promise.all([createDock(renderer, scene), createViewmodel()]);

  const target = createTrainingTarget(targetMaterial);
  const shootables = surfaces.concat(target.children);
  const impacts = createImpacts(scene);
  const fragments = createTargetFragments(scene, target);
  scene.add(target);

  camera.add(blaster);
  scene.add(flash.light, ...flash.smoke);
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
  ray.far = camera.far;
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
  let best = null;
  let ammo = capacity;
  let shots = 0;
  let lockRequest;
  let lookPitch = 0;
  let recoilPitch = 0;
  let refilledAt = 0;
  let nextShot = 0;
  let fireHeld = false;
  let firePressed = false;
  let aimHeld = false;
  let aim = 0;
  const aimedPosition = new THREE.Vector3();
  let hitUntil = 0;
  let lastImpactTime = -Infinity;
  let impactCombo = 0;
  let kick = 0;
  let flashStarted = -Infinity;
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
  let sound;
  let footstepDistance = 0;
  let reloadSoundStarted = 0;
  let reloadSoundsPlayed = 0;
  let shotsSinceCasing = 0;
  let nextRoundConfirmed = false;
  let nextRoundConfirmTimer = 0;
  function playSound(name) {
    if (audio?.state === 'running') sound?.play(name);
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
    impacts.clear();
    lookPitch = recoilPitch = shots = elapsed = score = refilledAt = nextShot = hitUntil = kick = targetIndex = 0;
    stride = strideWeight = reloadProgress = kickVelocity = landing = breath = 0;
    footstepDistance = 0;
    reloadSoundStarted = reloadSoundsPlayed = shotsSinceCasing = 0;
    turnLag.set(0, 0);
    flashStarted = -Infinity;
    flash.setStrength(0);
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
    nextRoundConfirmed = false;
    clearTimeout(nextRoundConfirmTimer);
    nextRound.textContent = '开始下一局';
  }

  function finish() {
    if (state !== 'playing') return;
    state = 'finished';
    sound?.stopMusic();
    sound?.stopRain();
    clearControls();
    timer.textContent = '00';
    hit.style.opacity = '0';
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    const accuracy = shots ? `${(100 * score / shots).toFixed(1)}%` : '—';
    [score, score, shots, accuracy].forEach((value, i) => { finalStats[i].textContent = value; });
    try {
      const stored = localStorage.getItem('range60.personalBest');
      if (stored !== null && /^\d+$/.test(stored) && Number.isSafeInteger(Number(stored))) {
        best = Math.max(best ?? 0, Number(stored));
      }
    } catch { /* Keep the in-memory record when storage is blocked. */ }
    const previous = best;
    best = Math.max(score, best ?? 0);
    if (previous !== best) {
      try { localStorage.setItem('range60.personalBest', String(best)); } catch { /* Session record survives. */ }
    }
    document.querySelector('#best-score').textContent = best;
    document.querySelector('#record-change').textContent = previous === null ? '首次完成'
      : score > previous ? `新纪录，提高 ${score-previous} 分`
      : score === previous ? '追平纪录' : `距纪录 ${previous-score} 分`;
    overlay.hidden = true;
    settlementError.hidden = true;
    nextRoundConfirmed = false;
    clearTimeout(nextRoundConfirmTimer);
    nextRound.textContent = '开始下一局';
    settlement.hidden = false;
  }

  function reload(time) {
    if (time >= roundLength || ammo === capacity || refilledAt) return;
    refilledAt = time + reloadDuration;
    updateAmmo();
    reloadSoundStarted = performance.now();
    reloadSoundsPlayed = 1;
    playSound('reload-out');
  }

  function fire(time) {
    if (time >= roundLength || time < nextShot || refilledAt) return false;
    if (!ammo) {
      reload(time);
      return false;
    }
    ammo--;
    shots++;
    updateAmmo();
    nextShot = time + shotInterval;
    // Resolve the shot before adding its recoil to the current aim.
    playSound('shot-outdoor');
    if (++shotsSinceCasing % 2 === 0 || Math.random() < .42) playSound('casing');
    camera.updateMatrixWorld(true);
    ray.setFromCamera(center, camera);
    const [impact] = ray.intersectObjects(shootables, false);
    const targetHit = impact?.object.parent === target;
    if (impact) impacts.emit(impact, targetHit);
    if (targetHit) {
      impactFeedback(impact.point, time);
      fragments.breakTarget(target, impact.point, ray.ray.direction);
      score++;
      scoreLabel.textContent = String(score).padStart(2, '0');
      hitUntil = time + 170;
      targetIndex = (targetIndex + 1) % positions.length;
      updateTarget(time);
      playSound('ricochet');
    } else if (impact && impact.object.userData.surface === 'metal' && Math.random() < .72) {
      playSound('ricochet');
    } else if (Math.random() < .28) {
      playSound('whiz');
    }
    if (!ammo) reload(time);
    return true;
  }

  const impactScreen = new THREE.Vector3();
  function impactFeedback(worldPoint, time) {
    impactCombo = time - lastImpactTime < 1_050 ? impactCombo + 1 : 0;
    lastImpactTime = time;
    impactScreen.copy(worldPoint).project(camera);
    const x = THREE.MathUtils.clamp((impactScreen.x * .5 + .5) * 100, 4, 96);
    const y = THREE.MathUtils.clamp((-impactScreen.y * .5 + .5) * 100, 4, 96);
    range.style.setProperty('--impact-x', x + '%');
    range.style.setProperty('--impact-y', y + '%');
    range.style.setProperty('--impact-power', String(Math.min(1.48, 1 + impactCombo * .13)));
    range.classList.remove('impact-pulse');
    void range.offsetWidth;
    range.classList.add('impact-pulse');
  }

  function clearControls() {
    fireHeld = firePressed = aimHeld = false;
    keys.clear();
  }
  canvas.addEventListener('contextmenu', event => event.preventDefault());
  window.addEventListener('mousedown', event => {
    if (state !== 'playing' || document.pointerLockElement !== canvas) return;
    if (event.button === 2) aimHeld = true;
    if (event.button === 0) fireHeld = firePressed = true;
  });
  window.addEventListener('mouseup', event => {
    if (event.button === 2) aimHeld = false;
    if (event.button === 0) fireHeld = false;
  });

  function lockFailed(request) {
    if (!request || lockRequest !== request) return;
    lockRequest = undefined;
    request.button.disabled = false;
    const message = request.state === 'finished' ? settlementError : result;
    message.textContent = '浏览器未能锁定鼠标，请重试';
    message.hidden = false;
  }

  async function requestLock(event) {
    const button = event.currentTarget;
    if (!event.isTrusted || lockRequest || state === 'playing' ||
        (button === nextRound) !== (state === 'finished')) return;
    const request = { button, state };
    lockRequest = request;
    button.disabled = true;
    try {
      await canvas.requestPointerLock();
    } catch {
      lockFailed(request);
    }
  }
  action.addEventListener('click', requestLock);
  nextRound.addEventListener('click', event => {
    if (state !== 'finished') return;
    if (!nextRoundConfirmed) {
      nextRoundConfirmed = true;
      nextRound.textContent = '确认开始下一局';
      clearTimeout(nextRoundConfirmTimer);
      nextRoundConfirmTimer = window.setTimeout(() => {
        nextRoundConfirmed = false;
        nextRound.textContent = '开始下一局';
      }, 3500);
      return;
    }
    nextRoundConfirmed = false;
    clearTimeout(nextRoundConfirmTimer);
    requestLock(event);
  });
  document.addEventListener('pointerlockerror', () => lockFailed(lockRequest));
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === canvas) {
      if (!lockRequest || lockRequest.state !== state || document.hidden) {
        if (state !== 'playing') document.exitPointerLock();
        return;
      }
      lockRequest.button.disabled = false;
      lockRequest = undefined;
      if (state !== 'paused') reset();
      settlement.hidden = true;
      state = 'playing';
      activeSince = performance.now();
      sound?.startMusic();
      overlay.hidden = true;
      if (window.AudioContext) {
        audio ??= new AudioContext();
        void audio.resume().catch(() => {});
        sound ??= new RangeAudio(audio);
        sound.startRain(.105);
        sound.startMusic();
      }
    } else if (state === 'playing') {
      clearControls();
      elapsed += performance.now() - activeSince;
      if (elapsed >= roundLength) {
        finish();
        return;
      }
      state = 'paused';
      sound?.stopMusic();
      showMenu('训练暂停', '继续训练');
    }
  });
  document.addEventListener('mousemove', event => {
    if (state !== 'playing' || document.pointerLockElement !== canvas) return;
    const sensitivity = 0.0021 * (1 - 0.35 * aim);
    camera.rotation.y -= event.movementX * sensitivity;
    lookPitch = THREE.MathUtils.clamp(lookPitch - event.movementY * sensitivity, -1.42, 1.42);
    updatePitch();
    turnLag.x = THREE.MathUtils.clamp(turnLag.x + event.movementX * 0.00075, -0.095, 0.095);
    turnLag.y = THREE.MathUtils.clamp(turnLag.y + event.movementY * 0.0006, -0.07, 0.07);
  });
  function updatePitch() {
    camera.rotation.x = THREE.MathUtils.clamp(lookPitch + recoilPitch, -1.42, 1.42);
  }

  const heldKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', ...crouchKeys]);
  window.addEventListener('keydown', event => {
    if (state !== 'playing' || document.pointerLockElement !== canvas) return;
    if (event.code === 'Escape') {
      document.exitPointerLock();
      return;
    }
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
    if (document.pointerLockElement === canvas) document.exitPointerLock();
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    clearControls();
    lockFailed(lockRequest);
    if (document.pointerLockElement === canvas) document.exitPointerLock();
  });

  let renderTime = 0;
  let needsRender = true;
  const rifleSelect = document.querySelector('#rifle');
  setVariant(rifleSelect.value);
  rifleSelect.disabled = false;
  rifleSelect.addEventListener('change', () => {
    setVariant(rifleSelect.value);
    needsRender = true;
  });
  function resize() {
    needsRender = true;
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
    const frameDt = Math.max(0, now - lastFrame) / 1000;
    const dt = Math.min(frameDt, 0.05);
    lastFrame = now;
    const time = state === 'playing' ? elapsed + performance.now() - activeSince : elapsed;
    if (state === 'playing' && time >= roundLength) finish();
    if (state === 'paused' || state === 'finished') {
      if (needsRender) {
        reflection.render(camera, renderTime, true);
        renderer.render(scene, camera);
        needsRender = false;
      }
      return;
    }
    if (state === 'playing') {
      timer.textContent = String(Math.ceil((roundLength - time) / 1_000)).padStart(2, '0');
      if (refilledAt && time >= refilledAt) {
        refilledAt = 0;
        ammo = capacity;
        updateAmmo();
      }
      if (refilledAt) {
        const progress = (performance.now() - reloadSoundStarted) / reloadDuration;
        if (reloadSoundsPlayed === 1 && progress >= .48) {
          reloadSoundsPlayed = 2;
          playSound('reload-in');
        }
        if (reloadSoundsPlayed === 2 && progress >= .79) {
          reloadSoundsPlayed = 3;
          playSound('reload-bolt');
        }
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
      if (walking) {
        footstepDistance += distance;
        const stepLength = crouching ? .94 : .68;
        if (footstepDistance >= stepLength) {
          footstepDistance %= stepLength;
          const nearRail = Math.hypot(camera.position.x - 4.85, camera.position.z + 4.5) < 1.85;
          playSound(isPuddle(camera.position.x, camera.position.z) ? 'step-water'
            : nearRail ? 'step-metal' : 'step-concrete');
        }
      } else {
        footstepDistance = 0;
      }
      strideWeight = THREE.MathUtils.damp(strideWeight, Number(walking), 12, dt);
      if (!airborne) stride += distance * (crouching ? 2.4 : 1.8);
      reloadProgress = refilledAt ? 1 - (refilledAt - time) / reloadDuration : 0;
      updateTarget(time);
    } else {
      updateTarget(0);
      target.position.y += Math.sin(now / 500) * 0.2;
    }
    const aimGoal = Number(aimHeld && state === 'playing' && !refilledAt);
    aim = THREE.MathUtils.damp(aim, aimGoal, 18, dt);
    if (Math.abs(aim - aimGoal) < 0.001) aim = aimGoal;
    const fov = 71 - 17 * aim;
    if (camera.fov !== fov) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    const sightWeight = Math.min(1, aim / 0.8);
    dot.visible = crosshair.hidden = sightWeight === 1;
    breath += dt * 1.65;
    turnLag.multiplyScalar(Math.exp(-11 * dt));
    landing *= Math.exp(-12 * dt);
    // Exact damped spring step keeps the impulse consistent at different render rates.
    const recoilDt = Math.min(frameDt, 1);
    const phase = 24 * recoilDt, decay = Math.exp(-16 * recoilDt);
    const springY = (kickVelocity + 16 * kick) / 24;
    kickVelocity = decay * (kickVelocity * Math.cos(phase) - (24 * kick + 16 * springY) * Math.sin(phase));
    kick = decay * (kick * Math.cos(phase) + springY * Math.sin(phase));
    impacts.update(frameDt);
    const fired = state === 'playing' && document.pointerLockElement === canvas &&
      (fireHeld || firePressed) && fire(time);
    firePressed = false;
    recoilPitch *= Math.exp(-15 * recoilDt);
    if (fired) {
      const strength = 1.3 * (1 - 0.4 * aim);
      kick = Math.min(strength, kick + 0.31 * strength);
      kickVelocity = Math.min(52 * strength, kickVelocity + 32 * strength);
      recoilPitch = Math.min(0.034 * strength, recoilPitch + 0.022 * strength);
    }
    updatePitch();
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
    const hipWeight = 1 - sightWeight;
    blaster.rotation.set(blaster.rotation.x * hipWeight + aim * kick * 0.036,
      blaster.rotation.y * hipWeight, blaster.rotation.z * hipWeight);
    // Rotate around the optic center so the dot stays on the camera's hit ray.
    aimedPosition.copy(sightCenter).applyQuaternion(blaster.quaternion).negate();
    aimedPosition.z -= 0.55 - kick * 0.058;
    blaster.position.lerp(aimedPosition, sightWeight);
    poseReload(reloadProgress, bodyOffset);
    flash.updateSmoke(dt);
    fragments.update(dt);

    const wasLit = flash.light.intensity > 0;
    if (fired) {
      flashStarted = performance.now();
      flash.ignite(aim);
    }
    const flashStrength = fired ? 1 : Math.max(0, 1 - (performance.now() - flashStarted) / flashDuration);
    flash.setStrength(flashStrength);
    renderTime = now;
    needsRender = false;
    // Both passes see the current pulse, including the frame where it goes dark.
    rainTime.value = now / 1000;
    updateHarbor(now / 1000);
    reflection.render(camera, now, wasLit || flashStrength > 0);
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
