import * as THREE from 'three';

const { clamp, lerp } = THREE.MathUtils;
const unit = value => clamp(value, 0, 1);

function hash(x, y) {
  const key = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  const mixed = Math.imul(key ^ (key >>> 13), 1274126177);
  return ((mixed ^ (mixed >>> 16)) >>> 0) / 4294967295;
}

function noise(x, y) {
  const i = Math.floor(x);
  const j = Math.floor(y);
  const a = THREE.MathUtils.smoothstep(x - i, 0, 1);
  const b = THREE.MathUtils.smoothstep(y - j, 0, 1);
  return lerp(lerp(hash(i, j), hash(i + 1, j), a),
    lerp(hash(i, j + 1), hash(i + 1, j + 1), a), b);
}

export function fbm(x, y) {
  return 0.57 * noise(x, y) + 0.28 * noise(x * 2.03 + 7, y * 2.03)
    + 0.15 * noise(x * 4.1, y * 4.1 + 9);
}

function paintContainer(ctx, width, height, label, number) {
  ctx.fillStyle = '#d2d0bd';
  ctx.font = '900 78px monospace';
  ctx.fillText(label, 83, 173);
  ctx.font = 'bold 39px monospace';
  ctx.fillText(number, 88, 221);
  ctx.font = 'bold 22px monospace';
  ctx.fillText('22G1 / MAX GROSS 30 480 KG', 88, 251);
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#c9c5b1';
  ctx.strokeRect(88, 271, 150, 40);
  ctx.fillText('DRY CARGO', 98, 299);
  ctx.fillStyle = '#4b362d80';
  for (let i = 0; i < 1800; i++) {
    ctx.fillRect(hash(i, 1) * width, hash(i, 2) * height, 1 + hash(i, 3) * 4, 1 + hash(i, 4) * 2);
  }
}

function paintPlaque(ctx, width, height) {
  ctx.strokeStyle = '#4f3b26';
  ctx.lineWidth = 2;
  ctx.strokeRect(6, 6, width - 12, height - 12);
  ctx.strokeRect(10, 10, width - 20, height - 20);
  ctx.fillStyle = '#302019';
  ctx.textAlign = 'center';
  ctx.font = 'bold 25px Georgia';
  ctx.fillText('NORTH QUAY', width / 2, 49);
  ctx.font = 'bold 12px monospace';
  ctx.fillText('BERTH 04  /  KEEP CLEAR', width / 2, 91);
  for (let i = 0; i < 110; i++) {
    const x = hash(i, 21) * width;
    const y = hash(i, 22) * height;
    ctx.strokeStyle = i % 3 ? '#e9d49a70' : '#4b32276a';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 8 + hash(i, 23) * 37, y - 3 + hash(i, 24) * 6);
    ctx.stroke();
  }
}

