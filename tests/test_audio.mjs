import assert from "node:assert/strict";
import test from "node:test";

import { create_audio_controller } from "../src/audio/audio.ts";

class FakeParam {
  constructor() {
    this.value = 0;
    this.values = [];
  }

  setValueAtTime(value, time) {
    this.value = value;
    this.values.push({ value, time });
  }

  linearRampToValueAtTime(value, time) {
    this.value = value;
    this.values.push({ value, time });
  }
}

class FakeNode {
  constructor() {
    this.connections = [];
    this.disconnected = false;
  }

  connect(destination) {
    this.connections.push(destination);
  }

  disconnect() {
    this.disconnected = true;
  }
}

class FakeOscillator extends FakeNode {
  constructor() {
    super();
    this.frequency = new FakeParam();
    this.type = "sine";
    this.started = [];
    this.stopped = [];
  }

  start(time = 0) {
    this.started.push(time);
  }

  stop(time = 0) {
    this.stopped.push(time);
  }
}

class FakeGain extends FakeNode {
  constructor() {
    super();
    this.gain = new FakeParam();
  }
}

class FakeFilter extends FakeNode {
  constructor() {
    super();
    this.frequency = new FakeParam();
    this.type = "lowpass";
  }
}

class FakeCompressor extends FakeNode {
  constructor() {
    super();
    this.threshold = new FakeParam();
    this.knee = new FakeParam();
    this.ratio = new FakeParam();
    this.attack = new FakeParam();
    this.release = new FakeParam();
  }
}

class FakeBuffer {
  constructor(length) {
    this.samples = new Float32Array(length);
    this.duration = length / 44_100;
  }

  getChannelData() {
    return this.samples;
  }
}

class FakeBufferSource extends FakeNode {
  constructor() {
    super();
    this.buffer = null;
    this.loop = false;
    this.started = [];
    this.stopped = [];
  }

  start(time = 0, offset = 0, duration) {
    this.started.push({ time, offset, duration });
  }

  stop(time = 0) {
    this.stopped.push(time);
  }
}

class FakeAudioContext {
  constructor() {
    this.currentTime = 2;
    this.destination = new FakeNode();
    this.sampleRate = 44_100;
    this.oscillators = [];
    this.buffer_sources = [];
    this.gains = [];
    this.filters = [];
    this.panners = [];
    this.compressors = [];
    this.resume_count = 0;
    this.close_count = 0;
    this.decode_count = 0;
  }

  async resume() {
    this.resume_count += 1;
  }

  async close() {
    this.close_count += 1;
  }

  createOscillator() {
    const oscillator = new FakeOscillator();
    this.oscillators.push(oscillator);
    return oscillator;
  }

  createGain() {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain;
  }

  createStereoPanner() {
    const panner = new FakeNode();
    panner.pan = new FakeParam();
    this.panners.push(panner);
    return panner;
  }

  createBiquadFilter() {
    const filter = new FakeFilter();
    this.filters.push(filter);
    return filter;
  }

  createDynamicsCompressor() {
    const compressor = new FakeCompressor();
    this.compressors.push(compressor);
    return compressor;
  }

  createBuffer(channel_count, length) {
    return new FakeBuffer(length);
  }

  createBufferSource() {
    const source = new FakeBufferSource();
    this.buffer_sources.push(source);
    return source;
  }

  async decodeAudioData() {
    this.decode_count += 1;
    return new FakeBuffer(44_100);
  }
}

function create_fake_backend() {
  const context = new FakeAudioContext();
  let factory_calls = 0;
  function create_backend() {
    factory_calls += 1;
    return context;
  }
  return { context, create_backend, get_factory_calls: () => factory_calls };
}

test("audio context starts only through activation and accepts an idempotent roll lifecycle", () => {
  const fixture = create_fake_backend();
  const audio = create_audio_controller(fixture.create_backend);
  audio.start_roll();
  const factory_calls_before_activation = fixture.get_factory_calls();
  audio.activate();
  audio.activate();
  audio.start_roll();
  audio.start_roll();
  audio.stop_roll();
  audio.stop_roll();
  assert.equal(factory_calls_before_activation, 0);
  assert.equal(fixture.get_factory_calls(), 1);
});

test("preload fetches local samples before activation without constructing an audio context", async () => {
  const fixture = create_fake_backend();
  const original_fetch = globalThis.fetch;
  let fetch_started = 0;
  globalThis.fetch = async () => {
    fetch_started += 1;
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(1) };
  };
  try {
    const audio = create_audio_controller(fixture.create_backend);
    audio.preload();
    assert.equal(fixture.get_factory_calls(), 0);
    assert.ok(fetch_started > 0, "preload starts local sample requests");
    audio.activate();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(fixture.get_factory_calls(), 1);
    assert.ok(fixture.context.decode_count > 0, "activation decodes preloaded bytes");
  } finally {
    globalThis.fetch = original_fetch;
  }
});

