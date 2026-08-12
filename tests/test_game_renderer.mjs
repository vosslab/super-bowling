import assert from "node:assert/strict";
import test from "node:test";

import { normalize_ball_design } from "../src/designer/ball_design.ts";
import { ball_radius, pin_radius } from "../src/config/lane.ts";
import { get_ball_hole_commands } from "../src/render/ball.ts";
import { advance_camera_for_ball, create_camera_state } from "../src/render/camera.ts";
import { create_camera_projection } from "../src/render/camera_projection.ts";
import {
  create_impact_accent_command,
  derive_ball_roll_angle,
  derive_ball_surface_offset,
  create_game_draw_commands,
} from "../src/render/game_renderer.ts";
import { derive_fallen_pin_presentation } from "../src/render/fallen_pin_presentation.ts";
import { project_world_point } from "../src/render/projection.ts";
import { create_rack } from "../src/simulation/rack.ts";
import {
  canonical_fallen_pin_angle,
  choose_pin_sprite,
  draw_pin,
  get_pin_shadow_geometry,
  get_pin_vertical_extent,
} from "../src/render/pins.ts";
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

function point_is_inside_projected_lane(point, lane) {
  const corners = [
    lane.geometry.lane_near[0],
    lane.geometry.lane_near[1],
    lane.geometry.lane_far[1],
    lane.geometry.lane_far[0],
  ];
  let inside = false;
  for (let index = 0; index < corners.length; index += 1) {
    const current = corners[index];
    const next = corners[(index + 1) % corners.length];
    assert.ok(current && next);
    const crosses_y = current.y > point.y !== next.y > point.y;
    const edge_x =
      ((next.x - current.x) * (point.y - current.y)) / (next.y - current.y) + current.x;
    if (crosses_y && point.x < edge_x) inside = !inside;
  }
  return inside;
}

function line_reaches_horizon(first, second, horizon) {
  const line_x = second.x - first.x;
  const line_y = second.y - first.y;
  const horizon_x = horizon.x - first.x;
  const horizon_y = horizon.y - first.y;
  const cross_product = line_x * horizon_y - line_y * horizon_x;
  const scale = Math.max(1, Math.hypot(line_x, line_y) * Math.hypot(horizon_x, horizon_y));
  return Math.abs(cross_product) <= geometry_tolerance * scale;
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
      return (
        [command.x, command.y, command.width, command.height, command.angle].every(
          Number.isFinite,
        ) &&
        [command.lift, command.motion_energy, command.trail_x, command.trail_y].every(
          Number.isFinite,
        )
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

  const rolling = new Float32Array(snapshot);
  rolling[ball_offset + snapshot_y_offset] = 2;
  const rolling_ball = create_game_draw_commands(rolling, rolling, 10, 1, 1600, 1000).find(
    (command) => command.kind === "ball",
  );
  assert.ok(rolling_ball);
  assert.ok(rolling_ball.y < opening_ball.y);
  const projection = create_camera_projection(create_camera_state(10));
  assert.ok(projection.near_y < rack.bounds.min_y && projection.far_y > rack.bounds.max_y);
});

