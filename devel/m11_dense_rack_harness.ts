/*
 * Browser-side implementation for the M11 diagnostic.  It is deliberately
 * built only into ignored artifacts by measure_dense_rack_canvas.mjs, while
 * importing the same Canvas renderer and raster asset loader as the app.
 */
import {
  advance_camera_for_ball,
  create_camera_state,
  set_camera_collision_zone,
} from "../src/render/camera";
import { create_collision_zone } from "../src/render/collision_zone";
import {
  create_game_draw_commands,
  create_game_renderer,
  draw_game_commands,
} from "../src/render/game_renderer";
import { create_rack } from "../src/simulation/rack";
import {
  ball_snapshot_stride,
  pin_snapshot_stride,
  write_snapshot_ball,
  write_snapshot_pin,
} from "../src/simulation/protocol";
import type { CameraState } from "../src/render/contracts";
import type { RackPinCount } from "../src/config/pin_counts";

type Reading = { draw_ms: number; draw_and_readback_ms: number; blank_readback_ms: number };
type TraceState = { index: number; camera: CameraState; zoom: number; progress: number };
type Harness = {
  ready(): Promise<void>;
  render_trace_frame(pin_count: RackPinCount, trace_index: number): void;
  run(
    pin_count: RackPinCount,
    repetitions: number,
  ): {
    pin_count: RackPinCount;
    trace: ReadonlyArray<{ index: number; zoom: number; progress: number }>;
    readings: ReadonlyArray<Reading & { block: "a" | "b"; trace_index: number }>;
    frames: ReadonlyArray<{ trace_index: number; luma: number[]; high_frequency_energy: number }>;
    identical_camera_noise_luma: ReadonlyArray<number[]>;
    canvas: { width: number; height: number };
  };
  profile(
    pin_count: RackPinCount,
    repetitions: number,
    smoothing_quality: ImageSmoothingQuality,
  ): {
    smoothing_quality: ImageSmoothingQuality;
    asset_bytes: number;
    pin_body_dimensions: ReadonlyArray<{ width: number; height: number }>;
    frames: ReadonlyArray<{ trace_index: number; luma: number[]; high_frequency_energy: number }>;
    readings: ReadonlyArray<{
      command_build_ms: number;
      lane_and_accents_ms: number;
      pin_shadows_ms: number;
      pin_bodies_and_overlays_ms: number;
      default_renderer_draw_ms: number;
      default_renderer_draw_and_readback_ms: number;
      default_renderer_blank_readback_ms: number;
      draw_and_readback_ms: number;
      blank_readback_ms: number;
    }>;
  };
};

const width = 1600;
const height = 1000;

