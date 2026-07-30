/// <reference lib="webworker" />

import { get_mode_for_rack_pin_count, type RackPinCount } from "../config/pin_counts";
import { get_mode_tuning, physics_config } from "../config/physics";
import type { SimulationEvent, SimulationRequest } from "./protocol";
import { create_simulation_world, type SimulationWorld } from "./world";

type WorkerState = {
  world: SimulationWorld | undefined;
  pin_count: RackPinCount | undefined;
  paused: boolean;
  disposed: boolean;
  last_tick_ms: number;
  last_snapshot_seconds: number;
  simulation_seconds: number;
  ticking: boolean;
  generation: number;
};

const worker_scope: DedicatedWorkerGlobalScope = self as DedicatedWorkerGlobalScope;
const tick_interval_ms = Math.max(1, Math.round(physics_config.fixed_step_seconds * 1000));
const worker_state: WorkerState = {
  world: undefined,
  pin_count: undefined,
  paused: false,
  disposed: false,
  last_tick_ms: 0,
  last_snapshot_seconds: 0,
  simulation_seconds: 0,
  ticking: false,
  generation: 0,
};

function assert_never(value: never): never {
  throw new Error(`Unhandled simulation request: ${JSON.stringify(value)}`);
}

function post_event(event: SimulationEvent, transfer: Transferable[] = []): void {
  worker_scope.postMessage(event, transfer);
}

function post_fatal(error: unknown): void {
  const message = error instanceof Error ? error.message : "The simulation worker failed.";
  post_event({ type: "fatal", message });
}

function get_world(): SimulationWorld {
  const world = worker_state.world;
  if (world === undefined) {
    throw new Error("Initialize the simulation before issuing this request.");
  }
  return world;
}

function emit_snapshot(): void {
  const snapshot = get_world().create_snapshot();
  post_event(
    {
      type: "snapshot",
      simulation_time_ms: Math.round(worker_state.simulation_seconds * 1000),
      pin_count: snapshot.pin_count,
      standing_pin_count: snapshot.standing_pin_count,
      fallen_pin_count: snapshot.fallen_pin_count,
      snapshot_data: snapshot.data,
    },
    [snapshot.data.buffer],
  );
}

function schedule_tick(generation: number): void {
  worker_scope.setTimeout(() => tick_worker(performance.now(), generation), tick_interval_ms);
}

function tick_worker(timestamp_ms: number, generation: number): void {
  if (
    generation !== worker_state.generation ||
    worker_state.disposed ||
    worker_state.paused ||
    worker_state.world === undefined
  ) {
    if (generation === worker_state.generation) worker_state.ticking = false;
    return;
  }

  const elapsed_seconds = Math.max(0, (timestamp_ms - worker_state.last_tick_ms) / 1000);
  worker_state.last_tick_ms = timestamp_ms;
  const elapsed_cap = physics_config.fixed_step_seconds * physics_config.max_steps_per_tick;
  const advanced_seconds = Math.min(elapsed_seconds, elapsed_cap);
  const result = worker_state.world.tick(advanced_seconds);
  worker_state.simulation_seconds += advanced_seconds;
  const pin_count = worker_state.pin_count;
  if (pin_count === undefined) throw new Error("Simulation pin count is unavailable.");
  const snapshot_interval = 1 / get_mode_tuning(get_mode_for_rack_pin_count(pin_count)).snapshot_hz;
  if (worker_state.simulation_seconds - worker_state.last_snapshot_seconds >= snapshot_interval) {
    emit_snapshot();
    worker_state.last_snapshot_seconds = worker_state.simulation_seconds;
  }
  if (result.settled || result.timed_out) {
    emit_snapshot();
    const counts = worker_state.world.get_counts();
    post_event({ type: "settled", pin_count, ...counts, timed_out: result.timed_out });
    worker_state.ticking = false;
    return;
  }
  schedule_tick(generation);
}

function begin_ticking(): void {
  if (worker_state.ticking || worker_state.paused || worker_state.disposed) return;
  worker_state.ticking = true;
  worker_state.last_tick_ms = performance.now();
  schedule_tick(worker_state.generation);
}

async function reset_world(pin_count: RackPinCount): Promise<boolean> {
  // Fence stale asynchronous Rapier initialization before it can replace a newer rack.
  const generation = worker_state.generation + 1;
  worker_state.generation = generation;
  worker_state.ticking = false;
  worker_state.world?.dispose();
  worker_state.world = undefined;
  const replacement = await create_simulation_world(pin_count);
  if (generation !== worker_state.generation || worker_state.disposed) {
    replacement.dispose();
    return false;
  }
  worker_state.world = replacement;
  worker_state.pin_count = pin_count;
  worker_state.simulation_seconds = 0;
  worker_state.last_snapshot_seconds = 0;
  worker_state.last_tick_ms = 0;
  emit_snapshot();
  return true;
}

async function handle_initialize(pin_count: RackPinCount): Promise<void> {
  if (!(await reset_world(pin_count))) return;
  worker_state.paused = false;
  post_event({ type: "ready", pin_count });
}

async function handle_reset_rack(pin_count: RackPinCount): Promise<void> {
  await reset_world(pin_count);
}

function handle_launch(power: number, lateral_offset: number): void {
  get_world().launch(power, lateral_offset);
  begin_ticking();
}

function handle_steer(direction: -1 | 0 | 1): void {
  get_world().set_steer(direction);
}

function handle_pause_change(paused: boolean): void {
  worker_state.paused = paused;
  if (!paused) begin_ticking();
}

function handle_dispose(): void {
  worker_state.generation += 1;
  worker_state.ticking = false;
  worker_state.world?.dispose();
  worker_state.world = undefined;
  worker_state.disposed = true;
  worker_scope.close();
}

async function handle_request(request: SimulationRequest): Promise<void> {
  switch (request.type) {
    case "initialize":
      await handle_initialize(request.pin_count);
      return;
    case "reset_rack":
      await handle_reset_rack(request.pin_count);
      return;
    case "launch":
      handle_launch(request.power, request.lateral_offset);
      return;
    case "steer":
      handle_steer(request.direction);
      return;
    case "set_paused":
      handle_pause_change(request.paused);
      return;
    case "dispose":
      handle_dispose();
      return;
    default:
      return assert_never(request);
  }
}

worker_scope.addEventListener("message", (event: MessageEvent<SimulationRequest>) => {
  void handle_request(event.data).catch(post_fatal);
});
