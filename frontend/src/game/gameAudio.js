function createBrowserAudioContext() {
  const AudioContextConstructor =
    globalThis.AudioContext || globalThis.webkitAudioContext;
  return typeof AudioContextConstructor === "function"
    ? new AudioContextConstructor()
    : null;
}

const BPM = 144;
const BEAT_SECONDS = 60 / BPM;
const BARS = 8;
const MUSIC_DURATION = BEAT_SECONDS * 4 * BARS;
const MAX_ACTIVE_EFFECT_VOICES = 8;

const melody = [
  [72, null, 76, 79, null, 76, 74, null],
  [72, null, 76, 81, 79, null, 76, null],
  [74, null, 79, 83, null, 79, 76, null],
  [71, null, 74, 79, null, 74, 71, null],
  [72, null, 76, 79, null, 76, 84, 83],
  [81, null, 79, 76, 74, null, 76, null],
  [79, null, 76, 74, null, 71, 74, null],
  [72, null, null, 76, 72, null, null, null],
];

const chordTones = [
  [60, 64, 67, 64],
  [57, 60, 64, 60],
  [53, 57, 60, 57],
  [55, 59, 62, 59],
  [60, 64, 67, 64],
  [53, 57, 60, 57],
  [57, 60, 64, 60],
  [55, 59, 62, 59],
];

const bassRoots = [36, 33, 41, 43, 36, 41, 33, 43];

function midiFrequency(note) {
  return 440 * 2 ** ((note - 69) / 12);
}

function createMusicBuffer(context) {
  const sampleRate = Math.min(context.sampleRate || 44100, 22050);
  const sampleCount = Math.floor(sampleRate * MUSIC_DURATION);
  const buffer = context.createBuffer(1, sampleCount, sampleRate);
  const samples = buffer.getChannelData(0);
  const noise = new Float32Array(sampleCount);
  let noiseState = 0x7f4a7c15;

  for (let index = 0; index < sampleCount; index += 1) {
    noiseState ^= noiseState << 13;
    noiseState ^= noiseState >>> 17;
    noiseState ^= noiseState << 5;
    noise[index] = (noiseState >>> 0) / 0xffffffff * 2 - 1;
  }

  function addTone(startTime, duration, frequency, waveform, volume, decay = 0) {
    const firstSample = Math.max(0, Math.floor(startTime * sampleRate));
    const lastSample = Math.min(sampleCount, Math.ceil((startTime + duration) * sampleRate));
    const duty = waveform === "pulse" ? 0.25 : 0.5;

    for (let index = firstSample; index < lastSample; index += 1) {
      const elapsed = index / sampleRate - startTime;
      const phase = ((elapsed * frequency) % 1 + 1) % 1;
      const wave = phase < duty ? 1 - duty : -duty;
      const attack = Math.min(1, elapsed / 0.006);
      const release = Math.min(1, (duration - elapsed) / 0.018);
      samples[index] += wave * volume * attack * release * Math.exp(-elapsed * decay);
    }
  }

  function addKick(startTime) {
    const duration = 0.13;
    const firstSample = Math.floor(startTime * sampleRate);
    const lastSample = Math.min(sampleCount, Math.ceil((startTime + duration) * sampleRate));

    for (let index = firstSample; index < lastSample; index += 1) {
      const elapsed = index / sampleRate - startTime;
      const progress = elapsed / duration;
      const frequency = 112 - 62 * progress;
      const phase = ((elapsed * frequency) % 1 + 1) % 1;
      const triangle = 1 - 4 * Math.abs(phase - 0.5);
      samples[index] += triangle * Math.exp(-elapsed * 27) * 0.25;
    }
  }

  function addNoiseHit(startTime, duration, volume, highPass = false) {
    const firstSample = Math.floor(startTime * sampleRate);
    const lastSample = Math.min(sampleCount, Math.ceil((startTime + duration) * sampleRate));

    for (let index = firstSample; index < lastSample; index += 1) {
      const elapsed = index / sampleRate - startTime;
      const sample = highPass
        ? (noise[index] - noise[Math.max(0, index - 1)]) * 0.55
        : noise[index];
      samples[index] += sample * Math.exp(-elapsed * (highPass ? 48 : 34)) * volume;
    }
  }

  for (let bar = 0; bar < BARS; bar += 1) {
    const barStart = bar * BEAT_SECONDS * 4;

    for (let beat = 0; beat < 4; beat += 1) {
      const time = barStart + beat * BEAT_SECONDS;
      const root = bassRoots[bar];
      const bass = beat % 2 === 0 ? root : root + 7;
      addTone(time, BEAT_SECONDS * 0.83, midiFrequency(bass), "triangle", 0.2, 1.8);

      if (beat % 2 === 0) addKick(time);
      else addNoiseHit(time, 0.11, 0.105, true);
    }

    for (let eighth = 0; eighth < 8; eighth += 1) {
      const time = barStart + eighth * BEAT_SECONDS / 2;
      const note = melody[bar][eighth];
      if (note !== null) {
        addTone(
          time,
          BEAT_SECONDS * 0.39,
          midiFrequency(note),
          bar % 2 === 0 ? "square" : "pulse",
          0.2,
          0.9,
        );
      }

      addNoiseHit(time, 0.032, eighth % 2 === 0 ? 0.035 : 0.022, true);
    }

    for (let sixteenth = 0; sixteenth < 16; sixteenth += 1) {
      const note = chordTones[bar][sixteenth % 4];
      addTone(
        barStart + sixteenth * BEAT_SECONDS / 4,
        BEAT_SECONDS * 0.19,
        midiFrequency(note),
        "pulse",
        0.055,
        2.8,
      );
    }
  }

  const fadeLength = Math.floor(sampleRate * 0.012);
  for (let index = 0; index < fadeLength; index += 1) {
    const fade = index / fadeLength;
    samples[index] *= fade;
    samples[sampleCount - index - 1] *= fade;
  }

  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  const normalization = peak > 0 ? 0.78 / peak : 1;
  for (let index = 0; index < sampleCount; index += 1) {
    samples[index] *= normalization;
  }

  return buffer;
}

