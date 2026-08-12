import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { create_game_draw_commands, create_lane_geometry } from "../src/render/game_renderer.ts";
import { create_camera_state } from "../src/render/camera.ts";
import { create_camera_projection } from "../src/render/camera_projection.ts";
import {
  ball_snapshot_stride,
  pin_snapshot_stride,
  write_snapshot_ball,
  write_snapshot_pin,
} from "../src/simulation/protocol.ts";
import {
  foul_to_head_pin,
  gutter_width,
  pin_spacing,
  rack_row_count,
  row_spacing,
} from "../src/config/lane.ts";

function create_foot_rack_snapshot(pin_count) {
  const snapshot = new Float32Array(pin_count * pin_snapshot_stride + ball_snapshot_stride);
  let pin_index = 0;
  const rows = rack_row_count(pin_count);
  for (let row_index = 0; row_index < rows; row_index += 1) {
    for (
      let column_index = 0;
      column_index <= row_index && pin_index < pin_count;
      column_index += 1
    ) {
      write_snapshot_pin(snapshot, pin_index * pin_snapshot_stride, {
        x: (column_index - row_index / 2) * pin_spacing,
        y: foul_to_head_pin + row_index * row_spacing,
        velocity_x: 0,
        velocity_y: 0,
        state_flag: 0,
        removed: false,
        in_pit: false,
      });
      pin_index += 1;
    }
  }
  write_snapshot_ball(snapshot, pin_count * pin_snapshot_stride, {
    x: 0,
    y: 0,
    velocity_x: 0,
    velocity_y: 0,
    rotation: 0,
    in_pit: false,
  });
  return snapshot;
}

function number_for_svg(value) {
  return Number(value.toFixed(2));
}
function point_for_svg(point) {
  return `${number_for_svg(point.x)},${number_for_svg(point.y)}`;
}

function create_gutter_overlay(geometry) {
  const [lane_near_left, lane_near_right] = geometry.lane_near;
  const [lane_far_left, lane_far_right] = geometry.lane_far;
  const [rail_near_left, rail_near_right] = geometry.rail_near;
  const [rail_far_left, rail_far_right] = geometry.rail_far;
  return {
    left: [rail_near_left, lane_near_left, lane_far_left, rail_far_left]
      .map(point_for_svg)
      .join(" "),
    right: [lane_near_right, rail_near_right, rail_far_right, lane_far_right]
      .map(point_for_svg)
      .join(" "),
    gutter_pixel_width_at_deck: Math.hypot(
      rail_far_left.x - lane_far_left.x,
      rail_far_left.y - lane_far_left.y,
    ),
  };
}

function render_projection_svg(commands, width, height, label, gutter_overlay) {
  const fragments = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="${width}" height="${height}" fill="#182438"/>`,
  ];
  for (const command of commands) {
    if (command.kind === "lane") {
      const points = [
        command.geometry.lane_near[0],
        command.geometry.lane_near[1],
        command.geometry.lane_far[1],
        command.geometry.lane_far[0],
      ]
        .map(point_for_svg)
        .join(" ");
      fragments.push(
        `<polygon points="${points}" fill="#c88e43" stroke="#ead69c" stroke-width="4"/>`,
      );
      fragments.push(`<polygon points="${gutter_overlay.left}" fill="#263850"/>`);
      fragments.push(`<polygon points="${gutter_overlay.right}" fill="#263850"/>`);
    } else if (command.kind === "standing_pin") {
      fragments.push(
        `<rect x="${number_for_svg(command.x - command.width / 2)}" y="${number_for_svg(command.y - command.height / 2)}" width="${number_for_svg(command.width)}" height="${number_for_svg(command.height)}" rx="${number_for_svg(command.width / 2)}" fill="#f5f0df" stroke="#b32d38"/>`,
      );
    }
  }
  fragments.push(`<text x="32" y="58" fill="#ffffff" font-size="28">${label}</text>`, "</svg>");
  return fragments.join("");
}

export async function capture_projection_probes(browser, output_directory, viewport, png_metadata) {
  const states = [];
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  try {
    for (const pin_count of [10, 105, 990]) {
      console.log(`==> Capturing production projection probe for ${pin_count} pins`);
      const snapshot = create_foot_rack_snapshot(pin_count);
      const camera = create_camera_state(pin_count);
      const projection = create_camera_projection(camera);
      const geometry = create_lane_geometry(viewport.width, viewport.height, projection);
      const commands = create_game_draw_commands(
        snapshot,
        snapshot,
        pin_count,
        1,
        viewport.width,
        viewport.height,
        undefined,
        camera,
      );
      const svg_path = join(output_directory, `projection_probe_${pin_count}.svg`);
      const png_path = join(output_directory, `projection_probe_${pin_count}.png`);
      const gutter_overlay = create_gutter_overlay(geometry);
      await writeFile(
        svg_path,
        render_projection_svg(
          commands,
          viewport.width,
          viewport.height,
          `Projection probe: ${pin_count} pins at foot-based rack geometry`,
          gutter_overlay,
        ),
      );
      await page.setContent(await readFile(svg_path, "utf8"));
      await page.screenshot({ path: png_path });
      states.push({
        evidence_kind: "synthetic_projection_probe",
        evidence_source: "synthetic_renderer_input_not_live_app_canvas",
        viewport,
        pin_count,
        projection,
        lane_geometry: geometry,
        fixed_gutter_width_feet: gutter_width,
        gutter_pixel_width_at_deck: gutter_overlay.gutter_pixel_width_at_deck,
        standing_pin_commands: commands.filter((command) => command.kind === "standing_pin").length,
        svg_path,
        ...(await png_metadata(png_path)),
      });
    }
  } finally {
    await context.close();
  }
  return states;
}
