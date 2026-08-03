import assert from "node:assert/strict";
import test from "node:test";

import {
  camera_config,
  camera_candidate_profiles,
  camera_candidates,
  default_camera_candidate,
} from "../src/config/camera.ts";
import { aim_limits } from "../src/game/aim.ts";
import { get_rack_pin_count, supported_pin_counts } from "../src/config/pin_counts.ts";
import {
  advance_camera_for_ball,
  create_camera_state,
  create_rack_bounds,
  parse_camera_candidate_search,
  reset_camera_for_roll,
  resolve_default_camera_candidate,
  with_reduced_motion,
} from "../src/render/camera.ts";
import {
  create_camera_projection,
  create_game_draw_commands,
} from "../src/render/game_renderer.ts";
import { create_rack } from "../src/simulation/rack.ts";
import {
  ball_snapshot_stride,
  pin_snapshot_stride,
  snapshot_removed_flag_offset,
  snapshot_x_offset,
  snapshot_y_offset,
} from "../src/simulation/protocol.ts";

// Measured from the frozen 1600 x 1000 desktop side-panel layout. Camera
// acceptance must use the actual lane canvas, not the viewport or the former
// bottom-deck canvas.
const canvas = { width: 1248, height: 884 };
const rack_pin_counts = supported_pin_counts.map(get_rack_pin_count);

function create_snapshot(pin_count) {
  return new Float32Array(pin_count * pin_snapshot_stride + ball_snapshot_stride);
}

function fill_rack(snapshot, pin_count) {
  for (const slot of create_rack(pin_count).slots) {
    const offset = Number(slot.pin_id) * pin_snapshot_stride;
    snapshot[offset + snapshot_x_offset] = slot.x;
    snapshot[offset + snapshot_y_offset] = slot.y;
  }
}

function draw(pin_count, camera = create_camera_state(pin_count, false), aim_lateral_offset = 0) {
  const snapshot = create_snapshot(pin_count);
  fill_rack(snapshot, pin_count);
  return create_game_draw_commands(
    snapshot,
    snapshot,
    pin_count,
    1,
    canvas.width,
    canvas.height,
    undefined,
    camera,
    undefined,
    aim_lateral_offset,
  );
}

function get_lane(commands) {
  const lane = commands.find((command) => command.kind === "lane");
  assert.ok(lane, "a lane is drawn for every camera state");
  return lane;
}

function get_pins(commands) {
  return commands.filter((command) => command.kind === "standing_pin");
}

function with_window_search(search, callback) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { location: { search } },
  });
  try {
    return callback();
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "window", descriptor);
    else delete globalThis.window;
  }
}

function row_diagnostic(pin_count, candidate) {
  const rack = create_rack(pin_count);
  const pins = get_pins(draw(pin_count, create_camera_state(pin_count, false, candidate)));
  const rows = [];
  for (
    let row_index = 0;
    row_index <= Math.max(...rack.slots.map((slot) => slot.row_index));
    row_index += 1
  ) {
    const row_pins = rack.slots
      .filter((slot) => slot.row_index === row_index)
      .map((slot) => pins.find((pin) => pin.pin_index === Number(slot.pin_id)));
    assert.ok(row_pins.every(Boolean), `${pin_count}-pin row ${row_index} is fully drawable`);
    const present = row_pins;
    rows.push({
      center_y: present.reduce((sum, pin) => sum + pin.y, 0) / present.length,
      top: Math.min(...present.map((pin) => pin.y - pin.height / 2)),
      bottom: Math.max(...present.map((pin) => pin.y + pin.height / 2)),
    });
  }
  return rows;
}

function assert_inside_canvas(body, label) {
  assert.ok(
    body.x - body.width / 2 >= 0 && body.x + body.width / 2 <= canvas.width,
    `${label} stays horizontally inside the lane canvas`,
  );
  assert.ok(
    body.y - body.height / 2 >= 0 && body.y + body.height / 2 <= canvas.height,
    `${label} stays vertically inside the lane canvas`,
  );
}