const effects = {
  move: {
    notes: [{ frequency: 660, endFrequency: 880, offset: 0, waveform: "square" }],
    duration: 0.055,
    volume: 0.16,
    cooldown: 0.09,
  },
  apple: {
    notes: [
      { frequency: 659.25, offset: 0, waveform: "square" },
      { frequency: 783.99, offset: 0.065, waveform: "square" },
      { frequency: 987.77, offset: 0.13, waveform: "pulse" },
    ],
    duration: 0.13,
    volume: 0.22,
  },
  goldenApple: {
    notes: [
      { frequency: 880, offset: 0, waveform: "pulse" },
      { frequency: 1174.66, offset: 0.07, waveform: "square" },
      { frequency: 1567.98, offset: 0.14, waveform: "pulse" },
    ],
    duration: 0.15,
    volume: 0.23,
  },
  treasure: {
    notes: [
      { frequency: 392, offset: 0, waveform: "square" },
      { frequency: 523.25, offset: 0.08, waveform: "pulse" },
      { frequency: 659.25, offset: 0.16, waveform: "square" },
    ],
    duration: 0.18,
    volume: 0.21,
  },
  efficient: {
    notes: [
      { frequency: 784, offset: 0, waveform: "square" },
      { frequency: 987.77, offset: 0.08, waveform: "pulse" },
      { frequency: 1174.66, offset: 0.16, waveform: "square" },
    ],
    duration: 0.16,
    volume: 0.21,
  },
  complete: {
    notes: [
      { frequency: 523.25, offset: 0, waveform: "square" },
      { frequency: 659.25, offset: 0.09, waveform: "square" },
      { frequency: 783.99, offset: 0.18, waveform: "pulse" },
      { frequency: 1046.5, offset: 0.27, waveform: "square" },
      { frequency: 1318.51, offset: 0.36, waveform: "pulse" },
    ],
    duration: 0.19,
    volume: 0.23,
  },
  threeStar: {
    notes: [
      { frequency: 659.25, offset: 0, waveform: "square" },
      { frequency: 783.99, offset: 0.09, waveform: "pulse" },
      { frequency: 987.77, offset: 0.18, waveform: "square" },
      { frequency: 1174.66, offset: 0.27, waveform: "pulse" },
      { frequency: 1318.51, offset: 0.36, waveform: "square" },
      { frequency: 1567.98, offset: 0.45, waveform: "pulse" },
    ],
    duration: 0.24,
    volume: 0.22,
  },
  button: {
    notes: [{ frequency: 740, endFrequency: 590, offset: 0, waveform: "square" }],
    duration: 0.045,
    volume: 0.13,
    cooldown: 0.07,
  },
  pause: {
    notes: [
      { frequency: 587.33, offset: 0, waveform: "square" },
      { frequency: 440, offset: 0.07, waveform: "pulse" },
    ],
    duration: 0.12,
    volume: 0.17,
  },
  resume: {
    notes: [
      { frequency: 440, offset: 0, waveform: "pulse" },
      { frequency: 587.33, offset: 0.07, waveform: "square" },
      { frequency: 880, offset: 0.14, waveform: "square" },
    ],
    duration: 0.15,
    volume: 0.18,
  },
  failure: {
    notes: [
      { frequency: 587.33, endFrequency: 392, offset: 0, waveform: "square" },
      { frequency: 392, endFrequency: 261.63, offset: 0.09, waveform: "pulse" },
      { frequency: 261.63, endFrequency: 164.81, offset: 0.18, waveform: "square" },
    ],
    duration: 0.2,
    volume: 0.2,
  },
  retry: {
    notes: [
      { frequency: 392, offset: 0, waveform: "square" },
      { frequency: 523.25, offset: 0.06, waveform: "pulse" },
      { frequency: 783.99, offset: 0.12, waveform: "square" },
    ],
    duration: 0.13,
    volume: 0.18,
  },
};

