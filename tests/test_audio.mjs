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

  start(time = 0) {
    this.started.push(time);
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
    this.compressors = [];
    this.resume_count = 0;
    this.close_count = 0;
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
    first_contact: true,
    ball_pin: { contact_count: 1, impulse: 0.8 },
    pin_pin: { contact_count: 0, impulse: 0 },
    deck_impulse: 0,
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