function assert_complete_scene(pin_count, candidate) {
  const commands = draw(pin_count, create_camera_state(pin_count, false, candidate));
  const lane = get_lane(commands);
  const ball = commands.find((command) => command.kind === "ball");
  const pins = get_pins(commands);
  assert.ok(ball, `${pin_count}-pin ${candidate} aiming ball draws`);
  assert.equal(pins.length, pin_count, `${pin_count}-pin ${candidate} complete rack draws`);
  for (const point of [
    ...lane.geometry.lane_near,
    ...lane.geometry.lane_far,
    ...lane.geometry.rail_near,
    ...lane.geometry.rail_far,
  ]) {
    assert.ok(
      Number.isFinite(point.x) &&
        Number.isFinite(point.y) &&
        point.x >= 0 &&
        point.x <= canvas.width &&
        point.y >= 0 &&
        point.y <= canvas.height,
      `${pin_count}-pin ${candidate} complete lane point stays inside`,
    );
  }
  assert_inside_canvas(ball, `${pin_count}-pin ${candidate} aiming ball`);
  for (const pin of pins) assert_inside_canvas(pin, `${pin_count}-pin ${candidate} rack pin`);
  return { ball, pins };
}

test("derives immutable bounds from each authoritative complete rack", () => {
  for (const pin_count of rack_pin_counts) {
    const rack = create_rack(pin_count);
    const bounds = create_rack_bounds(pin_count);
    assert.deepEqual(
      [bounds.left, bounds.right, bounds.front, bounds.back],
      [rack.bounds.min_x, rack.bounds.max_x, rack.bounds.min_y, rack.bounds.max_y],
    );
  }
});

test("limits camera candidate URL selection to the camera-deck bakeoff fixture", () => {
  for (const candidate of camera_candidates) {
    assert.equal(
      parse_camera_candidate_search(`?fixture=camera_deck&camera_candidate=${candidate}`),
      candidate,
    );
  }
  for (const search of [
    "",
    "?fixture=camera_deck",
    "?camera_candidate=dense",
    "?fixture=perfect_game&camera_candidate=dense",
    "?fixture=camera_deck&camera_candidate=not-a-candidate",
  ]) {
    assert.equal(parse_camera_candidate_search(search), undefined, search);
  }
});

test("uses the camera-deck URL only as a default and honors explicit camera state", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  if (descriptor) delete globalThis.window;
  try {
    assert.equal(resolve_default_camera_candidate(), default_camera_candidate);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "window", descriptor);
  }

  with_window_search("?fixture=camera_deck&camera_candidate=open", () => {
    assert.equal(resolve_default_camera_candidate(), "open");
    assert.equal(create_camera_state(10, false).candidate, "open");
    assert.equal(create_camera_state(10, false, "dense").candidate, "dense");
  });
});

test("holds one stable framing and horizon through aiming, rolling, settled, and reduced motion", () => {
  for (const pin_count of rack_pin_counts) {
    const aiming = create_camera_state(pin_count, false);
    const rolling = advance_camera_for_ball(aiming, aiming.rack_bounds.front / 2, false);
    const settled = advance_camera_for_ball(rolling, aiming.rack_bounds.back + 10, false);
    const reduced = advance_camera_for_ball(
      with_reduced_motion(settled, true),
      settled.rack_bounds.back,
      true,
    );
    const baseline = create_camera_projection(aiming, canvas.width, canvas.height);
    for (const state of [rolling, settled, reduced]) {
      const projection = create_camera_projection(state, canvas.width, canvas.height);
      assert.deepEqual(projection.horizon, baseline.horizon);
      assert.deepEqual(projection.camera, baseline.camera);
      assert.equal(state.rack_bounds, aiming.rack_bounds);
    }
    assert.ok(rolling.shot_progress > 0 && settled.shot_progress >= rolling.shot_progress);
    assert.equal(reduced.shot_progress, 0);
    assert.equal(reset_camera_for_roll(settled).shot_progress, 0);
  }
});

test("keeps all legal aiming scenes inside the measured 16:10 play canvas", () => {
  for (const pin_count of rack_pin_counts) {
    const limits = aim_limits(pin_count);
    for (const lateral_offset of [limits.minimum_start_position, limits.maximum_start_position]) {
      const commands = draw(pin_count, create_camera_state(pin_count, false), lateral_offset);
      const lane = get_lane(commands);
      const ball = commands.find((command) => command.kind === "ball");
      const pins = get_pins(commands);
      assert.ok(ball, `${pin_count}-pin legal aiming ball draws`);
      assert.equal(pins.length, pin_count, `${pin_count}-pin complete rack draws`);
      for (const point of [...lane.geometry.lane_near, ...lane.geometry.rail_near]) {
        assert.ok(
          point.x >= 0 && point.x <= canvas.width && point.y >= 0 && point.y <= canvas.height,
        );
      }
      assert_inside_canvas(ball, `${pin_count}-pin legal aiming ball`);
      for (const pin of pins) assert_inside_canvas(pin, `${pin_count}-pin legal aiming pin`);
    }
  }
});

