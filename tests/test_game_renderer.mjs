import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { normalize_ball_design } from "../src/designer/ball_design.ts";
import { lane_width } from "../src/config/lane.ts";
import { draw_ball, get_ball_pattern_commands } from "../src/render/ball.ts";
import { get_game_asset_urls } from "../src/render/game_assets.ts";
import { advance_camera_for_ball, create_camera_state } from "../src/render/camera.ts";
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
  ball_snapshot_in_pit_flag_offset,
  snapshot_removed_flag_offset,
  snapshot_state_flag_offset,
  snapshot_velocity_x_offset,
  snapshot_velocity_y_offset,
  snapshot_fallen_axis_angle_offset,
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

const geometry_tolerance = 0.001;

function get_tag_attributes(markup, tag_name) {
  const match = markup.match(new RegExp(`<${tag_name}\\b([^>]*)>`));
  assert.ok(match);
  return match[1];
}

function get_attribute(attributes, name) {
  const match = attributes.match(new RegExp(`\\b${name}="([^"]+)"`));
  assert.ok(match);
  return match[1];
}

function get_url_reference(value) {
  const match = value.match(/^url\(#([^)]+)\)$/);
  assert.ok(match);
  return match[1];
}

function get_path_x_extent(path_data) {
  const tokens = path_data.match(/[a-zA-Z]|-?\d+(?:\.\d+)?/g);
  assert.ok(tokens);
  let command = "";
  let cursor = 0;
  let current_x = 0;
  let current_y = 0;
  let start_x = 0;
  const x_values = [];

  function read_number() {
    const token = tokens[cursor];
    assert.ok(token !== undefined && !/[a-zA-Z]/.test(token));
    cursor += 1;
    return Number(token);
  }

  function add_point(x, y, relative) {
    current_x = relative ? current_x + x : x;
    current_y = relative ? current_y + y : y;
    x_values.push(current_x);
  }

  while (cursor < tokens.length) {
    const token = tokens[cursor];
    assert.ok(token !== undefined);
    if (/[a-zA-Z]/.test(token)) {
      command = token;
      cursor += 1;
      if (command === "Z" || command === "z") {
        current_x = start_x;
        x_values.push(current_x);
      }
      continue;
    }
    const relative = command === command.toLowerCase();
    if (command === "M" || command === "m" || command === "L" || command === "l") {
      add_point(read_number(), read_number(), relative);
      if (command === "M" || command === "m") {
        start_x = current_x;
        command = relative ? "l" : "L";
      }
      continue;
    }
    if (command === "H" || command === "h") {
      current_x = relative ? current_x + read_number() : read_number();
      x_values.push(current_x);
      continue;
    }
    if (command === "V" || command === "v") {
      current_y = relative ? current_y + read_number() : read_number();
      continue;
    }
    assert.fail(`Unsupported ball-surface path command: ${command}`);
  }
  assert.ok(x_values.length > 0);
  return { min: Math.min(...x_values), max: Math.max(...x_values) };
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

test("omits removed fallen pins from render commands after a sweep", () => {
  const snapshot = create_snapshot(10);
  snapshot[snapshot_removed_flag_offset] = 1;
  snapshot[snapshot_state_flag_offset] = 1;
  const commands = create_game_draw_commands(snapshot, snapshot, 10, 1, 1600, 1000);
  assert.equal(
    commands.some((command) => command.kind === "fallen_pin" && command.pin_index === 0),
    false,
  );
});

test("omits an in-pit ball even when aiming state remains available", () => {
  const snapshot = create_snapshot(10);
  snapshot[10 * pin_snapshot_stride + ball_snapshot_in_pit_flag_offset] = 1;
  const commands = create_game_draw_commands(
    snapshot,
    snapshot,
    10,
    1,
    1600,
    1000,
    undefined,
    undefined,
    {
      lateral_offset: 0,
      power: 12,
    },
  );
  assert.equal(
    commands.some((command) => command.kind === "ball"),
    false,
  );
  assert.equal(
    commands.some((command) => command.kind === "aim_guide"),
    false,
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
  const projection = create_camera_projection(create_camera_state(10, false));
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

test("paints seven board-based chevron arrows inside a lane with fixed gutters", () => {
  for (const pin_count of [10, 105, 990]) {
    const snapshot = create_rack_snapshot(pin_count);
    const lane = get_lane_command(
      create_game_draw_commands(snapshot, snapshot, pin_count, 1, 1600, 1000),
    );
    const convergence_ratio = lane.geometry.top_half_width / lane.geometry.bottom_half_width;
    assert.ok(convergence_ratio >= 0.6 && convergence_ratio < 1);
    assert.equal(lane.geometry.arrows.length, 7);
    assert.ok(lane.geometry.gutter_world_width > 0);
    for (const arrow of lane.geometry.arrows) {
      assert.ok(arrow.x - arrow.size >= 0);
      assert.ok(arrow.x + arrow.size <= 1600);
      assert.ok(arrow.tip_y < arrow.base_y);
      assert.ok(arrow.tip_y >= lane.geometry.horizon_y);
      assert.ok(arrow.base_y <= 1000);
    }
  }
});

test("projects every initial rack strictly inside the painted lane silhouette", () => {
  for (const pin_count of [45, 105, 990]) {
    const rack = create_rack(pin_count);
    const snapshot = create_rack_snapshot(pin_count);
    const commands = create_game_draw_commands(snapshot, snapshot, pin_count, 1, 1600, 1000);
    const lane = get_lane_command(commands);
    const tolerance = 1;
    for (const slot of rack.slots) {
      const pin = get_pin_command(commands, Number(slot.pin_id));
      const depth =
        (pin.y - lane.geometry.horizon_y) / (lane.geometry.foreground_y - lane.geometry.horizon_y);
      const half_width =
        lane.geometry.top_half_width +
        (lane.geometry.bottom_half_width - lane.geometry.top_half_width) * depth;
      assert.ok(Math.abs(pin.x - 800) <= half_width + tolerance);
    }
  }
});

test("keeps proportional painted lane silhouettes across rack sizes and shot progress", () => {
  for (const at_result of [false, true]) {
    const lane_commands = [10, 105, 990].map((pin_count) => {
      const snapshot = create_rack_snapshot(pin_count);
      const lane_camera = create_camera_state(pin_count, false);
      const camera = at_result
        ? advance_camera_for_ball(lane_camera, lane_camera.rack_bounds.front, false)
        : lane_camera;
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
    assert.equal(
      ten_pin.lane.geometry.top_half_width,
      one_hundred_mode.lane.geometry.top_half_width,
    );
    assert.equal(
      one_hundred_mode.lane.geometry.top_half_width,
      one_thousand_mode.lane.geometry.top_half_width,
    );
    assert.equal(
      ten_pin.lane.geometry.bottom_half_width,
      one_hundred_mode.lane.geometry.bottom_half_width,
    );
    assert.equal(
      one_hundred_mode.lane.geometry.bottom_half_width,
      one_thousand_mode.lane.geometry.bottom_half_width,
    );
    assert.equal(ten_pin.ball.width, one_hundred_mode.ball.width);
    assert.equal(one_hundred_mode.ball.width, one_thousand_mode.ball.width);
    assert.equal(ten_pin.ball.height, one_hundred_mode.ball.height);
    assert.equal(one_hundred_mode.ball.height, one_thousand_mode.ball.height);
  }
});

test("keeps the centered result framing stable while fallen pins scatter", () => {
  const rack = create_rack(10);
  const initial = create_snapshot(10);
  for (const slot of rack.slots) {
    const offset = Number(slot.pin_id) * pin_snapshot_stride;
    initial[offset + snapshot_x_offset] = slot.x;
    initial[offset + snapshot_y_offset] = slot.y;
  }
  const result_camera = advance_camera_for_ball(
    create_camera_state(10, false),
    create_camera_state(10, false).rack_bounds.front,
    false,
  );
  const projection = create_camera_projection(result_camera);
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
    result_camera,
  );
  assert.equal(
    commands.filter((command) => command.kind === "standing_pin" || command.kind === "fallen_pin")
      .length,
    10,
  );
  assert.deepEqual(create_camera_projection(result_camera), projection);
});

test("uses the published capsule axis for fallen pin art", () => {
  const snapshot = create_snapshot(10);
  snapshot[snapshot_state_flag_offset] = 1;
  snapshot[snapshot_velocity_x_offset] = 9;
  snapshot[snapshot_velocity_y_offset] = -3;
  snapshot[snapshot_fallen_axis_angle_offset] = Math.PI / 2;
  const commands = create_game_draw_commands(snapshot, snapshot, 10, 0, 1600, 1000);
  const pin = get_pin_command(commands, 0);
  assert.equal(pin.kind, "fallen_pin");
  assert.ok(Math.abs(pin.angle - Math.PI / 2) < 0.001);
  assert.equal(choose_pin_sprite(false), "standing_pin");
  assert.equal(choose_pin_sprite(true), "fallen_pin");
});

test("interpolates a fallen pin axis across the PI boundary by its short arc", () => {
  const previous = create_snapshot(10);
  const current = create_snapshot(10);
  previous[snapshot_state_flag_offset] = 1;
  current[snapshot_state_flag_offset] = 1;
  previous[snapshot_fallen_axis_angle_offset] = Math.PI - 0.1;
  current[snapshot_fallen_axis_angle_offset] = -Math.PI + 0.1;

  const pin = get_pin_command(create_game_draw_commands(previous, current, 10, 0.5, 1600, 1000), 0);
  const angular_distance = (first, second) =>
    Math.abs(
      ((((first - second + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI,
    );

  assert.equal(pin.kind, "fallen_pin");
  assert.ok(angular_distance(pin.angle, Math.PI) < 0.001);
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

test("uses the seamless ball surface as a repeated gameplay draw overlay", () => {
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
  assert.equal(image_draw_count, 2);
  assert.equal(get_game_asset_urls().ball, "./assets/ball_surface.svg");
});

test("builds the ball surface from a seam-safe repeated tile", () => {
  const surface_url = new URL("../src/assets/ball_surface.svg", import.meta.url);
  const surface_svg = readFileSync(surface_url, "utf8");
  const svg_attributes = get_tag_attributes(surface_svg, "svg");
  const view_box = get_attribute(svg_attributes, "viewBox").split(/\s+/).map(Number);
  const root_width = view_box[2];
  assert.ok(root_width !== undefined);

  const pattern_match = surface_svg.match(/<pattern\b([^>]*)>([\s\S]*?)<\/pattern>/);
  assert.ok(pattern_match);
  const pattern_attributes = pattern_match[1];
  const pattern_body = pattern_match[2];
  const tile_width = Number(get_attribute(pattern_attributes, "width"));
  assert.ok(Number.isFinite(tile_width) && root_width / tile_width >= 2);
  assert.equal(root_width % tile_width, 0);

  const pattern_id = get_attribute(pattern_attributes, "id");
  const outer_markup = surface_svg.slice(surface_svg.indexOf("</defs>") + "</defs>".length);
  const outer_fill = get_url_reference(
    get_attribute(get_tag_attributes(outer_markup, "rect"), "fill"),
  );
  assert.equal(outer_fill, pattern_id);

  const gradient_id = get_url_reference(
    get_attribute(get_tag_attributes(pattern_body, "rect"), "fill"),
  );
  const gradient_match = surface_svg.match(
    new RegExp(`<linearGradient\\b([^>]*)\\bid="${gradient_id}"([^>]*)>`),
  );
  assert.ok(gradient_match);
  const gradient_attributes = `${gradient_match[1]} ${gradient_match[2]}`;
  assert.equal(get_attribute(gradient_attributes, "x1"), get_attribute(gradient_attributes, "x2"));

  const path_match = pattern_body.match(/<path\b([^>]*)\/>/);
  assert.ok(path_match);
  const path_attributes = path_match[1];
  const path_extent = get_path_x_extent(get_attribute(path_attributes, "d"));
  const half_stroke_width = Number(get_attribute(path_attributes, "stroke-width")) / 2;
  assert.ok(path_extent.min - half_stroke_width > 0);
  assert.ok(path_extent.max + half_stroke_width < tile_width);
});

test("projects authoritative lane edges onto the painted silhouette", () => {
  const render_width = 1600;
  const render_height = 1000;
  const fixtures = [
    { pin_count: 10, at_result: false },
    { pin_count: 10, at_result: true },
    { pin_count: 105, at_result: false },
    { pin_count: 105, at_result: true },
    { pin_count: 990, at_result: false },
    { pin_count: 990, at_result: true },
  ];
  for (const fixture of fixtures) {
    const lane_camera = create_camera_state(fixture.pin_count, false);
    const camera = fixture.at_result
      ? advance_camera_for_ball(lane_camera, lane_camera.rack_bounds.front, false)
      : lane_camera;
    const projection = create_camera_projection(camera);
    for (const depth_fraction of [0.2, 0.5, 0.8]) {
      const world_y = projection.far_y - (projection.far_y - projection.near_y) * depth_fraction;
      for (const sign of [-1, 1]) {
        const snapshot = create_snapshot(fixture.pin_count);
        snapshot[snapshot_x_offset] = sign * (lane_width(fixture.pin_count) / 2);
        snapshot[snapshot_y_offset] = world_y;
        const commands = create_game_draw_commands(
          snapshot,
          snapshot,
          fixture.pin_count,
          1,
          render_width,
          render_height,
          undefined,
          camera,
        );
        const lane = get_lane_command(commands);
        const pin = get_pin_command(commands, 0);
        const screen_depth =
          (pin.y - lane.geometry.horizon_y) /
          (lane.geometry.foreground_y - lane.geometry.horizon_y);
        const painted_half_width =
          lane.geometry.top_half_width +
          (lane.geometry.bottom_half_width - lane.geometry.top_half_width) * screen_depth;
        assert.ok(
          Math.abs(Math.abs(pin.x - render_width / 2) - painted_half_width) <= geometry_tolerance,
          "lane-edge pin center should meet the painted lane silhouette",
        );
      }
    }
  }
});

test("scrolls the ball surface with travel while its screen-space highlight stays fixed", () => {
  const snapshot = create_rack_snapshot(10);
  const rolling = new Float32Array(snapshot);
  rolling[10 * pin_snapshot_stride + snapshot_x_offset] = 1;
  rolling[10 * pin_snapshot_stride + snapshot_y_offset] = 4;
  const opening_ball = create_game_draw_commands(snapshot, snapshot, 10, 1, 1600, 1000).find(
    (command) => command.kind === "ball",
  );
  const rolling_ball = create_game_draw_commands(snapshot, rolling, 10, 1, 1600, 1000).find(
    (command) => command.kind === "ball",
  );
  assert.ok(opening_ball && rolling_ball);
  assert.notEqual(rolling_ball.surface_offset, opening_ball.surface_offset);
  assert.equal(rolling_ball.highlight_offset, opening_ball.highlight_offset);
});

test("draws sampled aim guides beyond the selected circular ball", () => {
  const snapshot = create_rack_snapshot(10);
  const left_path = create_game_draw_commands(
    snapshot,
    snapshot,
    10,
    1,
    1600,
    1000,
    undefined,
    undefined,
    { lateral_offset: -3, preview_path: new Float32Array([-3, -9, -3, 8]) },
  );
  const right_path = create_game_draw_commands(
    snapshot,
    snapshot,
    10,
    1,
    1600,
    1000,
    undefined,
    undefined,
    { lateral_offset: 3, preview_path: new Float32Array([3, -9, 3, 8]) },
  );
  const left_ball = left_path.find((command) => command.kind === "ball");
  const right_ball = right_path.find((command) => command.kind === "ball");
  const left_guide = left_path.find((command) => command.kind === "aim_guide");
  const right_guide = right_path.find((command) => command.kind === "aim_guide");
  assert.ok(left_ball && right_ball && left_guide && right_guide);
  assert.equal(left_ball.width, left_ball.height);
  assert.ok(
    Math.hypot(left_guide.x - left_ball.x, left_guide.y - left_ball.y) > left_ball.width / 2,
  );
  assert.ok(
    Math.hypot(right_guide.x - right_ball.x, right_guide.y - right_ball.y) > right_ball.width / 2,
  );
  assert.ok(left_guide.x < right_guide.x);
});

test("draws the selected aiming ball before an asynchronous preview arrives", () => {
  const snapshot = create_rack_snapshot(10);
  const commands = create_game_draw_commands(
    snapshot,
    snapshot,
    10,
    1,
    1600,
    1000,
    undefined,
    undefined,
    undefined,
    3,
  );
  const ball = commands.find((command) => command.kind === "ball");
  const guide = commands.find((command) => command.kind === "aim_guide");
  assert.ok(ball);
  assert.equal(guide, undefined);
  assert.ok(ball.x > 800, "the selected lateral aim is visible without a preview path");
});

test("starts preview-path guides beyond the ball and preserves spin direction", () => {
  const snapshot = create_rack_snapshot(10);
  const right = create_game_draw_commands(
    snapshot,
    snapshot,
    10,
    1,
    1600,
    1000,
    undefined,
    undefined,
    {
      lateral_offset: 0,
      power: 16,
      spin: 1,
      preview_path: new Float32Array([0, -9, 0.2, -7, 1, 8]),
    },
  );
  const left = create_game_draw_commands(
    snapshot,
    snapshot,
    10,
    1,
    1600,
    1000,
    undefined,
    undefined,
    {
      lateral_offset: 0,
      power: 16,
      spin: -1,
      preview_path: new Float32Array([0, -9, -0.2, -7, -1, 8]),
    },
  );
  const right_ball = right.find((command) => command.kind === "ball");
  const left_ball = left.find((command) => command.kind === "ball");
  const right_guide = right.find((command) => command.kind === "aim_guide");
  const left_guide = left.find((command) => command.kind === "aim_guide");
  assert.ok(right_ball && left_ball && right_guide && left_guide);
  assert.ok(
    right_guide.points.every(
      (point) => Math.hypot(point.x - right_ball.x, point.y - right_ball.y) > right_ball.width / 2,
    ),
  );
  assert.ok(right_guide.end_x > right_ball.x && left_guide.end_x < left_ball.x);
});
