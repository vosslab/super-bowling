import assert from "node:assert/strict";
import test from "node:test";

import { create_pin_id } from "../src/brands.ts";
import { benchmark_fixtures } from "../src/config/benchmark_fixtures.ts";
import { get_rack_pin_count, supported_pin_counts } from "../src/config/pin_counts.ts";
import {
  get_ball_mass_lb,
  get_mode_tuning,
  physics_config,
  rack_ball_mass_lb,
} from "../src/config/physics.ts";
import { fallen_pin_length } from "../src/config/lane.ts";
import { find_nearby_pin_ids, create_activation_index } from "../src/simulation/activation.ts";
import { get_benchmark_validation_failures } from "../src/simulation/benchmark.ts";
import {
  ball_snapshot_stride,
  ball_snapshot_in_pit_flag_offset,
  pin_snapshot_stride,
  read_snapshot_pin,
  snapshot_fallen_axis_angle_offset,
  snapshot_in_pit_flag_offset,
  snapshot_removed_flag_offset,
  snapshot_state_flag_offset,
  snapshot_velocity_x_offset,
} from "../src/simulation/protocol.ts";
import { create_rack } from "../src/simulation/rack.ts";
import { create_simulation_world } from "../src/simulation/world.ts";
import { create_draw_commands } from "../src/render/benchmark_renderer.ts";

async function run_centered_roll(mode, power) {
  const world = await create_simulation_world(get_rack_pin_count(mode));
  const head_pin = world.rack.slots[0];
  assert.ok(head_pin);
  world.launch(power, 0, 0, 0);
  let head_contact_step;
  let terminal = false;
  let fallen_pin_count = 0;
  for (let step = 1; step <= 3_600 && !terminal; step += 1) {
    const result = world.step_fixed();
    const head_velocity = world.get_pin_velocity(head_pin.pin_id);
    if (head_contact_step === undefined && Math.hypot(head_velocity.x, head_velocity.y) > 0.01) {
      head_contact_step = step;
    }
    fallen_pin_count = world.get_counts().fallen_pin_count;
    terminal = result.settled || result.timed_out;
    if (head_contact_step !== undefined && fallen_pin_count >= 1) break;
  }
  world.dispose();
  return { terminal, head_contact_step, fallen_pin_count };
}

test("creates exact deterministic racks with unique ids and containing bounds", () => {
  for (const pin_count of supported_pin_counts) {
    const rack_pin_count = get_rack_pin_count(pin_count);
    const rack = create_rack(rack_pin_count);
    assert.equal(rack.slots.length, rack_pin_count);
    assert.equal(new Set(rack.slots.map((slot) => slot.pin_id)).size, rack_pin_count);
    assert.ok(
      rack.slots.every((slot) => slot.x >= rack.bounds.min_x && slot.x <= rack.bounds.max_x),
    );
  }
});

test("builds every supported rack from one centered head pin into centered triangular rows", () => {
  for (const pin_count of supported_pin_counts) {
    const rack_pin_count = get_rack_pin_count(pin_count);
    const rack = create_rack(rack_pin_count);
    const rows = new Map();
    for (const slot of rack.slots) {
      const row = rows.get(slot.row_index) ?? [];
      row.push(slot);
      rows.set(slot.row_index, row);
    }
    assert.equal(rack.slots.length, rack_pin_count);
    const head_row = rows.get(0);
    assert.ok(head_row);
    assert.equal(head_row.length, 1);
    assert.equal(head_row[0].x, 0);
    assert.equal(head_row[0].y, Math.min(...rack.slots.map((slot) => slot.y)));

    const ordered_rows = [...rows.entries()].sort(([first], [second]) => first - second);
    let total_capacity = 0;
    for (const [row_index, row] of ordered_rows) {
      const capacity = row_index + 1;
      total_capacity += row.length;
      assert.equal(row.length, capacity);
      assert.deepEqual(
        row.map((slot) => slot.column_index),
        Array.from({ length: row.length }, (_, column_index) => column_index),
      );
      for (let index = 0; index < row.length; index += 1) {
        const opposite = row[row.length - 1 - index];
        assert.ok(opposite);
        assert.equal(row[index].x + opposite.x, 0);
      }
    }
    assert.equal(total_capacity, rack_pin_count);
    for (const slot of rack.slots.slice(1)) {
      assert.ok(slot.y > head_row[0].y);
    }
  }
});