test("gives the 21-pin active lane and rack a useful share of the action field", () => {
  const commands = draw(21, create_camera_state(21, false, default_camera_candidate));
  const { ball, pins } = assert_complete_scene(21, default_camera_candidate);
  const lane = get_lane(commands);
  const rack_left = Math.min(...pins.map((pin) => pin.x - pin.width / 2));
  const rack_right = Math.max(...pins.map((pin) => pin.x + pin.width / 2));
  const launch_platform_fraction =
    (lane.geometry.lane_near[0].y - lane.geometry.foul_line[0].y) / canvas.height;
  assert.ok(
    launch_platform_fraction <= camera_config.maximum_launch_platform_screen_fraction,
    "the inactive launch platform stays inside its hierarchy budget",
  );
  assert.ok(
    ball.y + ball.height / 2 >= lane.geometry.foul_line[0].y &&
      ball.y + ball.height / 2 <= lane.geometry.lane_near[0].y,
    "the aiming ball stays grounded on the compact launch platform",
  );
  assert.ok(
    (rack_right - rack_left) / canvas.width >= 0.2,
    "the complete rack occupies at least one fifth of the lane width",
  );
});

test("reports dense, ordered rows without a blank band and keeps candidate variants responsive", () => {
  for (const pin_count of [10, 105, 990]) {
    const diagnostics = camera_candidates.map((candidate) => row_diagnostic(pin_count, candidate));
    for (const rows of diagnostics) {
      for (let index = 1; index < rows.length; index += 1) {
        const previous = rows[index - 1];
        const current = rows[index];
        assert.ok(
          previous.center_y > current.center_y,
          `${pin_count}-pin rows remain depth ordered`,
        );
        assert.ok(
          previous.top - current.bottom <= 0,
          `${pin_count}-pin adjacent rows do not form a separated empty band`,
        );
        assert.ok(
          [
            previous.center_y,
            previous.top,
            previous.bottom,
            current.center_y,
            current.top,
            current.bottom,
          ].every(Number.isFinite),
          `${pin_count}-pin row diagnostic remains finite`,
        );
      }
    }
    if (pin_count === 105) {
      const first_row_centers = diagnostics.map((rows) => rows[0].center_y);
      assert.ok(
        first_row_centers.every(
          (center_y, index) => index === 0 || first_row_centers[index - 1] < center_y,
        ),
        "105-pin candidates open the front row monotonically while sharing the rear target",
      );
    }
    assert.ok(
      camera_candidates.includes(default_camera_candidate),
      "the shipped camera candidate remains one of the visually reviewed variants",
    );
  }
});

