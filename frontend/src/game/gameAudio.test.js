import assert from "node:assert/strict";
import test from "node:test";
import { createGameAudio, GAME_AUDIO_GAINS } from "./gameAudio.js";

function createFakeAudioContext({ state = "running" } = {}) {
  const sources = [];
  const buffers = [];
  const gains = [];
  let closeCount = 0;

  function createParam() {
    const calls = [];
    return {
      calls,
      setValueAtTime(...args) { calls.push(["set", ...args]); },
      linearRampToValueAtTime(...args) { calls.push(["linear", ...args]); },
      exponentialRampToValueAtTime(...args) { calls.push(["exponential", ...args]); },
    };
  }

  function createNode(extra = {}) {
    return {
      connections: [],
      starts: 0,
      stops: 0,
      disconnects: 0,
      connect(destination) { this.connections.push(destination); },
      disconnect() { this.disconnects += 1; this.connections = []; },
      start() { this.starts += 1; },
      stop() { this.stops += 1; },
      ...extra,
    };
  }

  return {
    sources,
    buffers,
    gains,
    destination: {},
    currentTime: 0,
    sampleRate: 44100,
    state,
    get closeCount() { return closeCount; },
    createOscillator() {
      const oscillator = createNode({ frequency: createParam() });
      sources.push(oscillator);
      return oscillator;
    },
    createGain() {
      const gain = createNode({ gain: createParam() });
      gains.push(gain);
      return gain;
    },
    createBufferSource() {
      const source = createNode();
      sources.push(source);
      return source;
    },
    createBuffer(channels, length, sampleRate) {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      const buffer = {
        length,
        sampleRate,
        getChannelData(channel) { return data[channel]; },
      };
      buffers.push(buffer);
      return buffer;
    },
    resume() {
      this.state = "running";
      return Promise.resolve();
    },
    close() {
      closeCount += 1;
      this.state = "closed";
      return Promise.resolve();
    },
  };
}

function playEnabledEffect(name) {
  const context = createFakeAudioContext();
  const audio = createGameAudio({ audioContextFactory: () => context });
  audio.setSoundEffectsEnabled(true);
  assert.equal(audio.playEffect(name), true);
  return { audio, context };
}

test("keeps music and effects independently enabled, muted, and routed through separate gain buses", () => {
  const context = createFakeAudioContext();
  let contextCreations = 0;
  const audio = createGameAudio({
    audioContextFactory() {
      contextCreations += 1;
      return context;
    },
  });

  assert.equal(audio.playEffect("move"), false);
  audio.setBackgroundMusicEnabled(true);
  assert.equal(audio.startMusicFromInteraction(), true);
  const musicSource = context.sources[0];
  assert.equal(audio.startMusicFromInteraction(), false);
  assert.equal(context.sources.filter((source) => source === musicSource).length, 1);

  audio.setSoundEffectsEnabled(true);
  assert.equal(audio.playEffect("move"), true);
  const movement = context.sources[1];
  audio.setSoundEffectsEnabled(false);
  assert.equal(movement.stops, 2);
  assert.equal(musicSource.stops, 0);
  assert.equal(audio.playEffect("apple"), false);

  audio.setSoundEffectsEnabled(true);
  assert.equal(audio.playEffect("apple"), true);
  assert.equal(musicSource.stops, 0);
  audio.setBackgroundMusicEnabled(false);
  assert.equal(musicSource.stops, 1);
  assert.equal(audio.playEffect("button"), true);
  assert.equal(contextCreations, 1);
  assert.deepEqual(
    context.gains.slice(0, 3).map((gain) =>
      gain.gain.calls.find(([operation]) => operation === "set")?.[1]),
    [
      GAME_AUDIO_GAINS.backgroundMusic,
      GAME_AUDIO_GAINS.master,
      GAME_AUDIO_GAINS.soundEffects,
    ],
  );
});