function create_snapshot(pin_count: RackPinCount): Float32Array {
  const snapshot = new Float32Array(pin_count * pin_snapshot_stride + ball_snapshot_stride);
  for (const [index, pin] of create_rack(pin_count).slots.entries()) {
    write_snapshot_pin(snapshot, index * pin_snapshot_stride, {
      x: pin.x,
      y: pin.y,
      velocity_x: 0,
      velocity_y: 0,
      state_flag: 0,
      removed: false,
      in_pit: false,
      fallen_axis_angle: 0,
    });
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

function create_trace(pin_count: RackPinCount): TraceState[] {
  const path = new Float32Array([0, 0, 0, 20, 0, 40, 0, 80]);
  let camera = create_camera_state(pin_count);
  const zone = create_collision_zone({
    rack_bounds: camera.rack_bounds,
    committed_path: path,
    ball: { x: 0, y: 0 },
  });
  camera = set_camera_collision_zone(camera, zone);
  const depth = zone.journey_depth;
  return [0, 0.18, 0.36, 0.54, 0.72, 0.9, 1].map((fraction, index) => {
    camera = advance_camera_for_ball(camera, depth * fraction, 0);
    return { index, camera, zoom: camera.rolling_zoom, progress: camera.shot_progress };
  });
}

function downsample_luma(context: CanvasRenderingContext2D): number[] {
  const source = context.getImageData(0, 0, width, height).data;
  const sampled_width = 200;
  const sampled_height = 125;
  const result: number[] = [];
  for (let y = 0; y < sampled_height; y += 1) {
    const source_y = Math.floor(((y + 0.5) * height) / sampled_height);
    for (let x = 0; x < sampled_width; x += 1) {
      const source_x = Math.floor(((x + 0.5) * width) / sampled_width);
      const offset = (source_y * width + source_x) * 4;
      const red = source[offset] ?? 0;
      const green = source[offset + 1] ?? 0;
      const blue = source[offset + 2] ?? 0;
      result.push(0.2126 * red + 0.7152 * green + 0.0722 * blue);
    }
  }
  return result;
}

function high_frequency_energy(luma: ReadonlyArray<number>): number {
  const sampled_width = 200;
  const sampled_height = 125;
  let total = 0;
  let count = 0;
  for (let y = 1; y + 1 < sampled_height; y += 1) {
    for (let x = 1; x + 1 < sampled_width; x += 1) {
      const center = luma[y * sampled_width + x] ?? 0;
      const neighbours =
        (luma[y * sampled_width + x - 1] ?? 0) +
        (luma[y * sampled_width + x + 1] ?? 0) +
        (luma[(y - 1) * sampled_width + x] ?? 0) +
        (luma[(y + 1) * sampled_width + x] ?? 0);
      total += Math.abs(center - neighbours / 4);
      count += 1;
    }
  }
  return count === 0 ? 0 : total / count;
}

function require_context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  // Match the application's default Canvas 2D context.  Readback cost is
  // measured separately below; requesting a readback-oriented backend here
  // would make submission timing less representative of the live canvas.
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("M11 requires a Canvas 2D context.");
  return context;
}

export function create_m11_harness(): Harness {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.style.cssText = `width:${width}px;height:${height}px;display:block`;
  document.body.replaceChildren(canvas);
  const context = require_context(canvas);
  const renderer = create_game_renderer(context);
  let rendered_pin_count: RackPinCount | undefined;
  let rendered_trace: TraceState[] = [];
  let rendered_snapshot: Float32Array | undefined;
  function prepare(pin_count: RackPinCount): TraceState[] {
    if (rendered_pin_count !== pin_count) {
      const snapshot = create_snapshot(pin_count);
      renderer.set_snapshot_pair({
        previous_snapshot: snapshot,
        current_snapshot: snapshot,
        pin_count,
      });
      renderer.set_ball_visible(false);
      rendered_pin_count = pin_count;
      rendered_snapshot = snapshot;
      rendered_trace = create_trace(pin_count);
    }
    return rendered_trace;
  }
  return {
    async ready(): Promise<void> {
      for (let attempt = 0; attempt < 300; attempt += 1) {
        const asset_state = renderer.get_asset_state();
        if (asset_state.status === "ready") return;
        if (asset_state.status === "failed") throw new Error(asset_state.message);
        await new Promise((resolve) => window.setTimeout(resolve, 10));
      }
      throw new Error("M11 renderer assets did not become ready.");
    },
    render_trace_frame(pin_count, trace_index): void {
      const state = prepare(pin_count)[trace_index];
      if (state === undefined) throw new Error(`Unknown M11 trace index ${trace_index}.`);
      renderer.set_camera(state.camera);
      renderer.draw(1, 5_000 + state.index);
    },
    run(pin_count, repetitions): ReturnType<Harness["run"]> {
      const trace = prepare(pin_count);
      renderer.set_camera(trace[0]?.camera ?? create_camera_state(pin_count));
      for (let warmup = 0; warmup < 5; warmup += 1) renderer.draw(1, 1_000);
      const readings: Array<Reading & { block: "a" | "b"; trace_index: number }> = [];
      for (let repetition = 0; repetition < repetitions; repetition += 1) {
        for (const block of ["a", "b"] as const) {
          for (const state of trace) {
            renderer.set_camera(state.camera);
            const draw_start = performance.now();
            renderer.draw(1, 2_000 + repetition * 20 + state.index);
            const draw_ms = performance.now() - draw_start;
            const combined_start = performance.now();
            renderer.draw(1, 3_000 + repetition * 20 + state.index);
            context.getImageData(0, 0, width, height);
            const draw_and_readback_ms = performance.now() - combined_start;
            const blank_start = performance.now();
            context.getImageData(0, 0, width, height);
            const blank_readback_ms = performance.now() - blank_start;
            readings.push({
              block,
              trace_index: state.index,
              draw_ms,
              draw_and_readback_ms,
              blank_readback_ms,
            });
          }
        }
      }
      const frames = trace.map((state) => {
        renderer.set_camera(state.camera);
        renderer.draw(1, 4_000 + state.index);
        const luma = downsample_luma(context);
        return {
          trace_index: state.index,
          luma,
          high_frequency_energy: high_frequency_energy(luma),
        };
      });
      const noise_state = trace[Math.floor(trace.length / 2)];
      if (noise_state === undefined) throw new Error("M11 trace unexpectedly has no midpoint.");
      const identical_camera_noise_luma = [0, 1].map((sample) => {
        renderer.set_camera(noise_state.camera);
        renderer.draw(1, 4_500 + sample);
        return downsample_luma(context);
      });
      return {
        pin_count,
        trace: trace.map(({ index, zoom, progress }) => ({ index, zoom, progress })),
        readings,
        frames,
        identical_camera_noise_luma,
        canvas: { width, height },
      };
    },
    profile(pin_count, repetitions, smoothing_quality): ReturnType<Harness["profile"]> {
      const trace = prepare(pin_count);
      const assets = renderer.get_asset_state();
      if (assets.status !== "ready" || rendered_snapshot === undefined)
        throw new Error("M12 requires ready assets and a prepared snapshot.");
      const snapshot = rendered_snapshot;
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = smoothing_quality;
      const readings: Array<{
        command_build_ms: number;
        lane_and_accents_ms: number;
        pin_shadows_ms: number;
        pin_bodies_and_overlays_ms: number;
        default_renderer_draw_ms: number;
        default_renderer_draw_and_readback_ms: number;
        default_renderer_blank_readback_ms: number;
        draw_and_readback_ms: number;
        blank_readback_ms: number;
      }> = [];
      const pin_body_dimensions: Array<{ width: number; height: number }> = [];
      for (let repetition = 0; repetition < repetitions; repetition += 1) {
        for (const state of trace) {
          // This full-wrapper sample shares the exact frozen state with the
          // direct phase profile below. It keeps wrapper overhead measurable.
          renderer.set_camera(state.camera);
          const default_draw_started_at = performance.now();
          renderer.draw(1, 6_000 + repetition * 20 + state.index);
          const default_renderer_draw_ms = performance.now() - default_draw_started_at;
          const default_draw_and_readback_started_at = performance.now();
          renderer.draw(1, 7_000 + repetition * 20 + state.index);
          context.getImageData(0, 0, width, height);
          const default_renderer_draw_and_readback_ms =
            performance.now() - default_draw_and_readback_started_at;
          const default_blank_started_at = performance.now();
          context.getImageData(0, 0, width, height);
          const default_renderer_blank_readback_ms = performance.now() - default_blank_started_at;
          const build_started_at = performance.now();
          const commands = create_game_draw_commands(
            snapshot,
            snapshot,
            pin_count,
            1,
            width,
            height,
            undefined,
            state.camera,
            undefined,
            undefined,
            false,
          );
          const command_build_ms = performance.now() - build_started_at;
          if (repetition === 0)
            for (const command of commands)
              if (command.kind === "standing_pin" || command.kind === "fallen_pin")
                pin_body_dimensions.push({ width: command.width, height: command.height });
          const phase = {
            lane_and_accents_ms: 0,
            pin_shadows_ms: 0,
            pin_bodies_and_overlays_ms: 0,
          };
          const draw_started_at = performance.now();
          draw_game_commands(
            context,
            commands,
            assets.assets,
            pin_count <= 105,
            (name, elapsed_ms) => {
              phase[`${name}_ms`] = elapsed_ms;
            },
          );
          context.getImageData(0, 0, width, height);
          const draw_and_readback_ms = performance.now() - draw_started_at;
          const blank_started_at = performance.now();
          context.getImageData(0, 0, width, height);
          readings.push({
            command_build_ms,
            ...phase,
            default_renderer_draw_ms,
            default_renderer_draw_and_readback_ms,
            default_renderer_blank_readback_ms,
            draw_and_readback_ms,
            blank_readback_ms: performance.now() - blank_started_at,
          });
        }
      }
      const asset_bytes = [assets.assets.upright, assets.assets.fallen, assets.assets.ball].reduce(
        (total, asset) =>
          total + (asset instanceof HTMLCanvasElement ? asset.width * asset.height * 4 : 0),
        0,
      );
      const frames = trace.map((state) => {
        const commands = create_game_draw_commands(
          snapshot,
          snapshot,
          pin_count,
          1,
          width,
          height,
          undefined,
          state.camera,
          undefined,
          undefined,
          false,
        );
        draw_game_commands(context, commands, assets.assets, pin_count <= 105);
        const luma = downsample_luma(context);
        return {
          trace_index: state.index,
          luma,
          high_frequency_energy: high_frequency_energy(luma),
        };
      });
      return { smoothing_quality, asset_bytes, pin_body_dimensions, frames, readings };
    },
  };
}
