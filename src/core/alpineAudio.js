// ============================================================================
// 100% Zero-Asset Spatial Alpine Web Audio Synthesizer
// Synthesizes wind, powder hiss, icy edge carving scrape, pole plants, jumps,
// and deep sub-bass slab avalanche cracks/roars purely via Web Audio API!
// ============================================================================

export class AlpineAudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.masterGain = null;
    this.channels = {};
  }

  toggle() {
    if (!this.ctx) {
      this._init();
    }
    this.enabled = !this.enabled;
    if (this.ctx.state === 'suspended' && this.enabled) {
      this.ctx.resume();
    }
    if (this.masterGain) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setTargetAtTime(this.enabled ? 0.58 : 0.0, now, 0.08);
    }
    return this.enabled;
  }

  _init() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioCtx();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.0;
    this.masterGain.connect(this.ctx.destination);

    // Synthesize 3-second seamless pink/white noise AudioBuffer (0 external audio files!)
    const sr = this.ctx.sampleRate;
    const len = sr * 3;
    const buffer = this.ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.96900 * b2 + w * 0.1538520;
        b3 = 0.86650 * b3 + w * 0.3104856;
        b4 = 0.55000 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.0168980;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.095;
        b6 = w * 0.115926;
      }
      // Crossfade seam so 3-second loop is click-free
      const fade = 1024;
      for (let i = 0; i < fade; i++) {
        const t = i / fade;
        data[len - fade + i] = data[len - fade + i] * (1 - t) + data[i] * t;
      }
    }

    const makeChannel = (type, freq, Q = 1.0) => {
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.loopStart = 0;
      src.loopEnd = 3.0;

      const filter = this.ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = freq;
      filter.Q.value = Q;

      const panner = this.ctx.createStereoPanner();
      panner.pan.value = 0;

      const gain = this.ctx.createGain();
      gain.gain.value = 0.0;

      src.connect(filter);
      filter.connect(panner);
      panner.connect(gain);
      gain.connect(this.masterGain);
      src.start(0, Math.random() * 2.5);

      return { src, filter, panner, gain };
    };

    this.channels.wind    = makeChannel('bandpass', 260, 0.8);
    this.channels.windHi  = makeChannel('highpass', 1600, 0.7);
    this.channels.powder  = makeChannel('bandpass', 1100, 0.65);
    this.channels.carve   = makeChannel('bandpass', 2400, 2.2);
    this.channels.ice     = makeChannel('bandpass', 3600, 3.8);
    this.channels.avySub  = makeChannel('lowpass', 88, 1.4);
    this.channels.avyMid  = makeChannel('bandpass', 480, 0.75);
  }

  update({ speed, edgeAngle, airborne, avyActive, avyProximity, onBlueIce = false, windGust = 0, paused }) {
    if (!this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime;
    const sp = paused ? 0.0 : Math.min(1.0, speed / 22.0);
    const carve = paused || airborne > 0.06 ? 0.0 : Math.min(1.0, Math.abs(edgeAngle) / 0.55) * sp;
    const ground = paused || airborne > 0.06 ? 0.0 : sp;
    const pan = Math.max(-0.65, Math.min(0.65, -edgeAngle * 1.1));
    const gustBoost = Math.min(1.0, Math.abs(windGust) / 3.5);

    this.channels.wind.filter.frequency.setTargetAtTime(160 + sp * 520 + gustBoost * 280, now, 0.08);
    this.channels.wind.gain.gain.setTargetAtTime(0.06 + sp * sp * 0.45 + gustBoost * 0.35, now, 0.08);

    this.channels.windHi.gain.gain.setTargetAtTime(sp * sp * 0.14 + gustBoost * 0.22, now, 0.08);

    this.channels.powder.filter.frequency.setTargetAtTime(800 + sp * 1200, now, 0.06);
    this.channels.powder.gain.gain.setTargetAtTime(onBlueIce ? ground * 0.08 : ground * 0.34, now, 0.06);

    this.channels.carve.filter.frequency.setTargetAtTime(1700 + carve * 2100, now, 0.05);
    this.channels.carve.panner.pan.setTargetAtTime(pan, now, 0.05);
    this.channels.carve.gain.gain.setTargetAtTime(carve * 0.48, now, 0.05);

    this.channels.ice.panner.pan.setTargetAtTime(pan, now, 0.05);
    this.channels.ice.gain.gain.setTargetAtTime(onBlueIce ? ground * 0.55 : 0.0, now, 0.04);

    const avyVol = avyActive * (0.22 + avyProximity * 0.95);
    this.channels.avySub.filter.frequency.setTargetAtTime(65 + avyProximity * 75, now, 0.1);
    this.channels.avySub.gain.gain.setTargetAtTime(avyVol * 1.15, now, 0.1);

    this.channels.avyMid.filter.frequency.setTargetAtTime(320 + avyProximity * 650, now, 0.1);
    this.channels.avyMid.gain.gain.setTargetAtTime(avyVol * 0.72, now, 0.1);
  }

  playGateClear() {
    if (!this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(660, now);
    osc.frequency.setValueAtTime(880, now + 0.06);
    g.gain.setValueAtTime(0.22, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.24);
  }

  playGateMiss() {
    if (!this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(190, now);
    osc.frequency.linearRampToValueAtTime(125, now + 0.22);
    g.gain.setValueAtTime(0.18, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.28);
  }

  playImpact() {
    if (!this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.18);
    g.gain.setValueAtTime(0.65, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.24);
  }

  playFinishFanfare() {
    if (!this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      const t0 = now + idx * 0.085;
      osc.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(0.26, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.45);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(t0);
      osc.stop(t0 + 0.48);
    });
  }

  playAvalancheCrack() {
    if (!this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime;

    // Deep resonant snowpack "whumpf" slab collapse punch
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(135, now);
    osc.frequency.exponentialRampToValueAtTime(34, now + 0.42);
    gain.gain.setValueAtTime(0.95, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.58);
  }

  playPolePlant() {
    if (!this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(78, now + 0.07);
    gain.gain.setValueAtTime(0.24, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  playJumpPop() {
    if (!this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(240, now + 0.09);
    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.15);
  }
}
