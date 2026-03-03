"use client";

class AudioEngine {
  ctx: AudioContext | null = null;
  masterGain: GainNode | null = null;
  bgmInterval: ReturnType<typeof setInterval> | null = null;

  init() {
    if (this.ctx) return;
    try {
      const AudioContextCompat =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCompat) {
        return;
      }
      this.ctx = new AudioContextCompat();
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);
      this.masterGain.gain.value = 0.5;
    } catch (e) {
      console.error("Audio engine failed to initialize", e);
    }
  }

  setVolume(vol: number) {
    if (this.masterGain) {
      this.masterGain.gain.value = vol;
    }
  }

  playOscillator(type: OscillatorType, freq: number, decay: number, vol: number = 1, slideToFreq?: number) {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    if (slideToFreq) {
      osc.frequency.exponentialRampToValueAtTime(slideToFreq, this.ctx.currentTime + decay);
    }

    gain.gain.setValueAtTime(vol, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + decay);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(this.ctx.currentTime + decay);
  }

  playHit() {
    this.init();
    // Ultra-heavy explosive synth (808 style punch)
    this.playOscillator("square", 120, 0.4, 1.2, 30);
    this.playOscillator("sawtooth", 240, 0.3, 1, 40);
    this.playOscillator("sine", 60, 0.6, 1.5, 20); // Sub bass punch

    // High impact Noise burst
    if (!this.ctx || !this.masterGain) return;
    const bufferSize = this.ctx.sampleRate * 0.4;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(3000, this.ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(50, this.ctx.currentTime + 0.3);
    filter.Q.value = 10; // High resonance for a "pew/crack" sound

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(1.0, this.ctx.currentTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.4);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.masterGain);
    noise.start();
  }

  playDouble() {
    this.init();
    // Extreme Arcade riser
    this.playOscillator("sawtooth", 150, 0.8, 1, 2400);
    this.playOscillator("square", 200, 0.8, 0.8, 2800);
    setTimeout(() => this.playOscillator("square", 2800, 0.6, 0.8, 400), 500);
  }

  playRollThrow() {
    this.init();
    // Fast aggressive Whoosh up
    this.playOscillator("square", 100, 0.25, 0.8, 1200);
  }

  playRollStop() {
    this.init();
    // High-pitched casino ding
    this.playOscillator("sine", 1200, 0.5, 1);
    this.playOscillator("triangle", 1800, 0.6, 0.8);
    // Subtle coin drop clink
    setTimeout(() => this.playOscillator("sine", 2400, 0.4, 0.6), 50);
  }

  playWin() {
    this.init();
    // Hyperactive victory Arpeggio (Casino jackpot style)
    const notes = [440, 554.37, 659.25, 880, 1108.73, 1318.51, 1760, 2217.46, 2637.02];
    notes.forEach((freq, i) => {
      setTimeout(() => {
        this.playOscillator("square", freq, 0.2, 0.6);
        this.playOscillator("sawtooth", freq * 1.5, 0.3, 0.4);
      }, i * 50);
    });
    setTimeout(() => {
      this.playOscillator("square", 1760, 2.0, 0.8);
      this.playOscillator("sawtooth", 2217.46, 2.0, 0.6);
      this.playOscillator("triangle", 2637.02, 2.0, 0.6);
    }, notes.length * 50);
  }

  playTick() {
    this.init();
    this.playOscillator("sine", 1000, 0.1, 0.3);
  }

  startBgm() {
    this.init();
    if (this.bgmInterval) return;

    // Faster, more aggressive cyberpunk/arcade bassline sequence
    const notes = [
      110, 110, 220, 110,
      130.81, 130.81, 261.63, 130.81,
      98, 98, 196, 98,
      146.83, 146.83, 293.66, 146.83
    ];
    let step = 0;

    this.bgmInterval = setInterval(() => {
      if (!this.ctx) return;
      const note = notes[step % notes.length];

      // Punchy Pluck Bass
      this.playOscillator("sawtooth", note, 0.15, 0.25);
      this.playOscillator("square", note / 2, 0.2, 0.2); // Sub oscillator

      // Aggressive hi-hat/snare on off-beats
      if (step % 2 !== 0) {
        this.playOscillator("square", 800, 0.05, 0.1, 8000);
      }
      if (step % 4 === 2) {
        this.playOscillator("square", 150, 0.15, 0.15, 50);
      }

      step++;
    }, 180); // Faster tempo
  }

  stopBgm() {
    if (this.bgmInterval) {
      clearInterval(this.bgmInterval);
      this.bgmInterval = null;
    }
  }
}

export const synth = new AudioEngine();