test("mute immediately stops the rolling voice and gates collision and result voices", () => {
  const fixture = create_fake_backend();
  const audio = create_audio_controller(fixture.create_backend);
  audio.activate();
  audio.start_roll();
  audio.set_muted(true);
  const starts_before_muted_cues =
    fixture.context.oscillators.flatMap((voice) => voice.started).length +
    fixture.context.buffer_sources.flatMap((source) => source.started).length;
  audio.record_impact({
    source_simulation_time_ms: 100,
    first_contact: true,
    ball_pin: { contact_count: 1, impulse: 0.8, pan: 0 },
    pin_pin: { contact_count: 0, impulse: 0, pan: 0 },
    deck: { contact_count: 0, impulse: 0, pan: 0 },
  });
  audio.play_result("strike");
  const starts_after_muted_cues =
    fixture.context.oscillators.flatMap((voice) => voice.started).length +
    fixture.context.buffer_sources.flatMap((source) => source.started).length;
  audio.set_muted(false);
  audio.play_result("spare");
  const starts_after_unmute =
    fixture.context.oscillators.flatMap((voice) => voice.started).length +
    fixture.context.buffer_sources.flatMap((source) => source.started).length;
  assert.equal(starts_after_muted_cues, starts_before_muted_cues);
  assert.ok(starts_after_unmute > starts_after_muted_cues);
});

test("directed collision voices overlap safely, preserve signed pans, duck only body, and clean up", async () => {
  const fixture = create_fake_backend();
  const original_fetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
  try {
    const audio = create_audio_controller(fixture.create_backend);
    audio.preload();
    audio.activate();
    await new Promise((resolve) => setImmediate(resolve));
    audio.start_roll();
    audio.record_impact({
      source_simulation_time_ms: 100,
      first_contact: true,
      ball_pin: { contact_count: 5, impulse: 0.8, pan: -0.5 },
      pin_pin: { contact_count: 3, impulse: 0.6, pan: 0.4 },
      deck: { contact_count: 1, impulse: 0.3, pan: 0.1 },
    });
    const collision_sources = fixture.context.buffer_sources.filter((source) => !source.loop);
    assert.ok(collision_sources.length >= 1);
    const starts = collision_sources.flatMap((source) =>
      source.started.map((start) => ({ ...start, source })),
    );
    assert.ok(
      starts.every(
        ({ time, offset, duration, source }) =>
          time >= fixture.context.currentTime &&
          offset >= 0 &&
          duration > 0 &&
          offset + duration <= source.buffer.duration,
      ),
    );
    assert.ok(
      starts.some((left, index) =>
        starts.slice(index + 1).some((right) => Math.abs(right.time - left.time) < left.duration),
      ),
    );
    const pans = fixture.context.panners.flatMap((panner) =>
      panner.pan.values.map(({ value }) => value),
    );
    assert.ok(pans.some((pan) => pan < 0) && pans.some((pan) => pan > 0));
    assert.ok(
      fixture.context.gains.some((gain) => {
        const values = gain.gain.values.map(({ value }) => value);
        return values.includes(0.18) && values.includes(0.52);
      }),
      "attack onset ducks the independent body route",
    );
    for (let index = 1; index <= 10; index += 1) {
      audio.record_impact({
        source_simulation_time_ms: 100 + index * 50,
        first_contact: false,
        ball_pin: { contact_count: 0, impulse: 0, pan: 0 },
        pin_pin: { contact_count: 3, impulse: 0.5, pan: index % 2 ? -0.4 : 0.5 },
        deck: { contact_count: 0, impulse: 0, pan: 0 },
      });
    }
    assert.ok(
      fixture.context.buffer_sources.filter((source) => !source.loop).length <= 4,
      "the controller never admits more live collision sources than its public cap",
    );
    fixture.context.currentTime += 1;
    audio.record_impact({
      source_simulation_time_ms: 1_000,
      first_contact: false,
      ball_pin: { contact_count: 0, impulse: 0, pan: 0 },
      pin_pin: { contact_count: 1, impulse: 0.4, pan: 0.7 },
      deck: { contact_count: 0, impulse: 0, pan: 0 },
    });
    assert.ok(collision_sources.every((source) => source.stopped.length > 0));
    assert.ok(collision_sources.every((source) => source.disconnected));
    audio.set_muted(true);
    assert.ok(
      fixture.context.buffer_sources
        .filter((source) => !source.loop)
        .every((source) => source.stopped.length > 0 && source.disconnected),
    );
    audio.dispose();
    assert.equal(fixture.context.close_count, 1);
  } finally {
    globalThis.fetch = original_fetch;
  }
});
