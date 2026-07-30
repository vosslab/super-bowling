import assert from "node:assert/strict";
import test from "node:test";

import { normalize_ball_design } from "../src/designer/ball_design.ts";
import { draw_ball, get_ball_pattern_commands } from "../src/render/ball.ts";
import { get_game_asset_urls } from "../src/render/game_assets.ts";
import { create_camera_state } from "../src/render/camera.ts";
import {
  create_camera_projection,
  derive_ball_roll_angle,
  create_game_draw_commands,
} from "../src/render/game_renderer.ts";
import { create_rack } from "../src/simulation/rack.ts";
import { choose_pin_sprite } from "../src/render/pins.ts";
import {
  ball_snapshot_stride,
  pin_snapshot_stride,
  snapshot_state_flag_offset,
  snapshot_velocity_x_offset,
  snapshot_velocity_y_offset,
  snapshot_x_offset,
  snapshot_y_offset,
} from "../src/simulation/protocol.ts";

function create_snapshot(pin_count) {
  return new Float32Array(pin_count * pin_snapshot_stride + ball_snapshot_stride);
}

function get_pin_command(commands, pin_index) {
  const command = commands.find(
    (candidate) =>
      candidate.kind !== "lane" && candidate.kind !== "ball" && candidate.pin_index === pin_index,
  );
  assert.ok(command);
  return command;
}

function get_lane_command(commands) {
  const command = commands.find((candidate) => candidate.kind === "lane");
  assert.ok(command);
  return command;
}

function create_rack_snapshot(pin_count) {
  const rack = create_rack(pin_count);
  const snapshot = create_snapshot(pin_count);
  for (const slot of rack.slots) {
    const offset = Number(slot.pin_id) * pin_snapshot_stride;
    snapshot[offset + snapshot_x_offset] = slot.x;
    snapshot[offset + snapshot_y_offset] = slot.y;
  }
  const ball_offset = pin_count * pin_snapshot_stride;
  snapshot[ball_offset + snapshot_x_offset] = 0;
  snapshot[ball_offset + snapshot_y_offset] = -9;
  return snapshot;
}

test("interpolates pin positions into finite front-facing lane commands", () => {
  const previous = create_snapshot(10);
  const current = create_snapshot(10);
  previous[snapshot_x_offset] = -4;
  previous[snapshot_y_offset] = 3;
  current[snapshot_x_offset] = 4;
  current[snapshot_y_offset] = 3;
  const commands = create_game_draw_commands(previous, current, 10, 0.5, 1600, 1000);
  const pin = get_pin_command(commands, 0);
  assert.equal(commands.length, 12);
  assert.ok(Math.abs(pin.x - 800) < 0.001);
  assert.ok(
    commands.every((command) => {
      if (command.kind === "lane") return true;
      if (command.kind === "ball") {
        return [command.x, command.y, command.width, command.height, command.roll_angle].every(
          Number.isFinite,
        );
      }
      return [command.x, command.y, command.width, command.height, command.angle].every(
        Number.isFinite,
      );
    }),
  );
});

test("creates every pin command and depth-orders the renderable scene", () => {
  for (const pin_count of [10, 105, 990]) {
    const snapshot = create_snapshot(pin_count);
    for (let pin_index = 0; pin_index < pin_count; pin_index += 1) {
      const offset = pin_index * pin_snapshot_stride;
      snapshot[offset + snapshot_x_offset] = pin_index % 13;
      snapshot[offset + snapshot_y_offset] = Math.floor(pin_index / 13);
    }
    const commands = create_game_draw_commands(snapshot, snapshot, pin_count, 1, 1600, 1000);
    const renderables = commands.filter((command) => command.kind !== "lane");
    assert.equal(commands.length, pin_count + 2);
    assert.ok(
      renderables.every((command, index) => index === 0 || renderables[index - 1].y <= command.y),
    );
  }
});