test("exposes only snapshot and activation tuning for every supported count", () => {
  for (const pin_count of supported_pin_counts) {
    const tuning = get_mode_tuning(pin_count);
    assert.ok(Number.isFinite(tuning.snapshot_hz) && tuning.snapshot_hz > 0);
    assert.ok(Number.isFinite(tuning.activation_radius) && tuning.activation_radius > 0);
  }
});

test("shares four-parameter launch fixtures between benchmark entry points", () => {
  assert.ok(benchmark_fixtures.some((fixture) => fixture.fixture_id === "late_left_hook"));
  for (const fixture of benchmark_fixtures) {
    assert.ok(
      [fixture.power, fixture.start_position, fixture.angle, fixture.spin].every(Number.isFinite),
    );
    assert.equal("lateral_offset" in fixture, false);
    assert.equal("steer" in fixture, false);
    assert.equal("steer_direction" in fixture, false);
    assert.equal("steer_start_step" in fixture, false);
    assert.equal("steer_end_step" in fixture, false);
  }
});

test("includes only radius candidates across spatial-hash cell boundaries", () => {
  const slots = [
    { pin_id: create_pin_id(0), x: -1.01, y: 0, row_index: 0, column_index: 0 },
    { pin_id: create_pin_id(1), x: 0.99, y: 0, row_index: 0, column_index: 1 },
    { pin_id: create_pin_id(2), x: 1.01, y: 0, row_index: 0, column_index: 2 },
  ];
  const index = create_activation_index(slots, 1);
  assert.deepEqual(find_nearby_pin_ids(index, 0, 0, 1).map(Number).sort(), [1]);
});

test("direct contact wakes a sleeping dynamic pin and transfers velocity", async () => {
  const world = await create_simulation_world(10);
  const first_pin = world.rack.slots[0];
  assert.ok(first_pin);
  world.launch(24, first_pin.x, 0, 0);
  for (let step = 0; step < 1_200; step += 1) {
    world.step_fixed();
    const velocity = world.get_pin_velocity(first_pin.pin_id);
    if (Math.hypot(velocity.x, velocity.y) > 0) break;
  }
  const velocity = world.get_pin_velocity(first_pin.pin_id);
  assert.equal(world.is_pin_active(first_pin.pin_id), true);
  assert.ok(Math.hypot(velocity.x, velocity.y) > 0);
  world.dispose();
});

test("ten-pin power produces progressively faster head-pin impact", async () => {
  const weak = await run_centered_roll(10, 8);
  const default_roll = await run_centered_roll(10, 16);
  const full = await run_centered_roll(10, 24);
  assert.ok(weak.head_contact_step > default_roll.head_contact_step);
  assert.ok(default_roll.head_contact_step > full.head_contact_step);
});

test("a second roll retains its full settlement lifecycle on the same rack", async () => {
  const world = await create_simulation_world(10);
  const settle_roll = () => {
    let terminal = false;
    let step_count = 0;
    while (!terminal && step_count < 1600) {
      const result = world.step_fixed();
      terminal = result.settled || result.timed_out;
      step_count += 1;
    }
    return { terminal, step_count };
  };
  world.launch(18, 0, 0, 0);
  assert.equal(settle_roll().terminal, true);
  world.launch(18, 0, 0, 0);
  const second_roll = settle_roll();
  assert.equal(second_roll.terminal, true);
  assert.ok(second_roll.step_count > 1);
  world.dispose();
});

test("count conservation and exactly-once falls hold through a cascade", async () => {
  const world = await create_simulation_world(get_rack_pin_count(20));
  world.launch(20, 0, 0, 0);
  const fall_ids = new Set();
  for (let step = 0; step < 900; step += 1) {
    const result = world.step_fixed();
    for (const pin_id of result.fall_events) {
      assert.equal(fall_ids.has(pin_id), false);
      fall_ids.add(pin_id);
    }
    const counts = world.get_counts();
    assert.equal(counts.standing_pin_count + counts.fallen_pin_count, get_rack_pin_count(20));
    if (result.settled || result.timed_out) break;
  }
  world.dispose();
});

