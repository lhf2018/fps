const pick = values => values[Math.floor(Math.random() * values.length)];
const jitter = amount => (Math.random() * 2 - 1) * amount;

export class RangeAudio {
  constructor(context, destination = context.destination) {
    this.context = context;
    this.output = context.createGain();
    this.output.gain.value = .72;
    this.output.connect(destination);
    this.noise = this.makeNoise(2);
    this.ir = this.makeImpulse(2.15);
    this.delay = context.createDelay(1);
    this.feedback = context.createGain();
    this.delayFilter = context.createBiquadFilter();
    this.delayFilter.type = 'lowpass';
    this.delayFilter.frequency.value = 2350;
    this.feedback.gain.value = .19;
    this.delay.connect(this.delayFilter);
    this.delayFilter.connect(this.feedback);
    this.feedback.connect(this.delay);
    this.delay.connect(this.output);
    this.compressor = context.createDynamicsCompressor();
    this.compressor.threshold.value = -17;
    this.compressor.knee.value = 15;
    this.compressor.ratio.value = 3.1;
    this.compressor.attack.value = .006;
    this.compressor.release.value = .23;
    this.output.disconnect();
    this.output.connect(this.compressor);
    this.compressor.connect(destination);
    this.convolver = context.createConvolver();
    this.convolver.buffer = this.ir;
    this.wet = context.createGain();
    this.wet.gain.value = .20;
    this.convolver.connect(this.wet);
    this.wet.connect(this.compressor);
    this.master = context.createGain();
    this.master.gain.value = .74;
    this.compressor.disconnect();
    this.compressor.connect(this.master);
    this.master.connect(destination);
    this.lowMusic = null;
    this.highMusic = null;
    this.rainSource = null;
    this.rainGain = null;
    this.rainFilter = null;
    this.musicTimer = 0;
    this.musicStep = 0;
    this.stormTimer = 0;
  }

