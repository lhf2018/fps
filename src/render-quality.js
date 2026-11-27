import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const profiles = {
  ULTRA: {scale:1.5, samples:4, ao:1, shadow:2048, mirror:960, mirrorHz:30, bloom:.32},
  HIGH: {scale:1, samples:2, ao:.65, shadow:1024, mirror:640, mirrorHz:20, bloom:.29},
  PERFORMANCE: {scale:.68, samples:0, ao:0, shadow:512, mirror:320, mirrorHz:10, bloom:.22}
};
export function selectQuality(renderer) {
  const gl = renderer.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '';
  const pixels = innerWidth * innerHeight * Math.min(devicePixelRatio,1.5) ** 2;
  const weak = /swiftshader|llvmpipe|intel.*(uhd|hd graphics)|mali|adreno/i.test(gpu);
  const automatic = weak || pixels > 4200000 ? 'PERFORMANCE' : /RTX|Radeon RX|Apple M/i.test(gpu) && pixels < 3000000 ? 'ULTRA' : 'HIGH';
  const requested = new URLSearchParams(location.search).get('quality')?.toUpperCase();
  const name = Object.hasOwn(profiles,requested) ? requested : automatic;
  return { name, ...profiles[name], exposure:1.04, radius:.48, threshold:1.12, grain:.003, fringe:.00038, vignette:.16 };
}

export function createPipeline(renderer, scene, camera, q) {
  const target = new THREE.WebGLRenderTarget(1,1,{type:renderer.extensions.has('EXT_color_buffer_float') ? THREE.HalfFloatType : THREE.UnsignedByteType,samples:Math.min(q.samples,renderer.capabilities.maxSamples)});
  const composer = new EffectComposer(renderer,target);
  composer.addPass(new RenderPass(scene,camera));
  const ao = q.ao && new SSAOPass(scene,camera,1,1,16);
  if (ao) {
    ao.kernelRadius = 5;
    ao.minDistance = .0008;
    ao.maxDistance = .036;
    composer.addPass(ao);
  }
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(1,1),q.bloom,q.radius,q.threshold));
  composer.addPass(new OutputPass());
  const grade = new ShaderPass({ uniforms:{tDiffuse:{value:null},time:{value:0},grain:{value:q.grain},fringe:{value:q.fringe},vignette:{value:q.vignette}},
    vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`uniform sampler2D tDiffuse; uniform float time,grain,fringe,vignette; varying vec2 vUv;
      void main(){vec2 p=vUv-.5,d=p*dot(p,p)*fringe;vec3 c=texture2D(tDiffuse,vUv).rgb;
      c.r=texture2D(tDiffuse,vUv+d).r;c.b=texture2D(tDiffuse,vUv-d).b;
      c*=1.-vignette*smoothstep(.08,.5,dot(p,p));c+=vec3(.003,.006,.009)*(1.-c);
      c+=(fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233))+time)*43758.5453)-.5)*grain;
      gl_FragColor=vec4(c,1.);}` });
  composer.addPass(grade);
  return {
    resize(w,h,dpr){composer.setPixelRatio(dpr);composer.setSize(w,h);if(ao)ao.setSize(Math.max(1,Math.round(w*dpr*q.ao)),Math.max(1,Math.round(h*dpr*q.ao)))},
    render(now){grade.uniforms.time.value=now*.001;composer.render()},
    dispose(){for(const pass of composer.passes)pass.dispose();composer.dispose()}
  };
}