test("keeps the opening ball foreground and the complete rack distant at 16:10", () => {
  const rack = create_rack(10);
  const snapshot = create_snapshot(10);
  for (const slot of rack.slots) {
    const offset = Number(slot.pin_id) * pin_snapshot_stride;
    snapshot[offset + snapshot_x_offset] = slot.x;
    snapshot[offset + snapshot_y_offset] = slot.y;
  }
  const ball_offset = 10 * pin_snapshot_stride;
  snapshot[ball_offset + snapshot_x_offset] = 0;
  snapshot[ball_offset + snapshot_y_offset] = -9;
  const opening = create_game_draw_commands(snapshot, snapshot, 10, 1, 1600, 1000);
  const opening_ball = opening.find((command) => command.kind === "ball");
  assert.ok(opening_ball);
  const pins = opening.filter((command) => command.kind === "standing_pin");
  assert.equal(pins.length, 10);
  assert.ok(pins.every((pin) => opening_ball.y > pin.y));
  assert.ok(opening_ball.width > Math.max(...pins.map((pin) => pin.width)));
  assert.equal(opening_ball.width, opening_ball.height);
  assert.ok(pins.every((pin) => pin.width >= 7 && pin.height >= 16));

  const rolling = new Float32Array(snapshot);
  rolling[ball_offset + snapshot_y_offset] = 2;
  const rolling_ball = create_game_draw_commands(rolling, rolling, 10, 1, 1600, 1000).find(
    (command) => command.kind === "ball",
  );
  assert.ok(rolling_ball);
  assert.ok(rolling_ball.y < opening_ball.y);
  const projection = create_camera_projection(
    create_camera_state(10, Number.NEGATIVE_INFINITY, false),
  );
  assert.ok(projection.near_y < rack.bounds.min_y && projection.far_y > rack.bounds.max_y);
});

test("rolls patterned spherical artwork from forward travel with constrained physics rotation", () => {
  const previous = create_snapshot(10);
  const current = create_snapshot(10);
  const ball_offset = 10 * pin_snapshot_stride;
  previous[ball_offset + snapshot_y_offset] = -9;
  current[ball_offset + snapshot_y_offset] = 2;
  previous[ball_offset + 4] = 0;
  current[ball_offset + 4] = 0;
  const design = normalize_ball_design({ pattern: "single_band" });
  const opening = create_game_draw_commands(previous, previous, 10, 1, 1600, 1000, design).find(
    (command) => command.kind === "ball",
  );
  const rolling = create_game_draw_commands(previous, current, 10, 1, 1600, 1000, design).find(
    (command) => command.kind === "ball",
  );
  assert.ok(opening);
  assert.ok(rolling);
  assert.notEqual(rolling.roll_angle, opening.roll_angle);
  assert.equal(derive_ball_roll_angle(-9, 2, 1, 0), rolling.roll_angle);
});

test("frames each immutable initial rack completely inside the 16:10 lane", () => {
  for (const pin_count of [10, 105, 990]) {
    const rack = create_rack(pin_count);
    const snapshot = create_snapshot(pin_count);
    for (const slot of rack.slots) {
      const offset = Number(slot.pin_id) * pin_snapshot_stride;
      snapshot[offset + snapshot_x_offset] = slot.x;
      snapshot[offset + snapshot_y_offset] = slot.y;
    }
    const commands = create_game_draw_commands(snapshot, snapshot, pin_count, 1, 1600, 1000);
    const pins = commands.filter((command) => command.kind === "standing_pin");
    assert.equal(pins.length, pin_count);
    assert.ok(
      pins.every(
        (pin) =>
          pin.x - pin.width / 2 >= 0 &&
          pin.x + pin.width / 2 <= 1600 &&
          pin.y - pin.height / 2 >= 0 &&
          pin.y + pin.height / 2 <= 1000,
      ),
    );
  }
});