export async function createDockMaterials(renderer) {
  const loader = new THREE.TextureLoader();
  async function surface(name, repeatX, repeatY) {
    const [map, normalMap, roughnessMap] = await Promise.all(['diff','nor_gl','rough'].map(async kind => {
      const tex = await loader.loadAsync('/materials/' + name + '-' + kind + '.jpg');
      tex.colorSpace = kind === 'diff' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(repeatX, repeatY);
      tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      return tex;
    }));
    return {map, normalMap, roughnessMap};
  }
  const [paving, concrete, sheet] = await Promise.all([surface('floor',16,14), surface('wall',2,1), surface('metal',2,1)]);
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  function material(width, height, sample, options = {}) {
    const { repeat = [1, 1], bumpScale = 0.012, metalness = 0, paint } = options;
    const contexts = Array.from({ length: metalness ? 4 : 3 }, () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      return canvas.getContext('2d');
    });
    const pixels = contexts.map(ctx => ctx.createImageData(width, height));
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const values = sample(x / width, y / height, hash(x, y));
        const offset = (y * width + x) * 4;
        for (let m = 0; m < pixels.length; m++) {
          const { data } = pixels[m];
          const channel = m === 0 ? 0 : m + 2;
          data[offset] = 255 * values[channel];
          data[offset + 1] = 255 * values[m === 0 ? 1 : channel];
          data[offset + 2] = 255 * values[m === 0 ? 2 : channel];
          data[offset + 3] = 255;
        }
      }
    }
    const [map, roughnessMap, bumpMap, metalnessMap = null] = contexts.map((ctx, i) => {
      ctx.putImageData(pixels[i], 0, 0);
      if (i === 0) paint?.(ctx, width, height);
      const texture = new THREE.CanvasTexture(ctx.canvas);
      if (i === 0) texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(...repeat);
      texture.anisotropy = anisotropy;
      return texture;
    });
    return new THREE.MeshStandardMaterial({
      map, roughnessMap, bumpMap, bumpScale, metalness, metalnessMap, roughness: 1,
    });
  }

  function container(color, label, number) {
    return material(1024, 384, (u, v, grit) => {
      const mottling = fbm(u * 27, v * 14);
      const streak = fbm(u * 112, v * 3);
      const pitting = fbm(u * 172, v * 109);
      const edge = Math.max(0, 1 - (1 - v) * 11) * 0.28 + Math.max(0, 1 - v * 18) * 0.09;
      const rust = unit((mottling * 0.62 + streak * 0.28 + pitting * 0.10 + edge - 0.57) * 8);
      const tint = 0.76 + mottling * 0.23 + streak * 0.19 + (grit - 0.5) * 0.065;
      return [lerp(color[0] * tint, 0.25 + pitting * 0.27, rust),
        lerp(color[1] * tint, 0.073 + pitting * 0.13, rust),
        lerp(color[2] * tint, 0.027 + pitting * 0.058, rust),
        lerp(0.45 + streak * 0.26, 0.93, rust), 0.26 + 0.37 * pitting + rust * 0.24,
        lerp(0.28, 0.05, rust)];
    }, { metalness: 1, bumpScale: 0.014, paint: (ctx, w, h) => paintContainer(ctx, w, h, label, number) });
  }

  const floor = material(512, 512, (u, v, grit) => {
    const scale = fbm(u * 11, v * 11);
    const grain = fbm(u * 127, v * 127);
    const shade = 0.24 + scale * 0.25 + grain * 0.18 + (grit - 0.5) * 0.13;
    return [shade, shade * 0.98, shade * 0.93, 0.62 + scale * 0.33, 0.21 + grain * 0.49 + grit * 0.23];
  }, { repeat: [18, 16], bumpScale: 0.016 });
  floor.map.dispose();
  floor.roughnessMap.dispose();
  Object.assign(floor, paving);
  floor.normalScale.set(.64,.64);
  floor.envMapIntensity = 0.68;
  const wall = new THREE.MeshStandardMaterial({...concrete, color:0xa1acaf, roughness:.88});

  const galvanized = material(320, 320, (u, v, grit) => {
    const x = u * 21;
    const y = v * 21;
    const i = Math.floor(x);
    const j = Math.floor(y);
    let nearest = 10;
    let second = 10;
    let crystal = 0;
    for (let cy = j - 1; cy <= j + 1; cy++) {
      for (let cx = i - 1; cx <= i + 1; cx++) {
        const d = (x - cx - hash(cx, cy)) ** 2 + (y - cy - hash(cx + 31, cy + 47)) ** 2;
        if (d < nearest) {
          second = nearest;
          nearest = d;
          crystal = hash(cx + 15, cy + 12);
        } else if (d < second) {
          second = d;
        }
      }
    }
    const edge = unit((second - nearest) * 7);
    const shade = 0.40 + 0.28 * crystal + 0.07 * edge + grit * 0.04;
    return [shade * 0.95, shade, shade * 1.04, 0.3 + 0.43 * crystal, 0.36 + 0.25 * edge, 0.87];
  }, { repeat: [2.5, 1], bumpScale: 0.006, metalness: 1 });

  const rubber = material(256, 256, (u, v, grit) => {
    const grain = fbm(u * 35, v * 51);
    const shade = 0.063 + grain * 0.073 + grit * 0.021;
    return [shade * 0.95, shade, shade * 1.035, 0.76 + 0.18 * grain, 0.37 + 0.50 * grain];
  }, { repeat: [2, 1], bumpScale: 0.008 });

  const wood = material(512, 192, (u, v, grit) => {
    const bend = fbm(u * 4, v * 10);
    const grain = fbm(u * 6, v * 160 + bend * 14);
    const ring = 0.5 + 0.5 * Math.sin(v * 186 + bend * 14);
    const knot = unit(1 - Math.hypot((u - 0.64) * 10, (v - 0.38) * 4));
    const shade = 0.37 + 0.22 * grain + 0.08 * ring - 0.24 * unit((grain - 0.5) * 2 + knot * 0.6)
      + (grit - 0.5) * 0.06;
    return [shade, shade * 0.73, shade * 0.49, 0.63 + 0.29 * grain, 0.21 + 0.65 * grain];
  }, { bumpScale: 0.009 });

  const plaque = material(256, 128, (u, v, grit) => {
    const n = fbm(u * 15, v * 12);
    const scratch = fbm(u * 15, v * 120);
    const tarnish = unit((n - 0.49) * 2.3);
    return [lerp(0.75, 0.31, tarnish) + 0.08 * scratch, lerp(0.55, 0.30, tarnish),
      lerp(0.29, 0.23, tarnish), 0.27 + 0.52 * tarnish + 0.12 * grit,
      0.35 + n * 0.3, 0.82 - 0.30 * tarnish];
  }, { bumpScale: 0.003, metalness: 1, paint: paintPlaque });

  galvanized.map.dispose();
  galvanized.roughnessMap.dispose();
  Object.assign(galvanized,sheet);
  return {
    floor, wall, galvanized, rubber, wood, plaque,
    rustRed: container([0.58, 0.26, 0.17], 'NORTH QUAY', 'NQDU 480317 6'),
    paintedBlue: container([0.23, 0.39, 0.47], 'PORT SERVICE', 'NQSU 710284 3'),
  };
}
