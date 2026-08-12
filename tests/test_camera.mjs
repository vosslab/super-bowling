import assert from "node:assert/strict";
import test from "node:test";

import { aim_limits } from "../src/game/aim.ts";
import { gutter_width, lane_width } from "../src/config/lane.ts";
import { get_rack_pin_count, supported_pin_counts } from "../src/config/pin_counts.ts";
import {
  advance_camera_result,
  advance_camera_for_ball,
  create_camera_state,
  create_rack_bounds,
  get_camera_focus_x,
  get_camera_focus_y_fraction,
  get_camera_zoom,
  reset_camera_for_roll,
  set_camera_collision_zone,
  show_camera_result,
  with_reduced_motion,
} from "../src/render/camera.ts";
import { create_game_draw_commands } from "../src/render/game_renderer.ts";
import { create_camera_projection } from "../src/render/camera_projection.ts";
import { get_pin_screen_bounds } from "../src/render/pins.ts";
import { project_world_point } from "../src/render/projection.ts";
import { frame_camera_result } from "../src/render/result_camera.ts";
import { create_collision_zone } from "../src/render/collision_zone.ts";
import { create_rack } from "../src/simulation/rack.ts";
import {
  ball_snapshot_stride,
  pin_snapshot_stride,
  snapshot_removed_flag_offset,
  snapshot_fallen_axis_angle_offset,
  snapshot_state_flag_offset,
  snapshot_x_offset,
  snapshot_y_offset,
  write_snapshot_ball,
} from "../src/simulation/protocol.ts";

const canvas = { width: 1600, height: 1000 };
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

