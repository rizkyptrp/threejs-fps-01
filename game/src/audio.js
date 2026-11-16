// Synthesized sound: every effect is built from oscillators and filtered noise
// in a WebAudio graph. No audio assets, no network. Mute with M.
export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let stepAt = 0;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return ctx;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
    } catch {
      return null;
    }
    return ctx;
  }

  function noiseBuffer(duration) {
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function burst({ duration, type = 'lowpass', freq = 1200, gain = 0.5, at = 0, sweepTo = null }) {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime + at;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer(duration + 0.05);
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t0);
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t0 + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    source.connect(filter).connect(g).connect(master);
    source.start(t0);
    source.stop(t0 + duration + 0.05);
  }

  function tone({ freq = 440, to = null, duration = 0.12, type = 'sine', gain = 0.3, at = 0 }) {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(g).connect(master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  return {
    unlock() {
      ensure();
    },
    toggleMute() {
      muted = !muted;
      return muted;
    },
    get muted() {
      return muted;
    },
    shot(kind) {
      if (kind === 'rifle') {
        burst({ duration: 0.09, freq: 900, sweepTo: 220, gain: 0.55 });
        tone({ freq: 160, to: 70, duration: 0.08, type: 'square', gain: 0.22 });
      } else if (kind === 'smg') {
        burst({ duration: 0.06, freq: 1400, sweepTo: 320, gain: 0.4 });
      } else if (kind === 'shotgun') {
        burst({ duration: 0.16, freq: 700, sweepTo: 120, gain: 0.7 });
        tone({ freq: 120, to: 50, duration: 0.14, type: 'square', gain: 0.3 });
      } else {
        burst({ duration: 0.08, freq: 1100, sweepTo: 260, gain: 0.5 });
        tone({ freq: 220, to: 90, duration: 0.07, type: 'square', gain: 0.18 });
      }
    },
    dryFire() {
      tone({ freq: 1400, duration: 0.03, type: 'square', gain: 0.12 });
    },
    reload() {
      tone({ freq: 900, duration: 0.04, type: 'square', gain: 0.14 });
      tone({ freq: 700, duration: 0.04, type: 'square', gain: 0.14, at: 0.22 });
      tone({ freq: 1100, duration: 0.04, type: 'square', gain: 0.14, at: 0.5 });
    },
    hit() {
      tone({ freq: 2400, duration: 0.05, type: 'sine', gain: 0.25 });
    },
    kill() {
      tone({ freq: 660, duration: 0.09, type: 'sine', gain: 0.28 });
      tone({ freq: 990, duration: 0.12, type: 'sine', gain: 0.28, at: 0.08 });
    },
    hurt() {
      burst({ duration: 0.12, freq: 500, sweepTo: 140, gain: 0.4 });
      tone({ freq: 110, to: 60, duration: 0.15, type: 'sawtooth', gain: 0.2 });
    },
    explosion() {
      burst({ duration: 0.7, freq: 900, sweepTo: 60, gain: 0.9 });
      tone({ freq: 90, to: 28, duration: 0.6, type: 'sine', gain: 0.6 });
    },
    flashbang() {
      tone({ freq: 3200, duration: 0.5, type: 'sine', gain: 0.3 });
      tone({ freq: 2400, duration: 0.4, type: 'sine', gain: 0.2, at: 0.05 });
    },
    beep() {
      tone({ freq: 1200, duration: 0.07, type: 'square', gain: 0.16 });
    },
    plant() {
      tone({ freq: 880, duration: 0.1, type: 'square', gain: 0.2 });
      tone({ freq: 1320, duration: 0.14, type: 'square', gain: 0.2, at: 0.12 });
    },
    click() {
      tone({ freq: 1800, duration: 0.03, type: 'square', gain: 0.12 });
    },
    buy() {
      tone({ freq: 520, duration: 0.08, type: 'sine', gain: 0.25 });
      tone({ freq: 780, duration: 0.1, type: 'sine', gain: 0.25, at: 0.07 });
    },
    roundWin() {
      [523, 659, 784].forEach((f, i) => tone({ freq: f, duration: 0.16, type: 'triangle', gain: 0.25, at: i * 0.11 }));
    },
    roundLose() {
      [392, 330, 262].forEach((f, i) => tone({ freq: f, duration: 0.18, type: 'triangle', gain: 0.22, at: i * 0.12 }));
    },
    footstep(now) {
      if (now < stepAt) return;
      stepAt = now + 0.38;
      burst({ duration: 0.05, freq: 400, sweepTo: 150, gain: 0.12 });
    },
  };
}
