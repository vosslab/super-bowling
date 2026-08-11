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
  const factory_calls_before_activation = fixture.get_factory_calls();
  audio.activate();
  audio.activate();
  audio.start_roll();
  audio.start_roll();
  audio.stop_roll();
  audio.stop_roll();
  assert.deepEqual(
    {
      factory_calls_before_activation,
      factory_calls_after_activation: fixture.get_factory_calls(),
      rolling_voices: fixture.context.oscillators.length,
      rolling_voice_stops: fixture.context.oscillators[0].stopped.length,
    },
    {
      factory_calls_before_activation: 0,
      factory_calls_after_activation: 1,
      rolling_voices: 1,
      rolling_voice_stops: 1,
    },
  );
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
  const voices_while_muted = fixture.context.oscillators.length;
  audio.set_muted(false);
  audio.play_result("spare");
  assert.equal(voices_while_muted, 1);
  assert.ok(fixture.context.oscillators.length > voices_while_muted);
});
