import { mkdir, writeFile } from "node:fs/promises";

import { deck_depth, foul_to_head_pin } from "../src/config/lane.ts";
import { get_settle_max_seconds, physics_config } from "../src/config/physics.ts";
import { pin_snapshot_stride, read_snapshot_ball } from "../src/simulation/protocol.ts";
import { create_simulation_world } from "../src/simulation/world.ts";

const high_power_high_spin_launch = Object.freeze({
  power: 60,
  start_position: 0,
  angle: 0,
  spin: 4,
});

function ball_snapshot(world) {
  const snapshot = world.create_snapshot();
  return read_snapshot_ball(snapshot.data, snapshot.pin_count * pin_snapshot_stride);
}

async function run_candidate(candidate) {
  const world = await create_simulation_world(990, {
    deck_assist_enabled: candidate.deck_assist_enabled,
  });
  const backstop_y = foul_to_head_pin + deck_depth(990);
  const trace = [];
  const runtime_collider_mass = world.get_ball_collision_profile().mass;
  let time_to_backstop_seconds;
  let settled = false;
  let timed_out = false;
  let error;
  let previous_drive_active = false;
  let previous_in_pit = false;
  try {
    world.launch(
      candidate.launch.power,
      candidate.launch.start_position,
      candidate.launch.angle,
      candidate.launch.spin,
    );
    const maximum_steps = Math.ceil(
      get_settle_max_seconds(990) / physics_config.fixed_step_seconds,
    );
    for (let step = 0; step < maximum_steps && !settled && !timed_out; step += 1) {
      try {
        const result = world.step_fixed();
        settled = result.settled;
        timed_out = result.timed_out;
      } catch (candidate_error) {
        error =
          candidate_error instanceof Error ? candidate_error.message : String(candidate_error);
        break;
      }
      const ball = ball_snapshot(world);
      const drive = world.get_ball_drive_diagnostics();
      if (drive.deck_assist_active) {
        const reconstructed_world_force =
          drive.deck_assist_force_lbf *
          32.174 *
          drive.deck_assist_geometry_scale *
          drive.deck_assist_geometry_factor *
          drive.deck_assist_fade;
        if (
          !Number.isFinite(drive.deck_assist_force_lbf) ||
          !Number.isFinite(drive.deck_assist_force_world) ||
          drive.deck_assist_force_lbf <= 0 ||
          drive.deck_assist_geometry_scale <= 0 ||
          drive.deck_assist_geometry_factor <= 0 ||
          Math.abs(reconstructed_world_force - drive.deck_assist_force_world) > 0.000001
        ) {
          throw new Error("Deck-assist lbf/world conversion is invalid.");
        }
      }
      if (time_to_backstop_seconds === undefined && ball.y >= backstop_y) {
        time_to_backstop_seconds = (step + 1) * physics_config.fixed_step_seconds;
      }
      if (
        step % 60 === 0 ||
        drive.deck_assist_active !== previous_drive_active ||
        (ball.in_pit && !previous_in_pit) ||
        settled ||
        timed_out
      ) {
        trace.push({
          seconds: (step + 1) * physics_config.fixed_step_seconds,
          x: ball.x,
          y: ball.y,
          speed: Math.hypot(ball.velocity_x, ball.velocity_y),
          forward_progress_speed: drive.forward_progress_speed,
          drive_force_lbf: drive.deck_assist_force_lbf,
          drive_force_world: drive.deck_assist_force_world,
          drive_geometry_scale_world_units_per_foot: drive.deck_assist_geometry_scale,
          drive_geometry_factor: drive.deck_assist_geometry_factor,
          drive_acceleration_ft_per_second_squared: drive.deck_assist_acceleration,
          drive_fade: drive.deck_assist_fade,
          has_real_ball_pin_contact: drive.has_hit_pin,
        });
      }
      previous_drive_active = drive.deck_assist_active;
      previous_in_pit = ball.in_pit;
    }
    const terminal_ball = ball_snapshot(world);
    const paths = world.get_collision_path_diagnostics();
    const reached_backstop = time_to_backstop_seconds !== undefined;
    return {
      id: candidate.id,
      launch: candidate.launch,
      deck_assist_enabled: candidate.deck_assist_enabled,
      runtime_collider_mass_lb: runtime_collider_mass,
      pin_field_backstop_y_ft: backstop_y,
      reached_backstop,
      time_to_backstop_seconds: time_to_backstop_seconds ?? null,
      terminal_position: { x: terminal_ball.x, y: terminal_ball.y, in_pit: terminal_ball.in_pit },
      settle_outcome:
        error !== undefined ? "stalled" : timed_out ? "timed_out" : settled ? "settled" : "stalled",
      failure: error ?? null,
      contact_provenance: {
        real_ball_pin_contact: world.get_ball_drive_diagnostics().has_hit_pin,
        ball_pin_contact_occurrences: paths.ball_pin.contact_occurrences,
        pin_pin_contact_occurrences: paths.pin_pin.contact_occurrences,
      },
      force_speed_trace: trace,
    };
  } finally {
    world.dispose();
  }
}

async function main() {
  const candidates = [
    {
      id: "drive_on_legal_high_power_high_spin",
      launch: high_power_high_spin_launch,
      deck_assist_enabled: true,
    },
    {
      id: "drive_off_same_legal_launch",
      launch: high_power_high_spin_launch,
      deck_assist_enabled: false,
    },
    {
      id: "drive_on_legal_low_power_control",
      launch: { power: 8, start_position: 0, angle: 0, spin: 0 },
      deck_assist_enabled: true,
    },
  ];
  const results = [];
  for (const candidate of candidates) results.push(await run_candidate(candidate));
  const high_power = results[0];
  if (
    high_power.runtime_collider_mass_lb < 39.5 ||
    high_power.runtime_collider_mass_lb > 40.5 ||
    !high_power.reached_backstop ||
    high_power.settle_outcome !== "settled"
  ) {
    throw new Error(
      "990 drive-on legal high-power/high-spin probe did not meet its required outcome.",
    );
  }
  const report = {
    purpose:
      "WP-A7 paired through-pin drive probe. A stalled candidate remains stalled; this probe never coerces it into completion.",
    published_legal_high_power_high_spin_launch: high_power_high_spin_launch,
    geometry_formula:
      "target speed = 24 + 0.30 * deck_depth; maximum acceleration = 24 + deck_depth; F_lbf is derived so F_world = F_lbf * 32.174 * S * lane_width/regulation_lane_width * field_fade = collider mass * selected_acceleration * field_fade; the last quarter-deck fade reaches zero at the pin-field backstop.",
    unit_conversions: {
      gravitational_acceleration_ft_per_second_squared: 32.174,
      regulation_ten_pin_lane_width_feet: 41.5 / 12,
    },
    candidates: results,
  };
  await mkdir("artifacts/m3", { recursive: true });
  const output_path = "artifacts/m3/990_backstop_probe.json";
  await writeFile(output_path, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`Wrote ${output_path}.\n`);
  for (const candidate of results) {
    process.stdout.write(
      `${candidate.id}: mass=${candidate.runtime_collider_mass_lb} lb; ` +
        `backstop=${candidate.reached_backstop}; outcome=${candidate.settle_outcome}; ` +
        `time=${candidate.time_to_backstop_seconds ?? "none"}.\n`,
    );
  }
}

await main();