test("a centered roll topples a non-head pin whose first dynamic contact was pin-only", async () => {
  const world = await create_simulation_world(10);
  const non_head_pin_ids = new Set(world.rack.slots.slice(1).map((slot) => slot.pin_id));
  const fall_events = [];

  try {
    world.launch(18, 0, 0, 0);
    for (let step = 1; step <= 900; step += 1) {
      const result = world.step_fixed();
      for (const pin_id of result.fall_events) fall_events.push({ pin_id, step });
      if (result.settled || result.timed_out) break;
    }

    assert.ok(
      fall_events.some(
        (event) =>
          non_head_pin_ids.has(event.pin_id) &&
          world.get_pin_first_contact(event.pin_id) === "pin_pin",
      ),
      "a fallen non-head pin must first contact another pin without a simultaneous ball contact",
    );
  } finally {
    world.dispose();
  }
});

test("a fallen pin replaces its base circle with a mass-preserving outward capsule", async () => {
  const world = await create_simulation_world(10);
  const head_pin = world.rack.slots[0];
  assert.ok(head_pin);

  try {
    const standing = world.get_pin_collision_profile(head_pin.pin_id);
    assert.equal(standing.shape, "standing_circle");
    assert.equal(standing.footprint_length, physics_config.pin_radius * 2);

    world.launch(16, 0, 0, 0);
    for (let step = 0; step < 1_200; step += 1) {
      world.step_fixed();
      if (world.get_counts().fallen_pin_count > 0) break;
    }

    const fallen = world.get_pin_collision_profile(head_pin.pin_id);
    assert.equal(fallen.shape, "fallen_capsule");
    assert.equal(fallen.footprint_length, fallen_pin_length);
    assert.ok(fallen.footprint_length > standing.footprint_length);
    assert.ok(Math.abs(fallen.mass - standing.mass) < 1e-6);
  } finally {
    world.dispose();
  }
});

test("uses the rack-aware declared pound mass and preserves standing mass through a fall", async () => {
  for (const mode of supported_pin_counts) {
    const rack_pin_count = get_rack_pin_count(mode);
    const candidate = await create_simulation_world(rack_pin_count);
    try {
      assert.equal(candidate.get_ball_collision_profile().mass, get_ball_mass_lb(rack_pin_count));
      assert.equal(candidate.get_ball_collision_profile().mass, rack_ball_mass_lb[rack_pin_count]);
    } finally {
      candidate.dispose();
    }
  }

  const world = await create_simulation_world(10);
  const head_pin = world.rack.slots[0];
  assert.ok(head_pin);

  try {
    const ball = world.get_ball_collision_profile();
    const standing = world.get_pin_collision_profile(head_pin.pin_id);
    assert.equal(ball.mass, physics_config.ball_mass_lb);
    assert.equal(standing.mass, physics_config.pin_mass_lb);
    assert.equal(
      ball.mass / standing.mass,
      physics_config.ball_mass_lb / physics_config.pin_mass_lb,
    );

    world.launch(16, 0, 0, 0);
    for (let step = 0; step < 1_200; step += 1) {
      world.step_fixed();
      if (world.get_counts().fallen_pin_count > 0) break;
    }

    const fallen = world.get_pin_collision_profile(head_pin.pin_id);
    assert.equal(fallen.shape, "fallen_capsule");
    assert.equal(fallen.mass, standing.mass);
  } finally {
    world.dispose();
  }
});

test("fallen snapshots publish the collider center and long axis", async () => {
  const world = await create_simulation_world(10);
  const head_pin = world.rack.slots[0];
  assert.ok(head_pin);

  try {
    world.launch(16, 0, 0, 0);
    for (let step = 0; step < 1_200; step += 1) {
      world.step_fixed();
      if (world.get_counts().fallen_pin_count > 0) break;
    }

    const snapshot = world.create_snapshot();
    const offset = Number(head_pin.pin_id) * pin_snapshot_stride;
    const pin = read_snapshot_pin(snapshot.data, offset);
    const body = world.get_pin_position(head_pin.pin_id);
    const center_offset_x = pin.x - body.x;
    const center_offset_y = pin.y - body.y;
    const center_offset_length = Math.hypot(center_offset_x, center_offset_y);

    assert.equal(pin.state_flag, 1);
    assert.ok(Math.abs(center_offset_length - fallen_pin_length / 2) < 1e-5);
    assert.ok(
      Math.abs(center_offset_x / center_offset_length - Math.cos(pin.fallen_axis_angle)) < 1e-5,
    );
    assert.ok(
      Math.abs(center_offset_y / center_offset_length - Math.sin(pin.fallen_axis_angle)) < 1e-5,
    );
    assert.equal(snapshot.data[offset + snapshot_fallen_axis_angle_offset], pin.fallen_axis_angle);
  } finally {
    world.dispose();
  }
});

