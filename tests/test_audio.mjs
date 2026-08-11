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

class FakeAudioBuffer {
  constructor(length) {
    this.samples = new Float32Array(length);
  }

  getChannelData(channel) {
    assert.equal(channel, 0);
    return this.samples;
  }
}

class FakeBufferSource extends FakeNode {
  constructor() {
    super();
    this.buffer = null;
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
    this.sampleRate = 48000;
    this.destination = new FakeNode();
    this.oscillators = [];
    this.gains = [];
    this.filters = [];
    this.buffers = [];
    this.buffer_sources = [];
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

  createBuffer(channel_count, length, sample_rate) {
    assert.equal(channel_count, 1);
    assert.equal(sample_rate, this.sampleRate);
    const buffer = new FakeAudioBuffer(length);
    this.buffers.push(buffer);
    return buffer;
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

test("audio context starts only through activate and rolling voice has idempotent ownership", () => {
  const fixture = create_fake_backend();
  const audio = create_audio_controller(fixture.create_backend);
  audio.start_roll();
  assert.equal(fixture.get_factory_calls(), 0);
  audio.activate();
  audio.activate();
  assert.equal(fixture.get_factory_calls(), 1);
  assert.equal(fixture.context.resume_count, 2);
  audio.start_roll();
  audio.start_roll();
  assert.equal(fixture.context.oscillators.length, 1);
  audio.stop_roll();
  audio.stop_roll();
  assert.equal(fixture.context.oscillators[0].stopped.length, 1);
});

test("mute immediately stops the rolling voice and gates collision and result voices", () => {
  const fixture = create_fake_backend();
  const audio = create_audio_controller(fixture.create_backend);
  audio.activate();
  audio.start_roll();
  audio.set_muted(true);
  audio.record_impact({
    first_contact: true,
    ball_pin: { contact_count: 1, impulse: 0.8 },
    pin_pin: { contact_count: 0, impulse: 0 },
    deck_impulse: 0,
  });
  audio.play_result("strike");
  assert.equal(fixture.context.oscillators.length, 1);
  assert.equal(fixture.context.oscillators[0].stopped.length, 1);
  audio.set_muted(false);
  audio.start_roll();
  audio.record_impact({
    first_contact: false,
    ball_pin: { contact_count: 0, impulse: 0 },
    pin_pin: { contact_count: 6, impulse: 0.6 },
    deck_impulse: 0.2,
  });
  audio.play_result("spare");
  assert.equal(fixture.context.oscillators.length, 4);
});

test("clearing mute during an active roll resumes one rolling voice", () => {
  const fixture = create_fake_backend();
  const audio = create_audio_controller(fixture.create_backend);
  audio.activate();
  audio.set_muted(true);
  audio.start_roll();
  audio.set_muted(false);
  audio.set_muted(false);
  assert.equal(fixture.context.oscillators.length, 1);

  audio.stop_roll();
  assert.equal(fixture.context.oscillators[0].stopped.length, 1);
});

test("temporally separated physical cascade windows remain audible and disposal is idempotent", () => {
  const fixture = create_fake_backend();
  const audio = create_audio_controller(fixture.create_backend);
  audio.activate();
  audio.start_roll();
  for (let index = 0; index < 12; index += 1) {
    fixture.context.currentTime += 0.12;
    audio.record_impact({
      first_contact: false,
      ball_pin: { contact_count: 0, impulse: 0 },
      pin_pin: { contact_count: 3, impulse: 0.4 },
      deck_impulse: 0.1,
    });
  }
  const collision_oscillator_count = fixture.context.oscillators.length - 1;
  assert.equal(collision_oscillator_count, 12);
  audio.dispose();
  audio.dispose();
  assert.equal(fixture.context.close_count, 1);
});

test("physical cues make a distinct first-contact crack and bounded clatter layers", () => {
  const fixture = create_fake_backend();
  const audio = create_audio_controller(fixture.create_backend);
  audio.activate();
  audio.start_roll();
  audio.record_impact({
    first_contact: true,
    ball_pin: { contact_count: 1, impulse: 0.8 },
    pin_pin: { contact_count: 0, impulse: 0 },
    deck_impulse: 0.2,
  });
  const first_contact_sources = fixture.context.buffer_sources.length;
  const first_contact_oscillators = fixture.context.oscillators.length;
  audio.record_impact({
    first_contact: false,
    ball_pin: { contact_count: 0, impulse: 0 },
    pin_pin: { contact_count: 6, impulse: 0.6 },
    deck_impulse: 0,
  });
  assert.equal(first_contact_sources, 2);
  assert.equal(first_contact_oscillators, 3);
  assert.equal(fixture.context.buffer_sources.length, 3);
  assert.equal(fixture.context.oscillators.length, 3);
  assert.equal(fixture.context.buffers.length, 1);
});

test("semantic collision cues cap overlapping chatter while reserving room for first contact", () => {
  const fixture = create_fake_backend();
  const audio = create_audio_controller(fixture.create_backend);
  audio.activate();
  audio.start_roll();
  audio.set_muted(true);
  audio.record_impact({
    first_contact: true,
    ball_pin: { contact_count: 1, impulse: 1 },
    pin_pin: { contact_count: 1, impulse: 1 },
    deck_impulse: 1,
  });
  assert.equal(fixture.context.buffer_sources.length, 0);
  audio.set_muted(false);
  for (let index = 0; index < 12; index += 1) {
    audio.record_impact({
      first_contact: false,
      ball_pin: { contact_count: 1, impulse: 0.5 },
      pin_pin: { contact_count: 2, impulse: 0.4 },
      deck_impulse: 0.2,
    });
  }
  assert.equal(fixture.context.buffer_sources.length, 3);
  audio.record_impact({
    first_contact: true,
    ball_pin: { contact_count: 1, impulse: 1 },
    pin_pin: { contact_count: 0, impulse: 0 },
    deck_impulse: 0,
  });
  assert.equal(fixture.context.buffer_sources.length, 5);
  assert.equal(fixture.context.oscillators.length, 6);
  audio.set_muted(true);
  assert.ok(fixture.context.buffer_sources.every((source) => source.stopped.length > 0));
});

test("roll-speed updates stay normalized and first contact ducks the rolling texture", () => {
  const fixture = create_fake_backend();
  const audio = create_audio_controller(fixture.create_backend);
  audio.activate();
  audio.update_roll_speed(Number.NaN);
  audio.start_roll();
  const rolling_oscillator = fixture.context.oscillators[0];
  const rolling_filter = fixture.context.filters[0];
  const rolling_gain = fixture.context.gains[0];
  assert.equal(rolling_oscillator.frequency.value, 62);
  assert.equal(rolling_filter.frequency.value, 210);
  assert.equal(rolling_gain.gain.value, 0.009);
  audio.update_roll_speed(4);
  assert.equal(rolling_oscillator.frequency.value, 114);
  assert.equal(rolling_filter.frequency.value, 570);
  assert.equal(rolling_gain.gain.value, 0.023);
  audio.record_impact({
    first_contact: true,
    ball_pin: { contact_count: 1, impulse: 0.8 },
    pin_pin: { contact_count: 0, impulse: 0 },
    deck_impulse: 0,
  });
  assert.ok(rolling_gain.gain.values.some(({ value }) => value === 0.002));
  assert.equal(rolling_gain.gain.value, 0.023);
  audio.set_muted(true);
  assert.equal(rolling_oscillator.stopped.length, 1);
  assert.equal(fixture.context.buffer_sources.length, 2);
});