test("projects standing pin bodies monotonically smaller with depth", () => {
  for (const pin_count of [10, 105, 990]) {
    const snapshot = create_rack_snapshot(pin_count);
    const pins = create_game_draw_commands(snapshot, snapshot, pin_count, 1, 1600, 1000)
      .filter((command) => command.kind === "standing_pin")
      .sort((first, second) => first.base_depth - second.base_depth);
    assert.equal(pins.length, pin_count);
    for (let index = 1; index < pins.length; index += 1) {
      const previous = pins[index - 1];
      const current = pins[index];
      assert.ok(previous && current);
      if (current.base_depth > previous.base_depth + geometry_tolerance) {
        assert.ok(current.width < previous.width, `${pin_count}-pin width decreases with depth`);
        assert.ok(current.height < previous.height, `${pin_count}-pin height decreases with depth`);
      }
    }
  }
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

test("projects board arrows and lane marks inside the painted lane", () => {
  for (const pin_count of [10, 105, 990]) {
    const snapshot = create_rack_snapshot(pin_count);
    const lane = get_lane_command(
      create_game_draw_commands(snapshot, snapshot, pin_count, 1, 1600, 1000),
    );
    assert.ok(lane.geometry.arrows.length > 0);
    assert.ok(lane.geometry.gutter_world_width > 0);
    const marks = lane.geometry.guide_dots;
    assert.ok(marks.length > 0);
    for (const mark of marks) {
      assert.ok(Number.isFinite(mark.x) && Number.isFinite(mark.y));
      assert.ok(point_is_inside_projected_lane(mark, lane));
    }
    for (const arrow of lane.geometry.arrows) {
      assert.ok([arrow.x, arrow.y, arrow.size, arrow.tip_y, arrow.base_y].every(Number.isFinite));
      assert.ok(arrow.size > 0);
      for (const point of [
        { x: arrow.x - arrow.size, y: arrow.base_y },
        { x: arrow.x + arrow.size, y: arrow.base_y },
        { x: arrow.x, y: arrow.tip_y },
        { x: arrow.x, y: arrow.base_y },
      ]) {
        assert.ok(point_is_inside_projected_lane(point, lane));
      }
    }
  }
});

test("keeps every initial rack inside the painted projected composition", () => {
  for (const pin_count of [10, 105, 990]) {
    const snapshot = create_rack_snapshot(pin_count);
    const commands = create_game_draw_commands(snapshot, snapshot, pin_count, 1, 1600, 1000);
    const lane = get_lane_command(commands);
    const pins = commands.filter((command) => command.kind === "standing_pin");
    assert.equal(pins.length, pin_count);
    for (const pin of pins) {
      assert.ok(
        point_is_inside_projected_lane({ x: pin.x, y: pin.y + pin.height / 2 }, lane),
        `${pin_count}-pin base remains inside the painted lane`,
      );
      assert.ok(
        pin.x - pin.width / 2 >= 0 &&
          pin.x + pin.width / 2 <= 1600 &&
          pin.y - pin.height / 2 >= 0 &&
          pin.y + pin.height / 2 <= 1000,
      );
    }
  }
});

test("anchors each upright sprite foot to its projected physical lane base", () => {
  for (const pin_count of [10, 105, 990]) {
    const snapshot = create_rack_snapshot(pin_count);
    const pins = create_game_draw_commands(snapshot, snapshot, pin_count, 1, 1600, 1000).filter(
      (command) => command.kind === "standing_pin",
    );
    assert.equal(pins.length, pin_count);
    for (const pin of pins) {
      assert.ok(Math.abs(pin.x - pin.ground_x) < geometry_tolerance);
      assert.ok(Math.abs(pin.y + pin.height / 2 - pin.ground_y) < geometry_tolerance);
    }
  }
});

test("keeps physical ball and pin scale invariant across mode-specific cameras", () => {
  for (const at_result of [false, true]) {
    for (const pin_count of [10, 105, 990]) {
      const snapshot = create_snapshot(pin_count);
      const lane_camera = create_camera_state(pin_count);
      const camera = at_result
        ? advance_camera_for_ball(lane_camera, lane_camera.rack_bounds.front)
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
      const ball = commands.find((command) => command.kind === "ball");
      const pin = get_pin_command(commands, 0);
      assert.ok(ball);
      assert.ok(
        Math.abs(ball.width / pin.width - ball_radius / pin_radius) <= geometry_tolerance,
        `${pin_count}-pin camera retains the world-space ball-to-pin width ratio`,
      );
      assert.equal(ball.width, ball.height);
    }
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
    create_camera_state(10),
    create_camera_state(10).rack_bounds.front,
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

test("uses fallen-pin velocity for a short lift and motion trail that settle back to rest", () => {
  const settled_snapshot = create_snapshot(10);
  settled_snapshot[snapshot_state_flag_offset] = 1;
  const moving_snapshot = new Float32Array(settled_snapshot);
  moving_snapshot[snapshot_velocity_x_offset] = 9;
  moving_snapshot[snapshot_velocity_y_offset] = -3;

  const settled = get_pin_command(
    create_game_draw_commands(settled_snapshot, settled_snapshot, 10, 1, 1600, 1000),
    0,
  );
  const moving = get_pin_command(
    create_game_draw_commands(moving_snapshot, moving_snapshot, 10, 1, 1600, 1000),
    0,
  );

  assert.deepEqual(
    [settled.motion_energy, settled.lift, Math.hypot(settled.trail_x, settled.trail_y)],
    [0, 0, 0],
  );
  assert.ok(
    moving.motion_energy > 0 &&
      moving.lift > 0 &&
      Math.hypot(moving.trail_x, moving.trail_y) > 0 &&
      moving.y < settled.y,
    "only the physically moving pin receives lift and a directional exposure",
  );
});

test("keeps a resting fallen pin's dimensional pose stable through tiny axis corrections", () => {
  const first = derive_fallen_pin_presentation(7, 0.4, 0, 0, 0);
  const corrected = derive_fallen_pin_presentation(7, 0.4001, 0, 0, 0);

  assert.deepEqual(corrected, first);
});

test("keeps transformed pin bodies above their contact and shadows entirely below it", () => {
  for (const angle of [undefined, -Math.PI / 2, -0.65, 0]) {
    const snapshot = create_snapshot(10);
    if (angle !== undefined) {
      snapshot[snapshot_state_flag_offset] = 1;
      snapshot[snapshot_fallen_axis_angle_offset] = angle;
    }
    const pin = get_pin_command(
      create_game_draw_commands(snapshot, snapshot, 10, 1, 1600, 1000),
      0,
    );
    const body_bottom = pin.y + get_pin_vertical_extent(pin);
    const shadow = get_pin_shadow_geometry(pin);
    assert.ok(body_bottom <= pin.ground_y);
    assert.ok(shadow.y - shadow.radius_y > pin.ground_y);
  }
});

test("shows a directional motion cue on an upright pin receiving force", () => {
  const idle_snapshot = create_snapshot(10);
  const moving_snapshot = new Float32Array(idle_snapshot);
  moving_snapshot[snapshot_velocity_x_offset] = 9;
  moving_snapshot[snapshot_velocity_y_offset] = 2;

  const idle = get_pin_command(
    create_game_draw_commands(idle_snapshot, idle_snapshot, 10, 1, 1600, 1000),
    0,
  );
  const moving = get_pin_command(
    create_game_draw_commands(moving_snapshot, moving_snapshot, 10, 1, 1600, 1000),
    0,
  );

  assert.deepEqual(
    [idle.motion_energy, idle.lift, Math.hypot(idle.trail_x, idle.trail_y)],
    [0, 0, 0],
  );
  assert.ok(
    moving.motion_energy > 0 && moving.lift > 0 && moving.trail_x < 0,
    "the exposure follows the physical velocity and trails behind it",
  );
});

test("uses a fallen pin's authoritative axis turn as a motion cue", () => {
  const previous = create_snapshot(10);
  const current = create_snapshot(10);
  previous[snapshot_state_flag_offset] = 1;
  current[snapshot_state_flag_offset] = 1;
  previous[snapshot_fallen_axis_angle_offset] = -0.5;
  current[snapshot_fallen_axis_angle_offset] = 0.5;

  const pin = get_pin_command(create_game_draw_commands(previous, current, 10, 0.5, 1600, 1000), 0);

  assert.ok(pin.motion_energy > 0);
});

test("projects an impact accent from its physical rack-local centroid", () => {
  const projection = create_camera_projection(create_camera_state(105), 1600, 1000);
  const state = {
    presentation: { x: 2.5, y: 18, strength: 0.8, first_contact: true },
    recorded_at_ms: 1_000,
  };
  const command = create_impact_accent_command(state, 1_030, projection);
  const expected = project_world_point(projection, { x: 2.5, y: 18, z: 0.025 });
  assert.ok(command && expected);
  assert.ok(
    Math.abs(command.x - expected.x) < geometry_tolerance &&
      Math.abs(command.y - expected.y) < geometry_tolerance,
    "the accent stays at the physical rack-local impact centroid",
  );
});

test("draws fallen pins crown-up while retaining their undirected capsule axis", () => {
  const fixture_angles = [-2.8, -Math.PI / 2, -0.15, 0, 0.15, Math.PI / 2, 2.8];
  for (const physical_axis_angle of fixture_angles) {
    const canonical_angle = canonical_fallen_pin_angle(physical_axis_angle);
    // The fallen SVG's crown is at its positive local x end. After rotation,
    // this is the sign of its screen-space vertical offset from the base.
    assert.ok(
      Math.sin(canonical_angle) <= 0.000001,
      `crown must remain at or above base for ${physical_axis_angle}`,
    );
    assert.ok(
      Math.abs(Math.sin(physical_axis_angle - canonical_angle)) < 0.000001,
      `canonical angle must preserve the same undirected capsule axis for ${physical_axis_angle}`,
    );

    let rendered_angle;
    const context = {
      globalAlpha: 1,
      fillStyle: "",
      save() {},
      restore() {},
      beginPath() {},
      ellipse() {},
      fill() {},
      setTransform(cosine, sine) {
        rendered_angle = Math.atan2(sine, cosine);
      },
      resetTransform() {},
      drawImage() {},
    };
    draw_pin(
      context,
      { upright: {}, fallen: {} },
      {
        kind: "fallen_pin",
        x: 400,
        y: 300,
        ground_x: 400,
        ground_y: 300,
        width: 60,
        height: 18,
        angle: physical_axis_angle,
        lift: 0,
        motion_energy: 0,
        trail_x: 0,
        trail_y: 0,
      },
    );
    assert.equal(rendered_angle, canonical_angle);
  }
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

test("rolls finger holes over the spherical face instead of wiggling them sideways", () => {
  const state = {
    x: 100,
    y: 100,
    width: 60,
    height: 60,
    roll_angle: 0,
    surface_offset: 0,
    design: normalize_ball_design({}),
  };
  const opening_holes = get_ball_hole_commands(state);
  const rolling_holes = get_ball_hole_commands({ ...state, surface_offset: 0.35 });
  const hidden_holes = get_ball_hole_commands({ ...state, surface_offset: Math.PI });
  assert.equal(opening_holes.length, 3);
  assert.equal(rolling_holes.length, 3);
  assert.ok(rolling_holes.every((hole, index) => hole.x === opening_holes[index].x));
  assert.ok(rolling_holes.some((hole, index) => hole.y !== opening_holes[index].y));
  assert.equal(hidden_holes.length, 0);
});

test("derives one radian of visible roll from one ball radius of forward travel", () => {
  assert.equal(derive_ball_surface_offset(0), 0);
  assert.ok(Math.abs(derive_ball_surface_offset(ball_radius) - 1) < 0.001);
});

test("projects lane edges toward the shared forward vanishing point", () => {
  const fixtures = [
    { pin_count: 10, at_result: false },
    { pin_count: 10, at_result: true },
    { pin_count: 105, at_result: false },
    { pin_count: 105, at_result: true },
    { pin_count: 990, at_result: false },
    { pin_count: 990, at_result: true },
  ];
  for (const fixture of fixtures) {
    const lane_camera = create_camera_state(fixture.pin_count);
    const camera = fixture.at_result
      ? advance_camera_for_ball(lane_camera, lane_camera.rack_bounds.front)
      : lane_camera;
    const lane = get_lane_command(
      create_game_draw_commands(
        create_snapshot(fixture.pin_count),
        create_snapshot(fixture.pin_count),
        fixture.pin_count,
        1,
        1600,
        1000,
        undefined,
        camera,
      ),
    );
    for (const [near, far] of [
      [lane.geometry.lane_near[0], lane.geometry.lane_far[0]],
      [lane.geometry.lane_near[1], lane.geometry.lane_far[1]],
      [lane.geometry.rail_near[0], lane.geometry.rail_far[0]],
      [lane.geometry.rail_near[1], lane.geometry.rail_far[1]],
    ]) {
      assert.ok(near && far);
      assert.ok(line_reaches_horizon(near, far, lane.geometry.horizon));
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
