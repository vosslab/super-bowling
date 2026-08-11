import assert from "node:assert/strict";
import test from "node:test";

import { physics_config } from "../src/config/physics.ts";
import { create_simulation_world } from "../src/simulation/world.ts";

function assert_impact_path(path) {
  assert.ok(path.contact_count > 0, "an emitted path represents at least one physical contact");
  assert.ok(
    path.total_impulse >= path.maximum_impulse,
    "path impulse includes its strongest contact",
  );
  assert.ok(
    Number.isFinite(path.centroid_x),
    "impact centroid has a finite rack-local x coordinate",
  );
  assert.ok(
    Number.isFinite(path.centroid_y),
    "impact centroid has a finite rack-local y coordinate",
  );
}

function assert_fall_transition(fallen) {
  assert.ok(fallen.transition_count > 0, "an emitted fall summary represents a state transition");
  assert.ok(
    fallen.total_speed >= fallen.maximum_speed,
    "fall speed includes its fastest transition",
  );
  assert.ok(
    Number.isFinite(fallen.centroid_x),
    "fall centroid has a finite rack-local x coordinate",
  );
  assert.ok(
    Number.isFinite(fallen.centroid_y),
    "fall centroid has a finite rack-local y coordinate",
  );
}

test("impact windows aggregate physical contacts and clear after they are consumed", async () => {
  const world = await create_simulation_world(10);
  try {
    world.launch(24, -0.22169230769230772, 0, 0);
    let impact_window;
    for (let tick = 0; tick < 180; tick += 1) {
      world.tick(physics_config.fixed_step_seconds * 8);
      impact_window = world.drain_impact_window();
      if (impact_window.ball_pin !== undefined || impact_window.pin_pin !== undefined) break;
    }

    assert.ok(impact_window, "a pocket roll creates a bounded impact window");
    const paths = [impact_window.ball_pin, impact_window.pin_pin].filter(
      (path) => path !== undefined,
    );
    assert.ok(paths.length > 0, "the window contains at least one collision path");
    for (const path of paths) assert_impact_path(path);
    assert.deepEqual(world.drain_impact_window(), {
      ball_pin: undefined,
      pin_pin: undefined,
      fallen: undefined,
    });
  } finally {
    world.dispose();
  }
});

test("launch and next-roll preparation discard an undelivered impact window", async () => {
  const world = await create_simulation_world(10);
  try {
    world.launch(24, -0.22169230769230772, 0, 0);
    for (let tick = 0; tick < 90; tick += 1) {
      world.tick(physics_config.fixed_step_seconds * 8);
    }
    world.prepare_next_roll();
    assert.deepEqual(world.drain_impact_window(), {
      ball_pin: undefined,
      pin_pin: undefined,
      fallen: undefined,
    });
    world.launch(24, -0.22169230769230772, 0, 0);
    assert.deepEqual(world.drain_impact_window(), {
      ball_pin: undefined,
      pin_pin: undefined,
      fallen: undefined,
    });
  } finally {
    world.dispose();
  }
});

test("impact windows publish and clear physically grounded fall transitions", async () => {
  const world = await create_simulation_world(10);
  try {
    world.launch(24, -0.22169230769230772, 0, 0);
    let fallen;
    for (let tick = 0; tick < 180; tick += 1) {
      world.tick(physics_config.fixed_step_seconds * 8);
      const impact_window = world.drain_impact_window();
      if (impact_window.fallen !== undefined) {
        fallen = impact_window.fallen;
        break;
      }
    }
    assert.ok(fallen, "a pocket roll creates a fall-transition presentation summary");
    assert_fall_transition(fallen);
    assert.deepEqual(world.drain_impact_window(), {
      ball_pin: undefined,
      pin_pin: undefined,
      fallen: undefined,
    });
  } finally {
    world.dispose();
  }
});