test("uses a gentle rail convergence and bounded symmetric lane diamonds", () => {
  for (const pin_count of [10, 105, 990]) {
    const snapshot = create_rack_snapshot(pin_count);
    const lane = get_lane_command(
      create_game_draw_commands(snapshot, snapshot, pin_count, 1, 1600, 1000),
    );
    const convergence_ratio = lane.geometry.top_half_width / lane.geometry.bottom_half_width;
    assert.ok(convergence_ratio >= 0.6 && convergence_ratio < 1);
    assert.equal(lane.geometry.diamonds.length, 10);
    for (const diamond of lane.geometry.diamonds) {
      assert.ok(diamond.x - diamond.size >= 0);
      assert.ok(diamond.x + diamond.size <= 1600);
      assert.ok(diamond.y - diamond.size >= lane.geometry.horizon_y);
      assert.ok(diamond.y + diamond.size <= 1000);
      const mirror = lane.geometry.diamonds.find(
        (candidate) =>
          Math.abs(candidate.y - diamond.y) < 0.001 &&
          Math.abs(candidate.x - (1600 - diamond.x)) < 0.001,
      );
      assert.ok(mirror);
    }
  }
});

test("renders each physical triangle as a compact, countable visual rack", () => {
  for (const pin_count of [45, 105, 990]) {
    const rack = create_rack(pin_count);
    const snapshot = create_rack_snapshot(pin_count);
    const commands = create_game_draw_commands(snapshot, snapshot, pin_count, 1, 1600, 1000);
    for (
      let row_index = 1;
      row_index <= Math.max(...rack.slots.map((slot) => slot.row_index));
      row_index += 1
    ) {
      const row = rack.slots.filter((slot) => slot.row_index === row_index);
      for (let column_index = 1; column_index < row.length; column_index += 1) {
        const left_slot = row[column_index - 1];
        const right_slot = row[column_index];
        assert.ok(left_slot && right_slot);
        const left_pin = get_pin_command(commands, Number(left_slot.pin_id));
        const right_pin = get_pin_command(commands, Number(right_slot.pin_id));
        const center_distance = Math.abs(right_pin.x - left_pin.x);
        const average_width = (left_pin.width + right_pin.width) / 2;
        assert.ok(average_width >= center_distance * 0.65);
      }
    }
  }
});

test("widens emitted super-lane art in both camera states with complete triangular racks", () => {
  for (const ball_y of [Number.NEGATIVE_INFINITY, 5]) {
    const lane_commands = [10, 105, 990].map((pin_count) => {
      const snapshot = create_rack_snapshot(pin_count);
      const camera = create_camera_state(pin_count, ball_y, false);
      const commands = create_game_draw_commands(
        snapshot,
        snapshot,
        pin_count,
        1,
        1600,
        1000,
        undefined,
        camera,
      );
      const lane = get_lane_command(commands);
      const ball = commands.find((command) => command.kind === "ball");
      assert.ok(ball);
      return { lane, ball };
    });

    const [ten_pin, one_hundred_mode, one_thousand_mode] = lane_commands;
    assert.ok(ten_pin);
    assert.ok(one_hundred_mode);
    assert.ok(one_thousand_mode);
    assert.ok(ten_pin.lane.geometry.top_half_width < one_hundred_mode.lane.geometry.top_half_width);
    assert.ok(
      one_hundred_mode.lane.geometry.top_half_width <
        one_thousand_mode.lane.geometry.top_half_width,
    );
    assert.ok(
      ten_pin.lane.geometry.bottom_half_width < one_hundred_mode.lane.geometry.bottom_half_width,
    );
    assert.ok(
      one_hundred_mode.lane.geometry.bottom_half_width <
        one_thousand_mode.lane.geometry.bottom_half_width,
    );
    assert.equal(ten_pin.ball.width, one_hundred_mode.ball.width);
    assert.equal(one_hundred_mode.ball.width, one_thousand_mode.ball.width);
    assert.equal(ten_pin.ball.height, one_hundred_mode.ball.height);
    assert.equal(one_hundred_mode.ball.height, one_thousand_mode.ball.height);
  }
});

test("keeps a selected deck camera stable while fallen pins scatter", () => {
  const rack = create_rack(10);
  const initial = create_snapshot(10);
  for (const slot of rack.slots) {
    const offset = Number(slot.pin_id) * pin_snapshot_stride;
    initial[offset + snapshot_x_offset] = slot.x;
    initial[offset + snapshot_y_offset] = slot.y;
  }
  const deck_camera = create_camera_state(10, 5, false);
  const projection = create_camera_projection(deck_camera);
  const scattered = new Float32Array(initial);
  scattered[snapshot_x_offset] = 40;
  scattered[snapshot_y_offset] = 40;
  scattered[snapshot_state_flag_offset] = 1;
  const commands = create_game_draw_commands(
    initial,
    scattered,
    10,
    1,
    1600,
    1000,
    undefined,
    deck_camera,
  );
  assert.equal(
    commands.filter((command) => command.kind === "standing_pin" || command.kind === "fallen_pin")
      .length,
    10,
  );
  assert.deepEqual(create_camera_projection(deck_camera), projection);
});

