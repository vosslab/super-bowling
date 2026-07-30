import { get_benchmark_fixture } from "./config/benchmark_fixtures";
import { physics_config } from "./config/physics";
import { get_rack_pin_count, supported_pin_counts, type PinCount } from "./config/pin_counts";
import { draw_interpolated_snapshot } from "./render/benchmark_renderer";
import type { SimulationEvent } from "./simulation/protocol";

type BenchmarkMetrics = {
  delivered_frames: number;
  mean_delivery_ms: number;
  mean_draw_ms: number;
  drawn_pin_count: number;
  standing_pin_count: number;
  fallen_pin_count: number;
};

function get_pin_count(): PinCount {
  const requested_count = Number(
    new URLSearchParams(window.location.search).get("pin_count") ?? 1000,
  );
  const pin_count = supported_pin_counts.find((value) => value === requested_count);
  return pin_count ?? 1000;
}

function format_metric(value: number): string {
  return Number.isFinite(value) ? value.toFixed(3) : "0.000";
}

function draw_metrics(element: HTMLDListElement, metrics: BenchmarkMetrics): void {
  element.replaceChildren();
  const metric_entries: Array<[string, string]> = [
    ["Delivered frames", String(metrics.delivered_frames)],
    ["Mean delivery ms", format_metric(metrics.mean_delivery_ms)],
    ["Mean draw ms", format_metric(metrics.mean_draw_ms)],
    ["Drawn pins", String(metrics.drawn_pin_count)],
    ["Standing pins", String(metrics.standing_pin_count)],
    ["Fallen pins", String(metrics.fallen_pin_count)],
  ];
  for (const [label, value] of metric_entries) {
    const term = document.createElement("dt");
    term.textContent = label;
    const description = document.createElement("dd");
    description.textContent = value;
    element.append(term, description);
  }
}

const canvas = document.getElementById("benchmark_canvas");
const status = document.getElementById("benchmark_status");
const metrics_element = document.getElementById("benchmark_metrics");
if (
  !(canvas instanceof HTMLCanvasElement) ||
  status === null ||
  !(metrics_element instanceof HTMLDListElement)
) {
  throw new Error("The benchmark page requires its Canvas and metric elements.");
}
const benchmark_canvas = canvas;
const benchmark_status = status;
const benchmark_metrics = metrics_element;
const context = benchmark_canvas.getContext("2d");
if (context === null) throw new Error("Canvas 2D is required for the benchmark page.");
const benchmark_context = context;

const pin_count = get_pin_count();
const rack_pin_count = get_rack_pin_count(pin_count);
const fixture = get_benchmark_fixture(new URLSearchParams(window.location.search).get("fixture"));
const worker = new Worker("./simulation_worker.js", { type: "module" });
const fixture_timer_ids: number[] = [];
let previous_snapshot: Float32Array | undefined;
let current_snapshot: Float32Array | undefined;
let previous_delivery_ms: number | undefined;
let delivery_total_ms = 0;
let draw_total_ms = 0;
const metrics: BenchmarkMetrics = {
  delivered_frames: 0,
  mean_delivery_ms: 0,
  mean_draw_ms: 0,
  drawn_pin_count: 0,
  standing_pin_count: rack_pin_count,
  fallen_pin_count: 0,
};

function draw_snapshot(): void {
  if (current_snapshot === undefined) return;
  const draw_start = performance.now();
  const commands = draw_interpolated_snapshot(
    benchmark_context,
    previous_snapshot ?? current_snapshot,
    current_snapshot,
    rack_pin_count,
    1,
    benchmark_canvas.width,
    benchmark_canvas.height,
  );
  draw_total_ms += performance.now() - draw_start;
  metrics.drawn_pin_count = commands.filter(
    (command) => command.kind === "standing_pin" || command.kind === "fallen_pin",
  ).length;
  metrics.mean_draw_ms = draw_total_ms / metrics.delivered_frames;
}

function schedule_fixture_steering(): void {
  if (fixture.steer_direction === 0) return;
  const start_delay_ms = fixture.steer_start_step * physics_config.fixed_step_seconds * 1000;
  const end_delay_ms = (fixture.steer_end_step + 1) * physics_config.fixed_step_seconds * 1000;
  fixture_timer_ids.push(
    window.setTimeout(
      () => worker.postMessage({ type: "steer", direction: fixture.steer_direction }),
      start_delay_ms,
    ),
    window.setTimeout(() => worker.postMessage({ type: "steer", direction: 0 }), end_delay_ms),
  );
}

function clear_fixture_steering(): void {
  for (const timer_id of fixture_timer_ids) window.clearTimeout(timer_id);
  fixture_timer_ids.length = 0;
}

function handle_event(event: SimulationEvent): void {
  if (event.type === "ready") {
    benchmark_status.textContent = `Launching ${pin_count}-mode ${event.pin_count}-pin ${fixture.label} roll...`;
    worker.postMessage({
      type: "launch",
      lateral_offset: fixture.lateral_offset,
      power: fixture.power,
    });
    schedule_fixture_steering();
    return;
  }
  if (event.type === "snapshot") {
    const delivery_now = performance.now();
    if (previous_delivery_ms !== undefined)
      delivery_total_ms += delivery_now - previous_delivery_ms;
    previous_delivery_ms = delivery_now;
    previous_snapshot = current_snapshot;
    current_snapshot = event.snapshot_data;
    metrics.delivered_frames += 1;
    metrics.mean_delivery_ms =
      metrics.delivered_frames > 1 ? delivery_total_ms / (metrics.delivered_frames - 1) : 0;
    metrics.standing_pin_count = event.standing_pin_count;
    metrics.fallen_pin_count = event.fallen_pin_count;
    draw_snapshot();
    draw_metrics(benchmark_metrics, metrics);
    document.body.dataset.drawnPinCount = String(metrics.drawn_pin_count);
    document.body.dataset.deliveredFrames = String(metrics.delivered_frames);
    document.body.dataset.standingPinCount = String(metrics.standing_pin_count);
    document.body.dataset.fallenPinCount = String(metrics.fallen_pin_count);
    return;
  }
  if (event.type === "settled") {
    clear_fixture_steering();
    document.body.dataset.settlementOutcome = event.timed_out ? "timed_out" : "settled";
    benchmark_status.textContent = event.timed_out
      ? "Simulation reached its settlement limit."
      : "Simulation settled.";
    draw_metrics(benchmark_metrics, metrics);
    return;
  }
  if (event.type === "fatal") {
    clear_fixture_steering();
    benchmark_status.textContent = event.message;
  }
}

worker.addEventListener("message", (event: MessageEvent<SimulationEvent>) =>
  handle_event(event.data),
);
window.addEventListener("pagehide", clear_fixture_steering, { once: true });
worker.postMessage({ type: "initialize", pin_count: rack_pin_count });