test("generates an original eight-bar chiptune loop with bounded peaks and a smooth seam", () => {
  const context = createFakeAudioContext();
  const audio = createGameAudio({ audioContextFactory: () => context });
  audio.setBackgroundMusicEnabled(true);
  assert.equal(context.buffers.length, 0);
  assert.equal(audio.startMusicFromInteraction(), true);
  assert.equal(context.buffers.length, 1);

  const buffer = context.buffers[0];
  assert.ok(Math.abs(buffer.length / buffer.sampleRate - (60 / 144 * 32)) < 0.001);
  const samples = buffer.getChannelData(0);
  assert.ok(samples.every(Number.isFinite));
  const peakAmplitude = samples.reduce(
    (peak, sample) => Math.max(peak, Math.abs(sample)),
    0,
  );
  assert.ok(peakAmplitude <= 0.781);
  assert.ok(peakAmplitude > 0.7);
  assert.ok(Math.abs(samples[0] - samples.at(-1)) < 0.002);

  const sampleRate = buffer.sampleRate;
  const rms = (start, end) => {
    let squaredTotal = 0;
    for (let index = start; index < end; index += 1) {
      squaredTotal += samples[index] ** 2;
    }
    return Math.sqrt(squaredTotal / (end - start));
  };
  assert.ok(rms(0.1 * sampleRate, 0.5 * sampleRate) > 0.02);
  assert.ok(rms(3 * sampleRate, 3.4 * sampleRate) > 0.02);
  assert.ok(rms(8 * sampleRate, 8.4 * sampleRate) > 0.02);

  let rapidTransitions = 0;
  for (let index = 1; index < sampleRate * 0.2; index += 1) {
    if (Math.sign(samples[index]) !== Math.sign(samples[index - 1])) {
      rapidTransitions += 1;
    }
  }
  assert.ok(rapidTransitions > 40);

  const musicSource = context.sources[0];
  assert.equal(musicSource.loop, true);
  assert.ok(context.gains[0].gain.calls.some(
    ([operation, value]) =>
      operation === "set" && value === GAME_AUDIO_GAINS.backgroundMusic,
  ));
  assert.equal(GAME_AUDIO_GAINS.master, 0.94);
  assert.equal(GAME_AUDIO_GAINS.backgroundMusic, 0.9);
  assert.equal(audio.startMusicFromInteraction(), false);
  assert.equal(context.sources.length, 1);
});

test("uses distinct square and pulse arcade cues at audible independent effect gains", () => {
  const expected = {
    move: { frequency: 660, volume: GAME_AUDIO_GAINS.movement, waveform: "square", notes: 1 },
    apple: { frequency: 659.25, volume: GAME_AUDIO_GAINS.apple, waveform: "square", notes: 3 },
    goldenApple: { frequency: 880, volume: GAME_AUDIO_GAINS.goldenApple, waveform: "pulse", notes: 3 },
    treasure: { frequency: 392, volume: GAME_AUDIO_GAINS.treasure, waveform: "square", notes: 3 },
    efficient: { frequency: 784, volume: GAME_AUDIO_GAINS.efficiency, waveform: "square", notes: 3 },
    complete: { frequency: 523.25, volume: GAME_AUDIO_GAINS.completion, waveform: "square", notes: 5 },
    threeStar: { frequency: 659.25, volume: GAME_AUDIO_GAINS.threeStar, waveform: "square", notes: 6 },
    button: { frequency: 740, volume: GAME_AUDIO_GAINS.button, waveform: "square", notes: 1 },
    pause: { frequency: 587.33, volume: GAME_AUDIO_GAINS.pause, waveform: "square", notes: 2 },
    resume: { frequency: 440, volume: GAME_AUDIO_GAINS.resume, waveform: "pulse", notes: 3 },
    failure: { frequency: 587.33, volume: GAME_AUDIO_GAINS.failure, waveform: "square", notes: 3 },
    retry: { frequency: 392, volume: GAME_AUDIO_GAINS.retry, waveform: "square", notes: 3 },
  };

  for (const [name, cue] of Object.entries(expected)) {
    const { audio, context } = playEnabledEffect(name);
    const oscillator = context.sources[0];
    assert.equal(context.sources.length, cue.notes, `${name} note count`);
    assert.equal(oscillator.frequency.calls[0][1], cue.frequency, `${name} pitch`);
    assert.equal(oscillator.type, cue.waveform, `${name} timbre`);
    const noteGains = context.gains
      .map((gain) => gain.gain.calls.find(
        ([operation]) => operation === "exponential",
      )?.[1])
      .filter((gain) => gain !== undefined);
    assert.equal(noteGains.length, cue.notes, `${name} gain count`);
    assert.ok(noteGains.every((gain) => gain > 0 && gain <= cue.volume), `${name} gain staging`);
    assert.equal(audio.playEffect("unknown"), false);
  }

  assert.equal(GAME_AUDIO_GAINS.soundEffects, 0.96);
  assert.ok(GAME_AUDIO_GAINS.movement > 0.12);
  assert.ok(GAME_AUDIO_GAINS.apple > 0.18);
  assert.ok(GAME_AUDIO_GAINS.completion > 0.18);
});