test("uses fallen art and velocity direction only for fallen pins", () => {
  const snapshot = create_snapshot(10);
  snapshot[snapshot_state_flag_offset] = 1;
  snapshot[snapshot_velocity_x_offset] = 0;
  snapshot[snapshot_velocity_y_offset] = 2;
  const commands = create_game_draw_commands(snapshot, snapshot, 10, 0, 1600, 1000);
  const pin = get_pin_command(commands, 0);
  assert.equal(pin.kind, "fallen_pin");
  assert.ok(Math.abs(pin.angle - Math.PI / 2) < 0.001);
  assert.equal(choose_pin_sprite(false), "standing_pin");
  assert.equal(choose_pin_sprite(true), "fallen_pin");
});

test("maps each supported ball pattern to the shared spherical draw design", () => {
  const expected_command_counts = {
    solid: 1,
    single_band: 1,
    double_band: 2,
    chevron: 1,
  };
  for (const [pattern, expected_count] of Object.entries(expected_command_counts)) {
    const design = normalize_ball_design({ pattern });
    assert.equal(get_ball_pattern_commands(design.pattern).length, expected_count);
  }
});

test("uses the shipped spherical ball SVG as a gameplay draw overlay", () => {
  let image_draw_count = 0;
  const context = {
    save() {},
    restore() {},
    beginPath() {},
    ellipse() {},
    clip() {},
    fillRect() {},
    fill() {},
    stroke() {},
    createLinearGradient() {
      return { addColorStop() {} };
    },
    drawImage() {
      image_draw_count += 1;
    },
    fillText() {},
    moveTo() {},
    lineTo() {},
    set fillStyle(value) {},
    set strokeStyle(value) {},
    set lineWidth(value) {},
    set globalAlpha(value) {},
    set font(value) {},
    set textAlign(value) {},
    set textBaseline(value) {},
  };
  draw_ball(
    context,
    { x: 100, y: 100, width: 60, height: 60, roll_angle: 0, design: normalize_ball_design({}) },
    {},
  );
  assert.equal(image_draw_count, 1);
  assert.equal(get_game_asset_urls().ball, "./assets/ball_sphere.svg");
});

test("keeps the projected aim arrow anchored to the selected circular ball and grows with power", () => {
  const snapshot = create_rack_snapshot(10);
  const low_power = create_game_draw_commands(
    snapshot,
    snapshot,
    10,
    1,
    1600,
    1000,
    undefined,
    undefined,
    { lateral_offset: -3, power: 8 },
  );
  const high_power = create_game_draw_commands(
    snapshot,
    snapshot,
    10,
    1,
    1600,
    1000,
    undefined,
    undefined,
    { lateral_offset: 3, power: 24 },
  );
  const low_ball = low_power.find((command) => command.kind === "ball");
  const high_ball = high_power.find((command) => command.kind === "ball");
  const low_arrow = low_power.find((command) => command.kind === "aim_guide");
  const high_arrow = high_power.find((command) => command.kind === "aim_guide");
  assert.ok(low_ball && high_ball && low_arrow && high_arrow);
  assert.equal(low_ball.width, low_ball.height);
  assert.equal(low_arrow.x, low_ball.x);
  assert.equal(low_arrow.y, low_ball.y);
  assert.equal(high_arrow.x, high_ball.x);
  assert.equal(high_arrow.y, high_ball.y);
  assert.ok(low_arrow.x < high_arrow.x);
  const low_length = Math.hypot(low_arrow.end_x - low_arrow.x, low_arrow.end_y - low_arrow.y);
  const high_length = Math.hypot(high_arrow.end_x - high_arrow.x, high_arrow.end_y - high_arrow.y);
  assert.ok(high_length > low_length);
});
