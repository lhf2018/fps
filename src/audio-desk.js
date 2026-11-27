import { RangeAudio } from './synth-audio.js';

const sounds = [
  ['shot-outdoor', '步枪单发', '室外开阔尾音'],
  ['shot-indoor', '室内枪声', '短促墙面反射'],
  ['reload-out', '退弹匣', '金属卡扣与空仓'],
  ['reload-in', '上弹匣', '导轨与弹匣就位'],
  ['reload-bolt', '拉枪栓', '机械拨动与闭锁'],
  ['casing', '弹壳落地', '连续滚跳与收尾'],
  ['step-concrete', '水泥脚步', '湿润硬地'],
  ['step-metal', '金属脚步', '带共振的踏击'],
  ['step-water', '积水脚步', '踩水与飞溅'],
  ['whiz', '子弹掠耳', '快速左右掠过'],
  ['ricochet', '跳弹', '尖锐弹跳与衰减'],
  ['rain', '持续雨声', '按钮切换雨幕'],
  ['thunder', '远处雷声', '缓慢滚动的低频雷'],
  ['music', '紧张配乐', '约 30 秒的合成循环'],
];
const grid = document.querySelector('#sounds');
for (const [id, title, detail] of sounds) {
  const button = document.createElement('button');
  button.dataset.sound = id;
  button.innerHTML = '<span>' + title + '</span><small>' + detail + '</small><i>PLAY</i>';
  grid.append(button);
}
const canvas = document.querySelector('#scope');
const ctx = canvas.getContext('2d');
const state = document.querySelector('#state');
let audio, engine, analyser, waveform, spectrum, raf = 0, silenced = false;
function render() {
  raf = requestAnimationFrame(render);
  analyser.getByteTimeDomainData(waveform);
  analyser.getByteFrequencyData(spectrum);
  const { width, height } = canvas;
  ctx.fillStyle = '#101715';
  ctx.fillRect(0, 0, width, height);
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#bcf58d');
  gradient.addColorStop(1, '#58c9c4');
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 2;
  ctx.shadowColor = '#8be6b4';
  ctx.shadowBlur = 8;
  ctx.beginPath();
  waveform.forEach((value, i) => {
    const x = i * width / waveform.length;
    const y = height * .50 + (value - 128) * height * .0031;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.shadowBlur = 0;
  const columns = 76;
  const step = Math.floor(spectrum.length / columns);
  for (let i = 0; i < columns; i++) {
    const level = spectrum[i * step] / 255;
    const barHeight = Math.max(2, level * height * .43);
    ctx.fillStyle = i > 56 ? '#e5ad7d' : '#70d5b1';
    ctx.fillRect(i * (width / columns + .5), height - barHeight, width / columns - 3, barHeight);
  }
}
async function activate() {
  if (audio) {
    if (audio.state === 'suspended') await audio.resume();
    return;
  }
  audio = new AudioContext();
  analyser = audio.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = .78;
  analyser.connect(audio.destination);
  engine = new RangeAudio(audio, analyser);
  waveform = new Uint8Array(analyser.fftSize);
  spectrum = new Uint8Array(analyser.frequencyBinCount);
  await audio.resume();
  state.textContent = 'LIVE SIGNAL · OSCILLATORS + FILTERED NOISE';
  if (!raf) render();
}
for (const button of grid.children) {
  button.addEventListener('click', async () => {
    silenced = false;
    await activate();
    const id = button.dataset.sound;
    button.classList.add('playing');
    state.textContent = id.startsWith('shot') ? 'WEAPON / PROCEDURAL REPORT'
      : id.startsWith('step') ? 'FOLEY / SURFACE RESPONSE' : 'SYNTHESIS / LIVE';
    if (id === 'music') engine.stopMusic();
    if (id === 'rain') engine.stopRain();
    for (let variation = 0; variation < 3; variation++) {
      if (variation) await new Promise(resolve => setTimeout(resolve, 230 + Math.random() * 120));
      if (id === 'music') {
        engine.stopMusic();
        engine.musicStep = variation * 17;
        engine.startMusic();
      } else if (id === 'rain') {
        engine.stopRain();
        engine.startRain(.16 + Math.random() * .12);
      } else {
        engine.play(id);
      }
    }
    setTimeout(() => {
      button.classList.remove('playing');
      if (!silenced && !engine.musicTimer && !engine.rainSource) state.textContent = 'READY · THREE RANDOM VARIATIONS';
    }, id === 'music' ? 14500 : id === 'thunder' ? 2500 : 1800);
  });
}
document.querySelector('#silence').addEventListener('click', () => {
  if (!engine) return;
  silenced = true;
  engine.stopRain();
  engine.stopMusic();
  audio.suspend();
  state.textContent = 'SUSPENDED · AUDIO SILENT';
  grid.querySelectorAll('.playing').forEach(button => button.classList.remove('playing'));
});
addEventListener('resize', () => {
  const ratio = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.floor(canvas.clientWidth * ratio);
  canvas.height = Math.floor(canvas.clientHeight * ratio);
});
dispatchEvent(new Event('resize'));