test("limits movement repetition and prevents effects from accumulating or overlapping", () => {
  const { audio, context } = playEnabledEffect("move");
  assert.equal(audio.playEffect("move"), false);
  assert.equal(audio.playEffect("apple"), true);
  assert.equal(context.sources[0].stops, 2);
  assert.equal(audio.playEffect("complete"), true);
  assert.ok(context.sources.slice(0, 4).every((source) => source.stops === 2));
  assert.equal(context.sources.slice(4).length, 5);
});

test("stops music immediately when muted and restarts one loop after an interaction", () => {
  const context = createFakeAudioContext();
  const audio = createGameAudio({ audioContextFactory: () => context });
  audio.setBackgroundMusicEnabled(true);
  assert.equal(audio.startMusicFromInteraction(), true);
  const firstLoop = context.sources[0];

  audio.setBackgroundMusicEnabled(false);
  assert.equal(firstLoop.stops, 1);
  assert.equal(context.buffers.length, 1);
  assert.equal(audio.startMusicFromInteraction(), false);
  audio.setBackgroundMusicEnabled(true);
  assert.equal(audio.startMusicFromInteraction(), true);
  const secondLoop = context.sources[1];
  assert.equal(context.buffers.length, 1);
  assert.equal(secondLoop.buffer, firstLoop.buffer);
  audio.pauseMusic();
  assert.equal(secondLoop.stops, 1);
  assert.equal(audio.startMusicFromInteraction(), true);
  assert.equal(context.sources.length, 3);
  assert.equal(context.buffers.length, 1);
});

test("resumes a suspended active music context on interaction without creating another loop", () => {
  const context = createFakeAudioContext();
  const audio = createGameAudio({ audioContextFactory: () => context });
  audio.setBackgroundMusicEnabled(true);
  assert.equal(audio.startMusicFromInteraction(), true);
  const loop = context.sources[0];
  context.state = "suspended";

  assert.equal(audio.startMusicFromInteraction(), false);
  assert.equal(context.state, "running");
  assert.equal(context.sources.length, 1);
  assert.equal(loop.stops, 0);
});

test("resumes a suspended context only from explicit playback and handles unsupported audio", () => {
  const suspendedContext = createFakeAudioContext({ state: "suspended" });
  const audio = createGameAudio({ audioContextFactory: () => suspendedContext });
  audio.setBackgroundMusicEnabled(true);
  assert.equal(suspendedContext.sources.length, 0);
  assert.equal(audio.startMusicFromInteraction(), true);
  assert.equal(suspendedContext.state, "running");

  const unavailableAudio = createGameAudio({ audioContextFactory: () => null });
  unavailableAudio.setSoundEffectsEnabled(true);
  unavailableAudio.setBackgroundMusicEnabled(true);
  assert.equal(unavailableAudio.playEffect("failure"), false);
  assert.equal(unavailableAudio.startMusicFromInteraction(), false);
});

test("pauses and disposes loops, effects, and the shared context without duplicates", () => {
  const context = createFakeAudioContext();
  const audio = createGameAudio({ audioContextFactory: () => context });
  audio.setBackgroundMusicEnabled(true);
  audio.startMusicFromInteraction();
  audio.setSoundEffectsEnabled(true);
  audio.playEffect("complete");

  const musicSource = context.sources[0];
  const effectSources = context.sources.slice(1);
  audio.dispose();

  assert.equal(musicSource.stops, 1);
  assert.ok(effectSources.every((source) => source.stops === 2));
  assert.equal(context.closeCount, 1);
  assert.equal(audio.startMusicFromInteraction(), false);
  assert.equal(audio.playEffect("threeStar"), false);
  audio.dispose();
  assert.equal(context.closeCount, 1);
});