export const GAME_AUDIO_GAINS = Object.freeze({
  master: 0.94,
  backgroundMusic: 0.9,
  soundEffects: 0.96,
  movement: effects.move.volume,
  apple: effects.apple.volume,
  goldenApple: effects.goldenApple.volume,
  treasure: effects.treasure.volume,
  efficiency: effects.efficient.volume,
  completion: effects.complete.volume,
  threeStar: effects.threeStar.volume,
  button: effects.button.volume,
  pause: effects.pause.volume,
  resume: effects.resume.volume,
  failure: effects.failure.volume,
  retry: effects.retry.volume,
});

export function createGameAudio({ audioContextFactory = createBrowserAudioContext } = {}) {
  let context = null;
  let masterBus = null;
  let musicBus = null;
  let soundEffectsBus = null;
  let soundEffectsEnabled = false;
  let backgroundMusicEnabled = false;
  let musicBuffer = null;
  let musicSource = null;
  let lastEffectAt = new Map();
  const activeEffects = new Set();

  function getContext() {
    if (context) return context;
    try {
      context = audioContextFactory();
    } catch {
      return null;
    }
    return context;
  }

  function resumeContext(audioContext) {
    if (audioContext.state !== "suspended") return;
    try {
      audioContext.resume()?.catch?.(() => {});
    } catch {
      return;
    }
  }

  function getMasterBus(audioContext) {
    if (masterBus) return masterBus;
    const bus = audioContext.createGain();
    bus.gain.setValueAtTime(GAME_AUDIO_GAINS.master, audioContext.currentTime);
    bus.connect(audioContext.destination);
    masterBus = bus;
    return bus;
  }

  function getMusicBus(audioContext) {
    if (musicBus) return musicBus;
    const bus = audioContext.createGain();
    bus.gain.setValueAtTime(
      GAME_AUDIO_GAINS.backgroundMusic,
      audioContext.currentTime,
    );
    bus.connect(getMasterBus(audioContext));
    musicBus = bus;
    return bus;
  }

  function getSoundEffectsBus(audioContext) {
    if (soundEffectsBus) return soundEffectsBus;
    const bus = audioContext.createGain();
    bus.gain.setValueAtTime(
      GAME_AUDIO_GAINS.soundEffects,
      audioContext.currentTime,
    );
    bus.connect(getMasterBus(audioContext));
    soundEffectsBus = bus;
    return bus;
  }

  function stopEffects() {
    for (const voice of activeEffects) {
      for (const oscillator of voice.oscillators) {
        oscillator.onended = null;
        try {
          oscillator.stop();
        } catch {
          // A scheduled voice may have ended before its cleanup callback ran.
        }
        oscillator.disconnect();
      }
      for (const gain of voice.gains) gain.disconnect();
    }
    activeEffects.clear();
  }

  function stopMusic() {
    if (!musicSource) return;
    const source = musicSource;
    musicSource = null;
    source.onended = null;
    try {
      source.stop();
    } catch {
      // The loop may already have stopped as the context was suspended.
    }
    source.disconnect();
  }

  function playTone(
    audioContext,
    destination,
    tone,
    startTime,
    duration,
    volume,
    voice,
  ) {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const start = startTime + tone.offset;
    const end = start + duration;
    oscillator.type = tone.waveform || "triangle";
    oscillator.frequency.setValueAtTime(tone.frequency, start);
    if (tone.endFrequency) {
      oscillator.frequency.linearRampToValueAtTime(tone.endFrequency, end);
    }
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(
      volume,
      start + Math.min(0.008, duration / 3),
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    oscillator.connect(gain);
    gain.connect(destination);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
      voice.remaining -= 1;
      if (voice.remaining === 0) activeEffects.delete(voice);
    };
    voice.oscillators.push(oscillator);
    voice.gains.push(gain);
    voice.remaining += 1;
    oscillator.start(start);
    oscillator.stop(end + 0.015);
  }

  return {
    setSoundEffectsEnabled(enabled) {
      soundEffectsEnabled = Boolean(enabled);
      if (!soundEffectsEnabled) stopEffects();
    },
    setBackgroundMusicEnabled(enabled) {
      backgroundMusicEnabled = Boolean(enabled);
      if (!backgroundMusicEnabled) stopMusic();
    },
    playEffect(name) {
      const effect = effects[name];
      if (!soundEffectsEnabled || !effect) return false;
      const audioContext = getContext();
      if (!audioContext) return false;

      const now = audioContext.currentTime;
      const lastAt = lastEffectAt.get(name) ?? Number.NEGATIVE_INFINITY;
      if (effect.cooldown && now - lastAt < effect.cooldown) return false;
      if (name === "move") {
        for (const activeVoice of activeEffects) {
          if (activeVoice.name === "move") return false;
        }
      } else {
        stopEffects();
      }
      if (activeEffects.size >= MAX_ACTIVE_EFFECT_VOICES) return false;

      resumeContext(audioContext);
      const voice = { name, oscillators: [], gains: [], remaining: 0 };
      activeEffects.add(voice);
      lastEffectAt.set(name, now);
      const destination = getSoundEffectsBus(audioContext);
      const maxConcurrentNotes = effect.notes.reduce((maximum, note) => {
        const concurrentNotes = effect.notes.filter((other) =>
          other.offset < note.offset + effect.duration &&
          other.offset + effect.duration > note.offset,
        ).length;
        return Math.max(maximum, concurrentNotes);
      }, 1);
      for (const note of effect.notes) {
        playTone(
          audioContext,
          destination,
          note,
          now,
          effect.duration,
          effect.volume / maxConcurrentNotes,
          voice,
        );
      }
      return true;
    },
    startMusicFromInteraction() {
      if (!backgroundMusicEnabled) return false;
      const audioContext = getContext();
      if (!audioContext) return false;
      resumeContext(audioContext);
      if (musicSource) return false;
      let source;
      try {
        musicBuffer ??= createMusicBuffer(audioContext);
        source = audioContext.createBufferSource();
        source.buffer = musicBuffer;
        source.loop = true;
        source.connect(getMusicBus(audioContext));
        source.onended = () => {
          if (musicSource === source) musicSource = null;
        };
        source.start();
        musicSource = source;
        return true;
      } catch {
        source?.disconnect();
        return false;
      }
    },
    pauseMusic() {
      stopMusic();
    },
    dispose() {
      stopEffects();
      stopMusic();
      soundEffectsBus?.disconnect();
      musicBus?.disconnect();
      masterBus?.disconnect();
      soundEffectsBus = null;
      musicBus = null;
      masterBus = null;
      backgroundMusicEnabled = false;
      soundEffectsEnabled = false;
      musicBuffer = null;
      lastEffectAt = new Map();
      if (context) {
        const audioContext = context;
        context = null;
        try {
          audioContext.close()?.catch?.(() => {});
        } catch {
          return;
        }
      }
    },
  };
}

export const gameAudio = createGameAudio();