function draw(pin_count, camera = create_camera_state(pin_count), aim_lateral_offset = 0) {
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

function draw_rolling(pin_count, camera, ball_x, ball_y) {
  const snapshot = create_snapshot(pin_count);
  fill_rack(snapshot, pin_count);
  write_snapshot_ball(snapshot, pin_count * pin_snapshot_stride, {
    x: ball_x,
    y: ball_y,
    velocity_x: 0,
    velocity_y: 0,
    rotation: 0,
    in_pit: false,
  });
  return create_game_draw_commands(
    snapshot,
    snapshot,
    pin_count,
    1,
    canvas.width,
    canvas.height,
    undefined,
    camera,
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

function assert_complete_scene(pin_count, camera = create_camera_state(pin_count)) {
  const commands = draw(pin_count, camera);
  const lane = get_lane(commands);
  const ball = commands.find((command) => command.kind === "ball");
  const pins = get_pins(commands);
  assert.ok(ball, `${pin_count}-pin aiming ball draws`);
  assert.equal(pins.length, pin_count, `${pin_count}-pin complete rack draws`);
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
      `${pin_count}-pin complete lane point stays inside`,
    );
  }
  assert_inside_canvas(ball, `${pin_count}-pin aiming ball`);
  for (const pin of pins) assert_inside_canvas(pin, `${pin_count}-pin rack pin`);
}

function row_diagnostic(pin_count) {
  const rack = create_rack(pin_count);
  const pins = get_pins(draw(pin_count));
  const rows = [];
  const last_row = Math.max(...rack.slots.map((slot) => slot.row_index));
  for (let row_index = 0; row_index <= last_row; row_index += 1) {
    const row_pins = rack.slots
      .filter((slot) => slot.row_index === row_index)
      .map((slot) => pins.find((pin) => pin.pin_index === Number(slot.pin_id)));
    assert.ok(row_pins.every(Boolean), `${pin_count}-pin row ${row_index} is fully drawable`);
    rows.push({
      center_y: row_pins.reduce((sum, pin) => sum + pin.y, 0) / row_pins.length,
      top: Math.min(...row_pins.map((pin) => pin.y - pin.height / 2)),
      bottom: Math.max(...row_pins.map((pin) => pin.y + pin.height / 2)),
    });
  }
  return rows;
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

test("pushes the shared projection toward the deck from release through impact", () => {
  const camera_sequences = [];
  for (const pin_count of rack_pin_counts) {
    const aiming = create_camera_state(pin_count);
    const rolling = advance_camera_for_ball(aiming, aiming.rack_bounds.front / 2);
    const settled = advance_camera_for_ball(rolling, aiming.rack_bounds.back);
    const reduced = with_reduced_motion(settled, true);
    const reset = reset_camera_for_roll(settled);
    camera_sequences.push({ pin_count, aiming, rolling, settled, reduced, reset });
  }

  assert.ok(
    camera_sequences.every(({ aiming, rolling, settled }) => {
      const zooms = [aiming, rolling, settled].map(get_camera_zoom);
      return zooms[0] < zooms[1] && zooms[1] <= zooms[2];
    }),
    "every rack advances toward the deck without retreating",
  );
  assert.ok(
    camera_sequences.every(({ reduced, reset }) =>
      [reduced, reset].every((camera) => get_camera_zoom(camera) === 1 && camera.focus_x === 0),
    ),
    "reduced motion and the next decision return to the neutral centered view",
  );
});

test("keeps rolling zoom and forward camera focus monotonic through noisy ball samples", () => {
  let camera = create_camera_state(990);
  const fractions = [0.48, 0.64, 0.61, 0.78, 0.75, 0.93, 1];
  const states = [];
  for (const fraction of fractions) {
    camera = advance_camera_for_ball(camera, camera.rack_bounds.front * fraction, 0);
    states.push(camera);
  }
  for (let index = 1; index < states.length; index += 1) {
    const previous = states[index - 1];
    const current = states[index];
    assert.ok(current.focus_y >= previous.focus_y, "raw ball corrections cannot reverse focus");
    assert.ok(
      get_camera_zoom(current) >= get_camera_zoom(previous),
      "rolling scale cannot reverse while the ball advances",
    );
    assert.ok(
      get_camera_focus_y_fraction(current) >= get_camera_focus_y_fraction(previous),
      "the forward composition cannot release backward before impact",
    );
  }
});

test("extends the monotonic push through the accepted collision neighborhood", () => {
  const initial = create_camera_state(990);
  const zone = create_collision_zone({
    rack_bounds: initial.rack_bounds,
    committed_path: new Float32Array([
      0,
      0,
      0,
      initial.rack_bounds.front,
      0,
      initial.rack_bounds.back,
    ]),
    ball: { x: 0, y: initial.rack_bounds.front / 2 },
  });
  const committed = set_camera_collision_zone(initial, zone);
  const rack_front = advance_camera_for_ball(committed, initial.rack_bounds.front);
  const collision_edge = advance_camera_for_ball(rack_front, zone.journey_depth);

  assert.ok(
    rack_front.shot_progress < collision_edge.shot_progress,
    "the old rack-front sample remains before the accepted collision neighborhood ends",
  );
  assert.equal(
    collision_edge.shot_progress,
    1,
    "the push completes only at the local collision neighborhood endpoint",
  );
});

test("collision-depth progress ratchets across backward samples and draw cadences", () => {
  const initial = create_camera_state(496);
  const zone = create_collision_zone({
    rack_bounds: initial.rack_bounds,
    committed_path: new Float32Array([
      -2,
      0,
      -2,
      initial.rack_bounds.front,
      -2,
      initial.rack_bounds.back,
    ]),
    ball: { x: -1, y: 0 },
  });
  const committed = set_camera_collision_zone(initial, zone);
  const first = advance_camera_for_ball(committed, zone.journey_depth * 0.7, -1);
  const backward = advance_camera_for_ball(first, zone.journey_depth * 0.5, -1);
  const sparse = advance_camera_for_ball(committed, zone.journey_depth * 0.8, -1);
  const dense = advance_camera_for_ball(first, zone.journey_depth * 0.8, -1);

  assert.ok(
    backward.shot_progress >= first.shot_progress,
    "backward worker interpolation cannot reverse collision-depth progress",
  );
  assert.equal(
    sparse.shot_progress,
    dense.shot_progress,
    "a shared collision-depth sample remains independent of draw cadence",
  );
});

test("a new roll releases the prior collision-depth journey", () => {
  const initial = create_camera_state(496);
  const zone = create_collision_zone({
    rack_bounds: initial.rack_bounds,
    committed_path: new Float32Array([
      0,
      0,
      0,
      initial.rack_bounds.front,
      0,
      initial.rack_bounds.back,
    ]),
    ball: { x: 0, y: 0 },
  });
  const completed = advance_camera_for_ball(
    set_camera_collision_zone(initial, zone),
    zone.journey_depth,
  );
  const reset = reset_camera_for_roll(completed);

  assert.ok(
    reset.shot_progress < completed.shot_progress,
    "the next roll starts a fresh journey instead of inheriting the prior collision endpoint",
  );
});

test("eases each settled impact view into its readable result composition", () => {
  for (const pin_count of rack_pin_counts) {
    const impact = advance_camera_for_ball(
      create_camera_state(pin_count),
      create_camera_state(pin_count).rack_bounds.back,
    );
    const result_start = show_camera_result(impact);
    const result_middle = advance_camera_result(result_start, 0.5);
    const result_end = advance_camera_result(result_middle, 1);
    const zooms = [result_start, result_middle, result_end].map(get_camera_zoom);
    assert.ok(
      zooms[0] >= zooms[1] && zooms[1] >= zooms[2],
      `${pin_count}-pin result view only pulls back after the held impact`,
    );
    assert.equal(
      get_camera_zoom(advance_camera_result(result_end, 2)),
      zooms[2],
      `${pin_count}-pin completed result view remains stable`,
    );
  }
});

test("biases the close shot toward the bounded physical entry corridor", () => {
  const center = create_camera_state(990);
  const left = advance_camera_for_ball(
    center,
    center.rack_bounds.front,
    -(lane_width(990) / 2 + gutter_width / 2),
  );
  const right = advance_camera_for_ball(
    center,
    center.rack_bounds.front,
    lane_width(990) / 2 + gutter_width / 2,
  );
  const center_projection = create_camera_projection(center, canvas.width, canvas.height);
  const left_projection = create_camera_projection(left, canvas.width, canvas.height);
  const right_projection = create_camera_projection(right, canvas.width, canvas.height);
  assert.ok(
    left_projection.horizon.x > center_projection.horizon.x &&
      right_projection.horizon.x < center_projection.horizon.x,
    "left and right entry corridors shift the shared lane projection in opposite directions",
  );
  assert.ok(
    left.focus_x < 0 && right.focus_x > 0,
    "actual left and right approach corridors never collapse back to the head-pin center",
  );
});

test("derives the same approach focus from common physical samples at different draw cadences", () => {
  const initial = create_camera_state(990);
  const samples = [0.35, 0.58, 0.76, 0.92].map((fraction) => ({
    y: initial.rack_bounds.front * fraction,
    x: -6 * fraction,
  }));
  const sparse = samples.map(({ y, x }) => advance_camera_for_ball(initial, y, x));
  const dense = samples.map(({ y, x }, index) => {
    const prior = samples[index - 1];
    const intermediate =
      prior === undefined
        ? initial
        : advance_camera_for_ball(initial, (prior.y + y) / 2, (prior.x + x) / 2);
    return advance_camera_for_ball(intermediate, y, x);
  });
  for (const [index, camera] of sparse.entries()) {
    assert.equal(
      camera.focus_x,
      dense[index]?.focus_x,
      "a common physical snapshot produces the same focus independent of prior draw count",
    );
    assert.equal(
      camera.focus_y,
      dense[index]?.focus_y,
      "a common physical snapshot keeps the same vertical composition at every draw cadence",
    );
  }
  assert.ok(
    sparse.every((camera, index) => index === 0 || camera.focus_x <= sparse[index - 1].focus_x),
    "an unchanging leftward approach moves toward its physical corridor without oscillating",
  );
});

test("keeps the live ball and entry-side rack context on the close approach canvas", () => {
  for (const pin_count of rack_pin_counts) {
    const initial = create_camera_state(pin_count);
    const ball_y = initial.rack_bounds.front * 0.76;
    const gutter_x = lane_width(pin_count) / 2 + gutter_width / 2;
    for (const ball_x of [0, -gutter_x, gutter_x]) {
      const camera = advance_camera_for_ball(initial, ball_y, ball_x);
      const commands = draw_rolling(pin_count, camera, ball_x, ball_y);
      const ball = commands.find((command) => command.kind === "ball");
      assert.ok(ball, `${pin_count}-pin approach draws its real ball`);
      assert_inside_canvas(ball, `${pin_count}-pin close approach ball`);
      const direction = ball_x === 0 ? 0 : Math.sign(ball_x);
      const rack = create_rack(pin_count);
      assert.ok(
        rack.slots.some((slot) => {
          if (direction !== 0 && direction * slot.x < 0) return false;
          const point = project_world_point(create_camera_projection(camera), {
            x: slot.x,
            y: slot.y,
            z: 0.6,
          });
          return (
            point !== undefined &&
            Number.isFinite(point.x) &&
            Number.isFinite(point.y) &&
            point.x >= 0 &&
            point.x <= canvas.width &&
            point.y >= 0 &&
            point.y <= canvas.height
          );
        }),
        `${pin_count}-pin close approach retains an entry-side physical pin`,
      );
    }
  }
});

test("recenters an impact corridor only during the settled result transition", () => {
  const initial = create_camera_state(990);
  const impact = advance_camera_for_ball(initial, initial.rack_bounds.back, -8);
  const result_start = show_camera_result(impact);
  const result_middle = advance_camera_result(result_start, 0.5);
  const result_end = advance_camera_result(result_middle, 1);
  const horizons = [impact, result_start, result_middle, result_end].map(
    (camera) => create_camera_projection(camera, canvas.width, canvas.height).horizon.x,
  );
  const neutral_horizon = create_camera_projection(
    create_camera_state(990),
    canvas.width,
    canvas.height,
  ).horizon.x;
  assert.equal(get_camera_focus_x(impact), get_camera_focus_x(result_start));
  assert.ok(
    horizons[0] === horizons[1] && horizons[1] >= horizons[2] && horizons[2] >= horizons[3],
    "the impact corridor stays through settlement and then moves monotonically toward center",
  );
  assert.equal(horizons[3], neutral_horizon, "the finished result composition is centered");
});

test("keeps legal left and right gutter entries visible with their entry-side rack context", () => {
  for (const pin_count of rack_pin_counts) {
    const rack = create_rack(pin_count);
    const gutter_x = lane_width(pin_count) / 2 + gutter_width / 2;
    for (const direction of [-1, 1]) {
      const initial = create_camera_state(pin_count);
      const impact = advance_camera_for_ball(
        initial,
        initial.rack_bounds.back,
        gutter_x * direction,
      );
      const result_start = show_camera_result(impact);
      assert.equal(
        get_camera_zoom(result_start),
        get_camera_zoom(impact),
        `${pin_count}-pin result begins from the held edge-corridor scale`,
      );
      const projection = create_camera_projection(impact, canvas.width, canvas.height);
      const ball = project_world_point(projection, {
        x: gutter_x * direction,
        y: initial.rack_bounds.front,
        z: 0.3542,
      });
      assert.ok(ball && Number.isFinite(ball.x) && Number.isFinite(ball.y));
      assert.ok(
        ball.x >= 0 && ball.x <= canvas.width && ball.y >= 0 && ball.y <= canvas.height,
        `${pin_count}-pin gutter ball remains on the shared close-shot canvas`,
      );
      const entry = rack.slots
        .filter((slot) => direction * slot.x > 0)
        .map((slot) => project_world_point(projection, { x: slot.x, y: slot.y, z: 0.6 }))
        .find(
          (point) =>
            point !== undefined &&
            Number.isFinite(point.x) &&
            Number.isFinite(point.y) &&
            point.x >= 0 &&
            point.x <= canvas.width &&
            point.y >= 0 &&
            point.y <= canvas.height,
        );
      assert.ok(entry, `${pin_count}-pin entry-side rack context remains on the shared canvas`);
    }
  }
});

test("keeps the complete real ball inside each close collision corridor", () => {
  const initial = create_camera_state(990);
  const contact_depths = [
    initial.rack_bounds.front,
    Math.min(initial.rack_bounds.back, initial.rack_bounds.front + 3),
  ];
  for (const direction of [-1, 0, 1]) {
    const impact_x = direction * (lane_width(990) / 3);
    for (const impact_y of contact_depths) {
      const impact = advance_camera_for_ball(initial, impact_y, impact_x);
      const commands = draw_rolling(990, impact, impact_x, impact_y);
      const ball = commands.find((command) => command.kind === "ball");
      assert.ok(ball, "a held physical impact continues to draw its real ball");
      assert_inside_canvas(ball, "a held physical impact keeps the full ball readable");
    }
  }
});

test("continues to advance through authoritative post-contact ball samples", () => {
  const approaching = advance_camera_for_ball(
    create_camera_state(990),
    create_camera_state(990).rack_bounds.front,
    -5,
  );
  const cascade = advance_camera_for_ball(approaching, approaching.rack_bounds.back, 8);
  assert.ok(
    cascade.focus_y > approaching.focus_y,
    "post-contact ball motion advances camera depth",
  );
  assert.ok(
    cascade.shot_progress >= approaching.shot_progress,
    "post-contact samples preserve monotonic physical progress",
  );
  assert.equal(
    reset_camera_for_roll(cascade).focus_x,
    0,
    "the next roll restores the neutral view",
  );
  assert.equal(
    get_camera_focus_y_fraction(advance_camera_result(show_camera_result(cascade), 1)),
    get_camera_focus_y_fraction(create_camera_state(990)),
    "the settled result releases the impact depth back to the neutral composition",
  );
});

test("fits every visible fallen pin inside the settled result frame", () => {
  const scenarios = [
    { pin_count: 10, fallen_pin_count: 10, scatter: "symmetric" },
    { pin_count: 10, fallen_pin_count: 7, scatter: "right" },
    { pin_count: 990, fallen_pin_count: 990, scatter: "none" },
    { pin_count: 990, fallen_pin_count: 120, scatter: "none" },
  ];
  for (const { pin_count, fallen_pin_count, scatter } of scenarios) {
    const snapshot = create_snapshot(pin_count);
    fill_rack(snapshot, pin_count);
    const rack = create_rack(pin_count);
    for (let pin_index = 0; pin_index < fallen_pin_count; pin_index += 1) {
      const offset = pin_index * pin_snapshot_stride;
      if (scatter === "symmetric") {
        const direction = pin_index % 2 === 0 ? -1 : 1;
        snapshot[offset + snapshot_x_offset] = direction * (5 + pin_index * 0.7);
      } else if (scatter === "right") {
        snapshot[offset + snapshot_x_offset] = 4 + pin_index * 0.7;
        snapshot[offset + snapshot_y_offset] = rack.bounds.min_y + (pin_index % 3) * 1.1;
      }
      snapshot[offset + snapshot_state_flag_offset] = 1;
      snapshot[offset + snapshot_fallen_axis_angle_offset] = (pin_index * Math.PI) / 9;
    }
    const initial = create_camera_state(pin_count);
    const impact = advance_camera_for_ball(initial, initial.rack_bounds.front, 0);
    const result_start = frame_camera_result(impact, snapshot, canvas.width, canvas.height);
    const result_end = advance_camera_result(result_start, 1);
    const commands = create_game_draw_commands(
      snapshot,
      snapshot,
      pin_count,
      1,
      canvas.width,
      canvas.height,
      undefined,
      result_end,
    );
    const fallen = commands.filter((command) => command.kind === "fallen_pin");
    assert.equal(fallen.length, fallen_pin_count);
    const fallen_bounds = fallen.map(get_pin_screen_bounds);
    assert.ok(
      fallen_bounds.every((bounds) => {
        return (
          bounds.left >= 0 &&
          bounds.right <= canvas.width &&
          bounds.top >= 0 &&
          bounds.bottom <= canvas.height
        );
      }),
      `${pin_count}-pin result retains every complete fallen-pin sprite after ${fallen_pin_count} falls`,
    );
    const envelope = {
      left: Math.min(...fallen_bounds.map((bounds) => bounds.left)),
      right: Math.max(...fallen_bounds.map((bounds) => bounds.right)),
      top: Math.min(...fallen_bounds.map((bounds) => bounds.top)),
      bottom: Math.max(...fallen_bounds.map((bounds) => bounds.bottom)),
    };
    assert.ok(
      Math.abs((envelope.left + envelope.right) / 2 - canvas.width / 2) < 0.000001,
      `${pin_count}-pin result centers its settled horizontal footprint`,
    );
    assert.ok(
      Math.abs((envelope.top + envelope.bottom) / 2 - canvas.height / 2) < 0.000001,
      `${pin_count}-pin result centers its settled vertical footprint`,
    );
  }
});

test("keeps every legal aiming scene inside a representative play canvas", () => {
  for (const pin_count of rack_pin_counts) {
    const limits = aim_limits(pin_count);
    for (const lateral_offset of [limits.minimum_start_position, limits.maximum_start_position]) {
      const commands = draw(pin_count, create_camera_state(pin_count), lateral_offset);
      const ball = commands.find((command) => command.kind === "ball");
      assert.ok(ball, `${pin_count}-pin legal aiming ball draws`);
      assert_inside_canvas(ball, `${pin_count}-pin legal aiming ball`);
      for (const pin of get_pins(commands)) {
        assert_inside_canvas(pin, `${pin_count}-pin legal aiming pin`);
      }
    }
  }
});

test("keeps complete rack rows visible and depth ordered", () => {
  for (const pin_count of rack_pin_counts) {
    const rows = row_diagnostic(pin_count);
    for (let index = 1; index < rows.length; index += 1) {
      const previous = rows[index - 1];
      const current = rows[index];
      assert.ok(previous.center_y > current.center_y, `${pin_count}-pin rows remain depth ordered`);
      assert.ok(previous.top <= current.bottom, `${pin_count}-pin adjacent rows remain visible`);
      assert.ok(
        [previous.center_y, previous.top, previous.bottom, current.center_y, current.bottom].every(
          Number.isFinite,
        ),
      );
    }
  }
});

test("ships finite, unclipped camera projections for every rack", () => {
  for (const pin_count of rack_pin_counts) {
    const camera = create_camera_state(pin_count);
    const projection = create_camera_projection(camera, canvas.width, canvas.height);
    assert.ok(
      [
        projection.camera.depth_exaggeration,
        projection.camera.horizon_fraction,
        projection.camera.occupied_vertical_span_fraction,
        ...projection.camera.row_reveal_fractions,
      ].every(Number.isFinite),
      `${pin_count}-pin projection diagnostics remain finite`,
    );
    assert.ok(
      projection.camera.row_reveal_fractions.every((fraction) => fraction > 0),
      `${pin_count}-pin projection leaves every adjacent rack row visible`,
    );
    assert_complete_scene(pin_count, camera);
  }
});

test("partial racks retain the complete-rack camera", () => {
  for (const pin_count of rack_pin_counts) {
    const camera = create_camera_state(pin_count);
    const baseline = create_camera_projection(camera, canvas.width, canvas.height);
    const partial = create_snapshot(pin_count);
    fill_rack(partial, pin_count);
    for (let pin_index = 0; pin_index < pin_count; pin_index += 2) {
      partial[pin_index * pin_snapshot_stride + snapshot_removed_flag_offset] = 1;
    }
    const commands = create_game_draw_commands(
      partial,
      partial,
      pin_count,
      1,
      canvas.width,
      canvas.height,
      undefined,
      camera,
    );
    assert.equal(get_pins(commands).length, Math.floor(pin_count / 2));
    assert.deepEqual(create_camera_projection(camera, canvas.width, canvas.height), baseline);
  }
});
