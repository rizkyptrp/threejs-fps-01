// Synthesized sound effects for SANDLINE, built entirely from the WebAudio
// API: oscillators for tones and filtered noise buffers for bangs, cracks
// and footsteps. There are no audio files and no network requests here.
//
// The AudioContext is created lazily -- only once the player actually does
// something that should make a sound (or explicitly unlocks audio on a user
// gesture). Importing this module must stay silent, and every method must
// degrade to a harmless no-op when there is no AudioContext at all (a
// headless browser, for example) or while the player has muted the game.

const MASTER_LEVEL = 0.35;
const FOOTSTEP_GAP = 0.38;

export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let isMuted = false;
  let lastStepAt = -Infinity;

  // Build (or resume) the context on demand. Returns null when audio is
  // unavailable, so callers can bail out without throwing.
  function ensureCtx() {
    if (isMuted) return null;
    try {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = MASTER_LEVEL;
        master.connect(ctx.destination);
      }
      if (ctx.state === 'suspended') void ctx.resume();
      return ctx;
    } catch {
      return null;
    }
  }

  // One shared 1-second white-noise buffer; every noise-based sound slices
  // a piece of it through its own filter instead of allocating a new buffer.
  function noiseBuffer() {
    if (noiseBuf) return noiseBuf;
    const len = ctx.sampleRate;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }

  // A single oscillator note with an exponential decay envelope. `slideTo`
  // optionally sweeps the pitch while the note plays.
  function tone({ type = 'sine', from = 440, slideTo = 0, dur = 0.1, vol = 0.3, delay = 0 }) {
    const ac = ensureCtx();
    if (!ac) return;
    const t0 = ac.currentTime + delay;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(1, from), t0);
    if (slideTo > 0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  // A burst of white noise through a band-pass or low-pass filter, with the
  // filter frequency optionally sweeping down as the burst decays.
  function burst({ dur = 0.1, vol = 0.4, filter = 'bandpass', freq = 1200, sweepTo = 0, q = 0.8, delay = 0 }) {
    const ac = ensureCtx();
    if (!ac) return;
    const t0 = ac.currentTime + delay;
    const src = ac.createBufferSource();
    src.buffer = noiseBuffer();
    src.loop = true;
    const flt = ac.createBiquadFilter();
    flt.type = filter;
    flt.frequency.setValueAtTime(Math.max(10, freq), t0);
    if (sweepTo > 0) flt.frequency.exponentialRampToValueAtTime(Math.max(10, sweepTo), t0 + dur);
    flt.Q.value = q;
    const gain = ac.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(flt);
    flt.connect(gain);
    gain.connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  // A short run of evenly spaced clicks, used by reload() and friends.
  function clicks(count, gap, freq, vol) {
    for (let i = 0; i < count; i++) {
      tone({ type: 'square', from: freq, dur: 0.025, vol, delay: i * gap });
    }
  }

  // A little ascending/descending melody of triangle notes.
  function arpeggio(notes, noteDur, gap, vol) {
    notes.forEach((f, i) => {
      tone({ type: 'triangle', from: f, dur: noteDur, vol, delay: i * gap });
    });
  }

  const api = {
    get muted() {
      return isMuted;
    },

    unlock() {
      ensureCtx();
    },

    toggleMute() {
      isMuted = !isMuted;
      if (master) master.gain.value = isMuted ? 0 : MASTER_LEVEL;
      return isMuted;
    },

    shot(kind) {
      if (kind === 'smg') {
        // Short, bright crack -- high rate of fire, no body to it.
        burst({ dur: 0.06, vol: 0.35, filter: 'highpass', freq: 1800, q: 0.5 });
        tone({ type: 'square', from: 220, slideTo: 90, dur: 0.04, vol: 0.12 });
      } else if (kind === 'shotgun') {
        // The longest and loudest: a wide low boom with a heavy thump.
        burst({ dur: 0.16, vol: 0.6, filter: 'lowpass', freq: 900, sweepTo: 120, q: 0.5 });
        burst({ dur: 0.1, vol: 0.35, filter: 'bandpass', freq: 2500, q: 0.6 });
        tone({ type: 'sine', from: 110, slideTo: 45, dur: 0.16, vol: 0.5 });
      } else if (kind === 'rifle') {
        burst({ dur: 0.11, vol: 0.5, filter: 'bandpass', freq: 1600, sweepTo: 300, q: 0.7 });
        tone({ type: 'sine', from: 140, slideTo: 55, dur: 0.12, vol: 0.4 });
      } else {
        // Pistol default: a snappy mid crack with a modest thump.
        burst({ dur: 0.08, vol: 0.45, filter: 'bandpass', freq: 2000, sweepTo: 400, q: 0.7 });
        tone({ type: 'sine', from: 160, slideTo: 70, dur: 0.09, vol: 0.35 });
      }
    },

    dryFire() {
      tone({ type: 'square', from: 2400, dur: 0.03, vol: 0.15 });
    },

    reload() {
      clicks(3, 0.16, 1400, 0.2);
    },

    hit() {
      tone({ type: 'sine', from: 1900, dur: 0.05, vol: 0.25 });
    },

    kill() {
      tone({ type: 'sine', from: 880, dur: 0.09, vol: 0.3 });
      tone({ type: 'sine', from: 1318, dur: 0.14, vol: 0.3, delay: 0.08 });
    },

    hurt() {
      burst({ dur: 0.12, vol: 0.3, filter: 'lowpass', freq: 500, q: 0.6 });
      tone({ type: 'sawtooth', from: 220, slideTo: 70, dur: 0.15, vol: 0.25 });
    },

    explosion() {
      // Long rumble: low noise sweeping down under a deep sine drop.
      burst({ dur: 0.7, vol: 0.65, filter: 'lowpass', freq: 600, sweepTo: 60, q: 0.5 });
      tone({ type: 'sine', from: 90, slideTo: 28, dur: 0.7, vol: 0.55 });
    },

    flashbang() {
      tone({ type: 'sine', from: 2900, dur: 0.5, vol: 0.18 });
      tone({ type: 'sine', from: 3400, dur: 0.45, vol: 0.12, delay: 0.05 });
    },

    beep() {
      tone({ type: 'square', from: 1050, dur: 0.07, vol: 0.2 });
    },

    plant() {
      tone({ type: 'square', from: 660, dur: 0.09, vol: 0.22 });
      tone({ type: 'square', from: 990, dur: 0.12, vol: 0.22, delay: 0.12 });
    },

    click() {
      tone({ type: 'square', from: 1700, dur: 0.03, vol: 0.15 });
    },

    buy() {
      tone({ type: 'sine', from: 660, dur: 0.09, vol: 0.25 });
      tone({ type: 'sine', from: 880, dur: 0.13, vol: 0.25, delay: 0.09 });
    },

    roundWin() {
      arpeggio([523, 659, 784], 0.16, 0.13, 0.28);
    },

    roundLose() {
      arpeggio([392, 330, 262], 0.16, 0.13, 0.28);
    },

    footstep(now) {
      // Throttled by game time so a sprint does not turn into a buzzsaw.
      if (now - lastStepAt < FOOTSTEP_GAP) return;
      lastStepAt = now;
      burst({ dur: 0.07, vol: 0.12, filter: 'lowpass', freq: 420, q: 0.6 });
    },
  };

  return api;
}
