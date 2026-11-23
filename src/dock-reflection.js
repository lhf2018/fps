import * as THREE from 'three';

export function createDockReflection(renderer, scene, ground, viewmodel) {
  const mirror = new THREE.PerspectiveCamera();
  const target = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
  });
  const projection = new THREE.Matrix4();
  const height = ground.position.y;
  const clip = new THREE.Plane(new THREE.Vector3(0, 1, 0), -height);
  const direction = new THREE.Vector3();
  const lookAt = new THREE.Vector3();
  const time = { value: 0 };
  let lastRender = -Infinity;

  ground.material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, {
      dockMirror: { value: target.texture },
      dockProjection: { value: projection },
      dockTime: time,
    });
    shader.vertexShader = 'varying vec3 dockWorld;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\ndockWorld = (modelMatrix * vec4(position, 1.0)).xyz;',
    );
    shader.fragmentShader = [
      'varying vec3 dockWorld;',
      'uniform sampler2D dockMirror;',
      'uniform mat4 dockProjection;',
      'uniform float dockTime;',
      'float quayBasin(vec2 p, vec2 center, vec2 size) {',
      '  vec2 d = p - center;',
      '  float edge = length(d / size) + 0.07 * sin(p.x * 7.8 + p.y * 4.9)',
      '    + 0.05 * cos(p.y * 13.5 - p.x * 6.2) + 0.023 * sin(p.x * 20.3 + p.y * 19.4);',
      '  return 1.0 - smoothstep(0.75, 1.03, edge);',
      '}',
    ].join('\n') + '\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <map_fragment>', [
        '#include <map_fragment>',
        'vec2 p = dockWorld.xz;',
        'float wet = quayBasin(p, vec2(-2.8, -3.5), vec2(3.05, 3.10));',
        'wet = max(wet, quayBasin(p, vec2(2.25, -8.55), vec2(3.65, 2.10)));',
        'wet = max(wet, quayBasin(p, vec2(0.7, -12.55), vec2(4.20, 2.23)));',
        'wet = max(wet, quayBasin(p, vec2(4.6, -0.7), vec2(2.35, 1.40)));',
        'wet = max(wet, quayBasin(p, vec2(-6.5, -8.3), vec2(1.65, 2.32)));',
        'wet = max(wet, quayBasin(p, vec2(-2.5, 2.2), vec2(2.10, 1.15)));',
        'float damp = smoothstep(0.0, 0.80, wet);',
        'diffuseColor.rgb *= mix(0.92, 0.41, damp);',
      ].join('\n'))
      .replace('#include <roughnessmap_fragment>', [
        '#include <roughnessmap_fragment>',
        'roughnessFactor = mix(roughnessFactor, 0.16, damp);',
      ].join('\n'))
      .replace('#include <normal_fragment_maps>', [
        '#include <normal_fragment_maps>',
        'normal = normalize(mix(normal, nonPerturbedNormal, damp * 0.96));',
      ].join('\n'))
      .replace('#include <opaque_fragment>', [
        'if (wet > 0.0) {',
        '  vec4 projected = dockProjection * vec4(dockWorld, 1.0);',
        '  vec2 uvMirror = projected.xy / max(projected.w, 0.0001) * 0.5 + 0.5;',
        '  vec2 ripple = vec2(sin(p.x * 18.0 + p.y * 11.0 - dockTime * 1.2),',
        '    cos(p.x * 13.0 - p.y * 16.0 + dockTime));',
        '  uvMirror += ripple * 0.00135;',
        '  vec2 edge = min(uvMirror, 1.0 - uvMirror);',
        '  float valid = step(0.001, projected.w) * smoothstep(0.0, 0.025, min(edge.x, edge.y));',
        '  vec3 reflection = textureLod(dockMirror, clamp(uvMirror, 0.001, 0.999), mix(3.1, 0.45, wet)).rgb;',
        '  float facing = abs(normalize(cameraPosition - dockWorld).y);',
        '  float fresnel = 0.08 + 0.88 * pow(1.0 - facing, 4.0);',
        '  outgoingLight = mix(outgoingLight, reflection, wet * fresnel * valid);',
        '}',
        '#include <opaque_fragment>',
      ].join('\n'));
  };

  function resize(width, height) {
    const scale = Math.min(0.54, 700 / Math.max(width, height, 1));
    target.setSize(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
    lastRender = -Infinity;
  }

  function render(camera, now) {
    time.value = now / 1000;
    if (now - lastRender < 30) return;
    lastRender = now;
    camera.getWorldDirection(direction);
    lookAt.copy(camera.position).add(direction);
    lookAt.y = 2 * height - lookAt.y;
    mirror.position.copy(camera.position);
    mirror.position.y = 2 * height - camera.position.y;
    mirror.up.set(0, -1, 0);
    mirror.lookAt(lookAt);
    mirror.projectionMatrix.copy(camera.projectionMatrix);
    mirror.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
    mirror.updateMatrixWorld();
    projection.multiplyMatrices(mirror.projectionMatrix, mirror.matrixWorldInverse);

    const priorTarget = renderer.getRenderTarget();
    const priorClip = renderer.clippingPlanes;
    const priorShadowUpdate = renderer.shadowMap.autoUpdate;
    const weaponVisible = viewmodel.visible;
    ground.visible = viewmodel.visible = false;
    renderer.clippingPlanes = [clip];
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(target);
    try {
      renderer.render(scene, mirror);
    } finally {
      renderer.setRenderTarget(priorTarget);
      renderer.clippingPlanes = priorClip;
      renderer.shadowMap.autoUpdate = priorShadowUpdate;
      ground.visible = true;
      viewmodel.visible = weaponVisible;
    }
  }

  return { resize, render };
}