test("exact centered ten-pin controls do not strike", async () => {
  const legal_powers = [8, 10, 12, 14, 16, 18, 20, 22, 24];
  let strike_power;

  for (const power of legal_powers) {
    const world = await create_simulation_world(10);
    try {
      world.launch(power, 0, 0, 0);
      for (let step = 0; step < 3_600; step += 1) {
        const result = world.step_fixed();
        if (result.settled || result.timed_out) break;
      }
      if (world.get_counts().fallen_pin_count === 10) {
        strike_power = power;
        break;
      }
    } finally {
      world.dispose();
    }
  }

  assert.equal(strike_power, undefined, "exact centered rolls should not produce a strike");
});

test("benchmark validation identifies incomplete, unconserved, and unusable samples", () => {
  const report = {
    generated_at: "2026-07-29T00:00:00.000Z",
    samples: [
      {
        mode: 10,
        pin_count: 10,
        fixture_id: "head_on",
        settled: false,
        timed_out: true,
        fixture_cpu_time_ms: Number.NaN,
        fixed_step_cpu_time_ms: { mean: 1, p95: 1 },
        emitted_frame_cpu_time_ms: { mean: 1, p95: 1 },
        settlement_time_ms: 1,
        total_body_count: 11,
        max_awake_body_count: 11,
        final_awake_body_count: 0,
        standing_pin_count: 9,
        fallen_pin_count: 2,
      },
    ],
  };
  const failures = get_benchmark_validation_failures(report);
  assert.ok(failures.some((failure) => failure.includes("did not settle")));
  assert.ok(failures.some((failure) => failure.includes("timeout")));
  assert.ok(failures.some((failure) => failure.includes("conservation")));
  assert.ok(failures.some((failure) => failure.includes("non-finite")));
});

test("renderer creates a finite command for every pin at each framing count", () => {
  for (const pin_count of [10, 105, 990]) {
    const data = new Float32Array(pin_count * pin_snapshot_stride + ball_snapshot_stride);
    data[0] = -1;
    data[snapshot_velocity_x_offset] = 1;
    const commands = create_draw_commands(data, data, pin_count, 0.5, 1600, 1000);
    assert.equal(commands.length, pin_count + 2);
    assert.ok(
      commands.every((command) =>
        [command.x, command.y, command.width, command.height, command.angle].every(Number.isFinite),
      ),
    );
  }
});

test("benchmark renderer interpolates a fallen axis through the short PI boundary arc", () => {
  const pin_count = 10;
  const previous = new Float32Array(pin_count * pin_snapshot_stride + ball_snapshot_stride);
  const current = new Float32Array(pin_count * pin_snapshot_stride + ball_snapshot_stride);
  previous[snapshot_state_flag_offset] = 1;
  current[snapshot_state_flag_offset] = 1;
  previous[snapshot_fallen_axis_angle_offset] = Math.PI - 0.1;
  current[snapshot_fallen_axis_angle_offset] = -Math.PI + 0.1;

  const command = create_draw_commands(previous, current, pin_count, 0.5, 1600, 1000)[1];
  assert.ok(command);
  const angular_distance = (first, second) =>
    Math.abs(
      ((((first - second + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI,
    );

  assert.equal(command.kind, "fallen_pin");
  assert.ok(angular_distance(command.angle, Math.PI) < 0.001);
});

test("benchmark renderer omits pins and balls that have left the visible lane", () => {
  const pin_count = 10;
  const data = new Float32Array(pin_count * pin_snapshot_stride + ball_snapshot_stride);
  data[snapshot_removed_flag_offset] = 1;
  data[pin_snapshot_stride + snapshot_in_pit_flag_offset] = 1;
  data[pin_count * pin_snapshot_stride + ball_snapshot_in_pit_flag_offset] = 1;
  const commands = create_draw_commands(data, data, pin_count, 0.5, 1600, 1000);
  assert.equal(commands.filter((command) => command.kind !== "lane").length, pin_count - 2);
});
