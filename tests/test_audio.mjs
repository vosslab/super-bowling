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

class FakeAudioContext {
  constructor() {
    this.currentTime = 2;
    this.destination = new FakeNode();
    this.oscillators = [];
    this.gains = [];
    this.filters = [];
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
  audio.record_collision(6, 0);
  audio.flush_collisions(10);
  audio.play_result("strike");
  assert.equal(fixture.context.oscillators.length, 1);
  assert.equal(fixture.context.oscillators[0].stopped.length, 1);
  audio.set_muted(false);
  audio.start_roll();
  audio.record_collision(6, 100);
  audio.flush_collisions(120);
  audio.play_result("spare");
  assert.equal(fixture.context.oscillators.length, 4);
});

test("clearing mute during an active roll resumes one rolling voice and a fresh collision segment", () => {
  const fixture = create_fake_backend();
  const audio = create_audio_controller(fixture.create_backend);
  audio.activate();
  audio.set_muted(true);
  audio.start_roll();
  audio.set_muted(false);
  audio.set_muted(false);
  assert.equal(fixture.context.oscillators.length, 1);

  audio.record_collision(4, 100);
  audio.flush_collisions(120);
  for (let index = 1; index < 10; index += 1) {
    audio.record_collision(2, 120 + index * 100);
  }
  audio.flush_collisions(1200);

  const collision_oscillator_count = fixture.context.oscillators.length - 1;
  assert.equal(collision_oscillator_count, 8);
  audio.stop_roll();
  assert.equal(fixture.context.oscillators[0].stopped.length, 1);
});

test("collision playback respects the shared eight voice ceiling and disposal is idempotent", () => {
  const fixture = create_fake_backend();
  const audio = create_audio_controller(fixture.create_backend);
  audio.activate();
  audio.start_roll();
  for (let index = 0; index < 12; index += 1) {
    audio.record_collision(3, index * 100);
  }
  audio.flush_collisions(1300);
  const collision_oscillator_count = fixture.context.oscillators.length - 1;
  assert.equal(collision_oscillator_count, 8);
  audio.dispose();
  audio.dispose();
  assert.equal(fixture.context.close_count, 1);
});
