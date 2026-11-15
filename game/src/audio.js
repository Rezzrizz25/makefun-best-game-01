// All sound is synthesized live with WebAudio: short blips for shots, hits,
// pickups and explosions, plus a quiet looping bass-and-arp line for music.
// No audio files, no network. Everything is guarded: in a browser without
// audio (or before the first gesture) every call is a silent no-op.
export function createAudio() {
  let context = null;
  let master = null;
  let musicGain = null;
  let muted = false;
  let musicTimer = null;
  let nextNoteTime = 0;
  let stepIndex = 0;

  // A minor, slow and ember-warm: root A, with a drifting arpeggio.
  const BASS = [110, 110, 130.81, 98];
  const ARP = [220, 261.63, 329.63, 261.63, 220, 329.63, 392, 329.63];
  const STEP_SECONDS = 0.22;

  function ensure() {
    if (context) return true;
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return false;
      context = new Ctor();
      master = context.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(context.destination);
      musicGain = context.createGain();
      musicGain.gain.value = 0.16;
      musicGain.connect(master);
      return true;
    } catch {
      return false;
    }
  }

  /** Call from any user gesture: browsers only let audio start after one. */
  function unlock() {
    if (!ensure()) return;
    if (context.state === 'suspended') context.resume().catch(() => {});
  }

  function tone(freq, dur, type, vol, when = 0, slideTo = 0) {
    if (!ensure() || muted) return;
    try {
      const t0 = context.currentTime + when;
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo > 0) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch {
      // Audio is decoration: never let it break the game.
    }
  }

  function noise(dur, vol, when = 0, lowpass = 1200) {
    if (!ensure() || muted) return;
    try {
      const t0 = context.currentTime + when;
      const len = Math.max(1, Math.floor(context.sampleRate * dur));
      const buffer = context.createBuffer(1, len, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const source = context.createBufferSource();
      source.buffer = buffer;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = lowpass;
      const gain = context.createGain();
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      source.start(t0);
    } catch {
      // See above.
    }
  }

  function scheduleMusic() {
    if (!context) return;
    while (nextNoteTime < context.currentTime + 0.3) {
      const bar = Math.floor(stepIndex / 8) % BASS.length;
      const arpNote = ARP[stepIndex % ARP.length];
      if (stepIndex % 8 === 0) {
        const t0 = nextNoteTime;
        try {
          const osc = context.createOscillator();
          const gain = context.createGain();
          osc.type = 'triangle';
          osc.frequency.value = BASS[bar];
          gain.gain.setValueAtTime(0.5, t0);
          gain.gain.exponentialRampToValueAtTime(0.001, t0 + STEP_SECONDS * 7.5);
          osc.connect(gain);
          gain.connect(musicGain);
          osc.start(t0);
          osc.stop(t0 + STEP_SECONDS * 8);
        } catch {
          // Music is decoration.
        }
      }
      const when = nextNoteTime - context.currentTime;
      tone(arpNote, STEP_SECONDS * 0.9, 'sine', 0.12, Math.max(0, when));
      nextNoteTime += STEP_SECONDS;
      stepIndex += 1;
    }
  }

  function startMusic() {
    if (!ensure() || musicTimer !== null) return;
    unlock();
    nextNoteTime = context.currentTime + 0.1;
    musicTimer = setInterval(scheduleMusic, 120);
  }

  function stopMusic() {
    if (musicTimer !== null) {
      clearInterval(musicTimer);
      musicTimer = null;
    }
  }

  return {
    unlock,
    startMusic,
    stopMusic,
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = muted ? 0 : 0.5;
    },
    isMuted() {
      return muted;
    },
    shoot() {
      tone(720, 0.07, 'square', 0.06, 0, 240);
    },
    hit() {
      noise(0.06, 0.1, 0, 900);
    },
    explode() {
      noise(0.35, 0.22, 0, 700);
      tone(140, 0.3, 'sawtooth', 0.1, 0, 40);
    },
    hurt() {
      tone(180, 0.25, 'sawtooth', 0.16, 0, 60);
      noise(0.15, 0.12, 0, 500);
    },
    gem() {
      tone(880, 0.08, 'sine', 0.09, 0, 1320);
    },
    heart() {
      tone(523.25, 0.12, 'sine', 0.12);
      tone(783.99, 0.18, 'sine', 0.1, 0.09);
    },
    overdrive() {
      tone(440, 0.1, 'square', 0.08, 0, 880);
      tone(660, 0.12, 'square', 0.08, 0.08, 1320);
    },
    waveStart() {
      tone(196, 0.16, 'triangle', 0.14);
      tone(293.66, 0.2, 'triangle', 0.12, 0.12);
    },
    waveClear() {
      tone(523.25, 0.14, 'triangle', 0.12);
      tone(659.25, 0.14, 'triangle', 0.12, 0.1);
      tone(783.99, 0.26, 'triangle', 0.12, 0.2);
    },
    upgrade() {
      tone(659.25, 0.12, 'sine', 0.12);
      tone(987.77, 0.22, 'sine', 0.1, 0.08);
    },
    victory() {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.3, 'triangle', 0.12, i * 0.14));
    },
    gameOver() {
      [392, 311.13, 233.08, 155.56].forEach((f, i) => tone(f, 0.4, 'triangle', 0.12, i * 0.18));
    },
  };
}