test("calibrates every selected mode from adaptable reveal and full-rack framing targets", () => {
  const expected_targets = [0.03, 0.06, 0.1];
  for (const pin_count of [10, 105, 990]) {
    const achieved_reveals = [];
    const depth_exaggerations = [];
    for (const candidate of camera_candidates) {
      const projection = create_camera_projection(
        create_camera_state(pin_count, false, candidate),
        canvas.width,
        canvas.height,
      );
      const diagnostics = projection.camera;
      const target = camera_candidate_profiles[candidate].target_reveal_fraction;
      assert.equal(
        target,
        expected_targets[achieved_reveals.length],
        `${candidate} target is explicit`,
      );
      assert.equal(
        diagnostics.target_reveal_fraction,
        target,
        `${pin_count}-pin target reaches projection`,
      );
      assert.ok(
        Math.abs(diagnostics.achieved_median_reveal_fraction - target) <= 0.004,
        `${pin_count}-pin ${candidate} measured reveal tracks its target`,
      );
      assert.equal(
        diagnostics.calibration_clamped,
        false,
        `${pin_count}-pin ${candidate} reveal solves`,
      );
      assert.equal(
        diagnostics.framing_clamped,
        false,
        `${pin_count}-pin ${candidate} framing solves`,
      );
      assert.equal(
        diagnostics.calibration_reason,
        "solved",
        `${pin_count}-pin ${candidate} is honest`,
      );
      assert.equal(diagnostics.framing_reason, "solved", `${pin_count}-pin ${candidate} is honest`);
      assert.ok(
        diagnostics.achieved_rack_top_fraction >= 0.02 &&
          diagnostics.achieved_rack_top_fraction <= 0.06,
        `${pin_count}-pin ${candidate} complete rack crown uses the 2-6% top margin`,
      );
      assert.ok(
        diagnostics.achieved_launch_platform_screen_fraction > 0 &&
          diagnostics.achieved_launch_platform_screen_fraction <=
            diagnostics.maximum_launch_platform_screen_fraction,
        `${pin_count}-pin ${candidate} launch platform stays inside its hierarchy budget`,
      );
      assert.ok(
        diagnostics.achieved_aiming_ball_bottom_fraction >=
          1 - diagnostics.maximum_launch_platform_screen_fraction &&
          diagnostics.achieved_aiming_ball_bottom_fraction <= 0.99,
        `${pin_count}-pin ${candidate} aiming ball remains attached to the launch platform`,
      );
      assert.ok(
        diagnostics.occupied_vertical_span_fraction >= 0.88,
        `${pin_count}-pin ${candidate} complete lane/rack/ball span is at least 88%`,
      );
      assert.ok(
        [
          diagnostics.depth_exaggeration,
          diagnostics.reveal_residual_fraction,
          diagnostics.horizon_fraction,
          diagnostics.unused_top_fraction,
          diagnostics.unused_bottom_fraction,
          diagnostics.achieved_launch_platform_screen_fraction,
          ...diagnostics.row_reveal_fractions,
        ].every(Number.isFinite),
        `${pin_count}-pin ${candidate} diagnostics are finite`,
      );
      assert.ok(
        Math.abs(diagnostics.reveal_residual_fraction) <= 0.004,
        `${pin_count}-pin ${candidate} reveal residual is honest`,
      );
      assert.equal(
        diagnostics.row_reveal_fractions.length,
        (Math.sqrt(8 * pin_count + 1) - 1) / 2 - 1,
        `${pin_count}-pin ${candidate} reports every adjacent rack row`,
      );
      assert_complete_scene(pin_count, candidate);
      achieved_reveals.push(diagnostics.achieved_median_reveal_fraction);
      depth_exaggerations.push(diagnostics.depth_exaggeration);
    }
    for (let index = 1; index < achieved_reveals.length; index += 1) {
      assert.ok(
        achieved_reveals[index - 1] < achieved_reveals[index],
        `${pin_count}-pin candidates increase measured reveal`,
      );
      assert.ok(
        depth_exaggerations[index - 1] < depth_exaggerations[index],
        `${pin_count}-pin candidates increase deck exaggeration`,
      );
    }
  }
});

test("keeps complete-rack-derived framing identical through roll, partial, settled, and reduced states", () => {
  for (const pin_count of [10, 105, 990]) {
    for (const candidate of camera_candidates) {
      const aiming = create_camera_state(pin_count, false, candidate);
      const rolling = advance_camera_for_ball(aiming, aiming.rack_bounds.front / 2, false);
      const settled = advance_camera_for_ball(rolling, aiming.rack_bounds.back + 10, false);
      const reduced = with_reduced_motion(settled, true);
      const baseline = create_camera_projection(aiming, canvas.width, canvas.height);
      for (const state of [rolling, settled, reduced]) {
        const projection = create_camera_projection(state, canvas.width, canvas.height);
        assert.deepEqual(
          projection,
          baseline,
          `${pin_count}-pin ${candidate} framing never follows a shot`,
        );
      }

      const partial = create_snapshot(pin_count);
      fill_rack(partial, pin_count);
      for (let pin_index = 0; pin_index < pin_count; pin_index += 2)
        partial[pin_index * pin_snapshot_stride + snapshot_removed_flag_offset] = 1;
      const partial_commands = create_game_draw_commands(
        partial,
        partial,
        pin_count,
        1,
        canvas.width,
        canvas.height,
        undefined,
        settled,
      );
      assert.equal(
        get_pins(partial_commands).length,
        Math.floor(pin_count / 2),
        `${pin_count}-pin partial rack removes survivors without changing the camera input`,
      );
      assert.deepEqual(
        create_camera_projection(settled, canvas.width, canvas.height),
        baseline,
        `${pin_count}-pin ${candidate} partial rack retains complete-rack framing`,
      );
    }
  }
});