  makeNoise(seconds) {
    const buffer = this.context.createBuffer(1, Math.ceil(this.context.sampleRate * seconds), this.context.sampleRate);
    const data = buffer.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      brown = (brown + .018 * white) / 1.018;
      data[i] = .72 * white + 5.5 * brown;
    }
    return buffer;
  }

  makeImpulse(seconds) {
    const buffer = this.context.createBuffer(2, Math.ceil(this.context.sampleRate * seconds), this.context.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < data.length; i++) {
        const t = i / data.length;
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.8) * (.77 + .23 * Math.sin(t * 83 + channel));
      }
    }
    return buffer;
  }

  envelope(node, time, peak, attack, release) {
    node.gain.setValueAtTime(.0001, time);
    node.gain.exponentialRampToValueAtTime(Math.max(.0002, peak), time + attack);
    node.gain.exponentialRampToValueAtTime(.0001, time + attack + release);
  }

  oscillator(frequency, endFrequency, duration, volume, type = 'sine', when = this.context.currentTime, pan = 0) {
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    const stereo = this.context.createStereoPanner();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(18, frequency), when);
    if (endFrequency) osc.frequency.exponentialRampToValueAtTime(Math.max(18, endFrequency), when + duration * .77);
    this.envelope(gain, when, volume, Math.min(.009, duration * .16), duration * .84);
    stereo.pan.setValueAtTime(pan, when);
    osc.connect(gain).connect(stereo).connect(this.output);
    osc.start(when);
    osc.stop(when + duration + .025);
    return osc;
  }

  filteredNoise(duration, volume, low, high, when = this.context.currentTime, pan = 0, q = .65) {
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    const stereo = this.context.createStereoPanner();
    source.buffer = this.noise;
    source.playbackRate.value = .84 + Math.random() * .36;
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(low, when);
    filter.frequency.exponentialRampToValueAtTime(Math.max(60, high), when + duration * .7);
    filter.Q.value = q;
    this.envelope(gain, when, volume, .002 + Math.random() * .004, duration * (.75 + Math.random() * .3));
    stereo.pan.setValueAtTime(pan, when);
    source.connect(filter).connect(gain).connect(stereo).connect(this.output);
    source.start(when, Math.random() * .8, duration + .03);
    source.stop(when + duration + .04);
  }

  echoNoise(duration, volume, low, high, when, pan = 0) {
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    const stereo = this.context.createStereoPanner();
    source.buffer = this.noise;
    source.playbackRate.value = .55 + Math.random() * .35;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(low, when);
    filter.frequency.exponentialRampToValueAtTime(high, when + duration * .7);
    this.envelope(gain, when, volume, .018, duration);
    stereo.pan.setValueAtTime(pan, when);
    source.connect(filter).connect(gain).connect(stereo).connect(this.delay);
    source.start(when, Math.random(), duration + .05);
    source.stop(when + duration + .08);
  }

  rifle(indoor = false, pan = 0) {
    const now = this.context.currentTime;
    const variant = Math.floor(Math.random() * 3);
    const body = [1, .93, 1.08][variant];
    this.filteredNoise(.038 + Math.random() * .019, .82 * body, 520 + Math.random() * 150, 110 + Math.random() * 55, now, pan, 1.15);
    this.filteredNoise(.21 + Math.random() * .08, .22, 2400 + Math.random() * 1000, 500 + Math.random() * 300, now + .002, pan * .45, .38);
    this.oscillator(96 + Math.random() * 22, 34 + Math.random() * 8, .18, .49 * body, 'sine', now, pan);
    this.oscillator(430 + Math.random() * 170, 78 + Math.random() * 42, .075, .19, 'triangle', now, pan);
    this.oscillator(1580 + Math.random() * 370, 710 + Math.random() * 220, .034, .10, 'sine', now, pan);
    const reflections = indoor ? [[.035,.28],[.064,.22],[.108,.16],[.19,.10],[.34,.075]]
      : [[.075,.17],[.16,.14],[.29,.105],[.51,.075],[.82,.052]];
    const scale = [.83,1,1.15][variant];
    for (const [delay, level] of reflections) {
      const time = now + delay * (.9 + Math.random() * .2);
      this.filteredNoise(.035 + delay * .075, level * scale, 1400 - delay * 900, 230 + delay * 100, time, pan * .36, .42);
      this.oscillator(110 - delay * 43, 44, .11 + delay * .1, level * .32, 'sine', time, pan * .3);
    }
  }

  reloadStep(step) {
    const now = this.context.currentTime;
    const variation = Math.random();
    if (step === 0) {
      this.filteredNoise(.065 + variation * .026, .34, 3100 + variation * 1100, 450, now, -.08);
      this.oscillator(420 + variation * 90, 150 + variation * 35, .048 + variation * .02, .23, 'triangle', now, -.08);
      this.oscillator(138 + variation * 31, 82, .12, .15, 'sine', now + .018, -.08);
    } else if (step === 1) {
      this.filteredNoise(.043 + variation * .02, .29, 2200 + variation * 700, 300, now, .04);
      this.oscillator(244 + variation * 66, 105 + variation * 24, .08, .3, 'triangle', now, .04);
      this.oscillator(93 + variation * 17, 56, .13, .2, 'sine', now + .005, .04);
      this.filteredNoise(.10, .10, 7000, 2800, now + .026, .03, .4);
    } else {
      this.filteredNoise(.09 + variation * .02, .25, 4100 + variation * 1000, 360, now, .09);
      this.oscillator(720 + variation * 120, 125 + variation * 25, .085, .31, 'triangle', now, .09);
      this.oscillator(176 + variation * 29, 52, .17, .29, 'sine', now + .008, .07);
      this.filteredNoise(.045, .10, 1600, 500, now + .025, .08);
    }
  }

  casing() {
    const now = this.context.currentTime;
    const pan = jitter(.72);
    const pitch = .9 + Math.random() * .23;
    for (let i = 0; i < 3; i++) {
      const t = now + i * (.062 + Math.random() * .025);
      this.oscillator((2900 - i * 550) * pitch, 1300 - i * 180, .028 + Math.random() * .018, .09 / (i + 1), 'sine', t, pan * (1 - i * .18));
      this.filteredNoise(.018 + i * .006, .055 / (i + 1), 8000 - i * 900, 1900 - i * 250, t, pan);
    }
    this.oscillator(340 * pitch, 110, .10, .085, 'triangle', now + .19, pan);
  }

  footstep(surface = 'concrete') {
    const now = this.context.currentTime;
    const side = Math.random() < .5 ? -.16 : .16;
    const strength = .82 + Math.random() * .33;
    if (surface === 'water') {
      this.filteredNoise(.19, .31 * strength, 1800 + Math.random() * 1300, 240 + Math.random() * 140, now, side, .42);
      this.oscillator(190 + Math.random() * 60, 74 + Math.random() * 25, .14, .19 * strength, 'sine', now, side);
      this.filteredNoise(.13, .14, 900 + Math.random() * 600, 4800 + Math.random() * 1700, now + .025, side * -1, .5);
      this.filteredNoise(.12, .06, 2400, 750, now + .09, side, .6);
    } else if (surface === 'metal') {
      this.oscillator(118 + Math.random() * 22, 47, .17, .39 * strength, 'sine', now, side);
      this.oscillator(475 + Math.random() * 150, 260 + Math.random() * 100, .28, .23, 'triangle', now + .008, side);
      this.oscillator(1160 + Math.random() * 420, 440, .19, .105, 'sine', now + .014, side);
      this.filteredNoise(.072, .18, 2300, 310, now, side, .54);
    } else {
      this.filteredNoise(.095, .28 * strength, 2100 + Math.random() * 700, 190 + Math.random() * 75, now, side, .6);
      this.oscillator(112 + Math.random() * 25, 48, .13, .34 * strength, 'sine', now, side);
      this.oscillator(520 + Math.random() * 130, 120, .055, .085, 'triangle', now, side);
      this.filteredNoise(.06, .075, 3200, 1000, now + .035, side, .5);
    }
  }

  bulletPass() {
    const now = this.context.currentTime + .035;
    const pan = pick([-0.88, .82]) + jitter(.12);
    this.filteredNoise(.20 + Math.random() * .12, .39, 7600 + Math.random() * 2300, 950 + Math.random() * 550, now, pan, .36);
    this.oscillator(570 + Math.random() * 280, 135, .12, .11, 'sine', now, pan * .9);
    this.oscillator(75 + Math.random() * 32, 43, .24, .10, 'triangle', now + .085, -pan * .4);
  }

  ricochet() {
    const now = this.context.currentTime;
    const base = 1050 + Math.random() * 1250;
    const pan = jitter(.65);
    this.filteredNoise(.052, .23, 7600 + Math.random() * 1400, 1700, now, pan, 1.8);
    for (const [time, ratio, gain] of [[0,1,.32],[.075,.68,.20],[.17,1.31,.12]]) {
      this.oscillator(base * ratio, base * ratio * .8, .19 + Math.random() * .11, gain, 'sine', now + time, pan);
    }
    this.oscillator(185, 58, .19, .13, 'triangle', now, pan);
  }

  startRain(level = .14) {
    if (this.rainSource) return;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = this.noise;
    source.loop = true;
    source.playbackRate.value = .73;
    filter.type = 'lowpass';
    filter.frequency.value = 7900;
    gain.gain.value = .0001;
    source.connect(filter).connect(gain).connect(this.output);
    source.start();
    gain.gain.setTargetAtTime(level, this.context.currentTime + .03, .8);
    this.rainSource = source;
    this.rainGain = gain;
    this.rainFilter = filter;
    this.scheduleStorm();
  }

  stopRain() {
    if (!this.rainSource) return;
    const now = this.context.currentTime;
    this.rainGain.gain.cancelScheduledValues(now);
    this.rainGain.gain.setTargetAtTime(.0001, now, .2);
    this.rainSource.stop(now + 1.1);
    this.rainSource = null;
    clearTimeout(this.stormTimer);
  }

  thunder() {
    const now = this.context.currentTime;
    this.echoNoise(1.7 + Math.random() * 1.7, .40, 260 + Math.random() * 120, 43, now, jitter(.25));
    this.oscillator(48 + Math.random() * 12, 31, 1.3 + Math.random() * .5, .22, 'sine', now + .12);
    for (let i = 0; i < 9; i++) {
      const t = now + .13 + i * (.11 + Math.random() * .16);
      this.filteredNoise(.43 + Math.random() * .5, .15 * (1 - i * .055), 490 + Math.random() * 550, 75 + Math.random() * 75, t, jitter(.45), .22);
    }
  }

  scheduleStorm() {
    if (!this.rainSource) return;
    const delay = 12_000 + Math.random() * 17_000;
    this.stormTimer = setTimeout(() => {
      if (!this.rainSource) return;
      this.thunder();
      this.scheduleStorm();
    }, delay);
  }

  startMusic() {
    if (this.musicTimer) return;
    const now = this.context.currentTime;
    this.lowMusic = this.context.createGain();
    this.highMusic = this.context.createGain();
    const lowFilter = this.context.createBiquadFilter();
    lowFilter.type = 'lowpass';
    lowFilter.frequency.value = 570;
    const highFilter = this.context.createBiquadFilter();
    highFilter.type = 'lowpass';
    highFilter.frequency.value = 2450;
    this.lowMusic.gain.value = .0001;
    this.highMusic.gain.value = .0001;
    lowFilter.connect(this.lowMusic).connect(this.output);
    highFilter.connect(this.highMusic).connect(this.output);
    this.lowMusic.gain.setTargetAtTime(.19, now + .2, 2.2);
    this.highMusic.gain.setTargetAtTime(.105, now + .4, 2.8);
    const bpm = 82;
    const stepDuration = 60 / bpm / 2;
    const root = pick([46.25, 51.91, 55]);
    const bass = [0,0,7,0,3,0,10,0,0,5,0,7,3,0,2,0];
    const pulse = [0,0,1,0,0,1,0,0,0,0,1,0,0,1,0,0];
    const droneNotes = [root,root*1.189,root*1.498,root*1.335];
    const schedule = () => {
      if (!this.musicTimer) return;
      const step = this.musicStep % 80;
      const t = this.context.currentTime + .06;
      const beat = step % 16;
      if (step % 2 === 0) {
        const note = root * Math.pow(2, bass[beat] / 12);
        this.oscillator(note, note * .996, stepDuration * 1.95, .48, 'triangle', t);
        this.oscillator(note * 2.004, note * 1.99, stepDuration * 1.72, .10, 'sine', t);
      }
      if (pulse[beat] && Math.random() > .18) {
        this.filteredNoise(.12, .13, 135 + Math.random() * 90, 39, t, 0, .25);
      }
      if (step % 8 === 0) {
        const note = droneNotes[(Math.floor(step / 20) + Math.floor(this.musicStep / 80)) % droneNotes.length];
        this.oscillator(note, note * .995, stepDuration * 15.5, .15, 'sine', t);
        this.oscillator(note * 2.003, note * 2, stepDuration * 7.2, .038, 'triangle', t + .018, jitter(.15));
      }
      if (step % 4 === 2) {
        const note = root * 4 * pick([1,1.189,1.335,1.498,1.782]);
        this.oscillator(note, note * .997, stepDuration * 2.8, .035 + Math.random() * .03, 'triangle', t + .012, jitter(.4));
      }
      if (beat === 15 && Math.random() > .38) this.ricochet();
      this.musicStep++;
      this.musicTimer = setTimeout(schedule, stepDuration * 1000);
    };
    schedule();
  }

  stopMusic() {
    clearTimeout(this.musicTimer);
    this.musicTimer = 0;
    const now = this.context.currentTime;
    for (const gain of [this.lowMusic, this.highMusic]) {
      if (!gain) continue;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(.0001, now, .17);
    }
    this.lowMusic = this.highMusic = null;
  }

  play(id) {
    switch (id) {
      case 'shot-outdoor': this.rifle(false); break;
      case 'shot-indoor': this.rifle(true); break;
      case 'reload-out': this.reloadStep(0); break;
      case 'reload-in': this.reloadStep(1); break;
      case 'reload-bolt': this.reloadStep(2); break;
      case 'casing': this.casing(); break;
      case 'step-concrete': this.footstep('concrete'); break;
      case 'step-metal': this.footstep('metal'); break;
      case 'step-water': this.footstep('water'); break;
      case 'whiz': this.bulletPass(); break;
      case 'ricochet': this.ricochet(); break;
      case 'thunder': this.thunder(); break;
      case 'rain': this.startRain(.22); break;
      case 'music': this.startMusic(); break;
      default: throw new Error('Unknown synthesized sound: ' + id);
    }
  }
}
