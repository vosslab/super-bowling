import { create_rack } from "../simulation/rack";
import { get_rack_pin_count, type PinCount, type RackPinCount } from "../config/pin_counts";
import { foul_to_head_pin } from "../config/lane";
import {
  ball_snapshot_stride,
  ball_snapshot_in_pit_flag_offset,
  pin_snapshot_stride,
  snapshot_removed_flag_offset,
  snapshot_state_flag_offset,
  snapshot_x_offset,
  snapshot_y_offset,
  type SimulationEvent,
  type SimulationRequest,
} from "../simulation/protocol";
import type { SimulationClient } from "./simulation_client";

function queue_event(listener: (event: SimulationEvent) => void, event: SimulationEvent): void {
  queueMicrotask(() => listener(event));
}

function create_snapshot(
  pin_count: RackPinCount,
  fallen_pin_count: number,
  removed_pin_count = 0,
): Float32Array {
  const rack = create_rack(pin_count);
  const snapshot = new Float32Array(pin_count * pin_snapshot_stride + ball_snapshot_stride);
  for (const slot of rack.slots) {
    const offset = Number(slot.pin_id) * pin_snapshot_stride;
    snapshot[offset + snapshot_x_offset] = slot.x;
    snapshot[offset + snapshot_y_offset] = slot.y;
    snapshot[offset + snapshot_state_flag_offset] = Number(slot.pin_id) < fallen_pin_count ? 1 : 0;
    snapshot[offset + snapshot_removed_flag_offset] = Number(
      Number(slot.pin_id) < removed_pin_count,
    );
  }
  const ball_offset = pin_count * pin_snapshot_stride;
  snapshot[ball_offset + snapshot_x_offset] = 0;
  snapshot[ball_offset + snapshot_y_offset] = -9;
  return snapshot;
}

export function create_perfect_game_fixture(pin_count: PinCount = 10): SimulationClient {
  const rack_pin_count = get_rack_pin_count(pin_count);
  return create_fixture_client(rack_pin_count, rack_pin_count);
}

/** Uses the production SimulationClient boundary to finish every fixture roll with zero pins down. */
export function create_zero_knock_fixture(pin_count: PinCount = 10): SimulationClient {
  return create_fixture_client(get_rack_pin_count(pin_count), 0);
}

/** Delivers a partial first roll, then honors the production sweep request before roll two. */
export function create_partial_knock_fixture(pin_count: PinCount = 10): SimulationClient {
  return create_fixture_client(get_rack_pin_count(pin_count), 3, {
    hold_second_roll_in_rolling: true,
  });
}

/** Delivers a partial first roll followed by a clean second-roll pickup. */
export function create_spare_pickup_fixture(pin_count: PinCount = 10): SimulationClient {
  const rack_pin_count = get_rack_pin_count(pin_count);
  const first_roll_fallen_pin_count = Math.min(3, rack_pin_count - 1);
  return create_fixture_client(rack_pin_count, first_roll_fallen_pin_count, {
    second_roll_fallen_pin_count: rack_pin_count,
  });
}

/**
 * Delivers a terminal shot snapshot for centered-framing evidence. The exported
 * name remains compatible with the existing camera_deck fixture query.
 */
export function create_camera_deck_fixture(pin_count: PinCount): SimulationClient {
  const rack_pin_count = get_rack_pin_count(pin_count);
  const listeners = new Set<(event: SimulationEvent) => void>();
  let disposed = false;

  function publish(event: SimulationEvent): void {
    for (const listener of listeners) queue_event(listener, event);
  }

  return {
    send(request: SimulationRequest): void {
      if (disposed) return;
      if (request.type === "initialize") {
        publish({
          type: "snapshot",
          simulation_time_ms: 0,
          pin_count: rack_pin_count,
          standing_pin_count: rack_pin_count,
          fallen_pin_count: 0,
          snapshot_data: create_snapshot(rack_pin_count, 0),
        });
        publish({ type: "ready", pin_count: rack_pin_count });
      }
      if (request.type === "reset_rack") {
        publish({
          type: "snapshot",
          simulation_time_ms: 0,
          pin_count: rack_pin_count,
          standing_pin_count: rack_pin_count,
          fallen_pin_count: 0,
          snapshot_data: create_snapshot(rack_pin_count, 0),
        });
      }
      if (request.type === "launch") {
        const snapshot = create_snapshot(rack_pin_count, 0);
        snapshot[rack_pin_count * pin_snapshot_stride + snapshot_y_offset] = 6;
        publish({
          type: "snapshot",
          simulation_time_ms: 500,
          pin_count: rack_pin_count,
          standing_pin_count: rack_pin_count,
          fallen_pin_count: 0,
          snapshot_data: snapshot,
        });
        const return_snapshot = create_snapshot(rack_pin_count, 0);
        return_snapshot[rack_pin_count * pin_snapshot_stride + snapshot_y_offset] = 60;
        return_snapshot[rack_pin_count * pin_snapshot_stride + ball_snapshot_in_pit_flag_offset] =
          1;
        publish({
          type: "snapshot",
          simulation_time_ms: 700,
          pin_count: rack_pin_count,
          standing_pin_count: rack_pin_count,
          fallen_pin_count: 0,
          snapshot_data: return_snapshot,
        });
      }
    },
    subscribe(listener): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose(): void {
      disposed = true;
      listeners.clear();
    },
  };
}

type FixtureClientOptions = Readonly<{
  hold_second_roll_in_rolling?: boolean;
  second_roll_fallen_pin_count?: number;
}>;

function create_fixture_client(
  pin_count: RackPinCount,
  fallen_pin_count: number,
  options: FixtureClientOptions = {},
): SimulationClient {
  const listeners = new Set<(event: SimulationEvent) => void>();
  let disposed = false;
  let deadwood_removed = false;
  let launch_count = 0;

  function publish(event: SimulationEvent): void {
    for (const listener of listeners) queue_event(listener, event);
  }

  function send(request: SimulationRequest): void {
    if (disposed) return;
    if (request.type === "initialize") {
      publish({
        type: "snapshot",
        simulation_time_ms: 0,
        pin_count,
        standing_pin_count: pin_count,
        fallen_pin_count: 0,
        snapshot_data: create_snapshot(pin_count, 0),
      });
      publish({ type: "ready", pin_count });
      return;
    }
    if (request.type === "reset_rack") {
      publish({
        type: "snapshot",
        simulation_time_ms: 0,
        pin_count,
        standing_pin_count: pin_count,
        fallen_pin_count: 0,
        snapshot_data: create_snapshot(pin_count, 0),
      });
      return;
    }
    if (request.type === "launch") {
      launch_count += 1;
      const cumulative_fallen_pin_count =
        launch_count > 1 && options.second_roll_fallen_pin_count !== undefined
          ? options.second_roll_fallen_pin_count
          : fallen_pin_count;
      if (options.hold_second_roll_in_rolling && deadwood_removed && launch_count > 1) {
        const rolling_snapshot = create_snapshot(pin_count, 0);
        rolling_snapshot[pin_count * pin_snapshot_stride + snapshot_y_offset] = 2;
        publish({
          type: "snapshot",
          simulation_time_ms: 900,
          pin_count,
          standing_pin_count: pin_count - fallen_pin_count,
          fallen_pin_count: 0,
          snapshot_data: rolling_snapshot,
        });
        return;
      }
      const settled_snapshot = create_snapshot(
        pin_count,
        cumulative_fallen_pin_count,
        deadwood_removed ? fallen_pin_count : 0,
      );
      const ball_offset = pin_count * pin_snapshot_stride;
      settled_snapshot[ball_offset + snapshot_y_offset] = foul_to_head_pin;
      settled_snapshot[ball_offset + ball_snapshot_in_pit_flag_offset] = 1;
      publish({
        type: "snapshot",
        simulation_time_ms: 500,
        pin_count,
        standing_pin_count: pin_count - cumulative_fallen_pin_count,
        fallen_pin_count: cumulative_fallen_pin_count,
        snapshot_data: settled_snapshot,
      });
      publish({
        type: "settled",
        pin_count,
        standing_pin_count: pin_count - cumulative_fallen_pin_count,
        fallen_pin_count: cumulative_fallen_pin_count,
        timed_out: false,
      });
    }
    if (request.type === "prepare_next_roll") {
      deadwood_removed = true;
      publish({
        type: "snapshot",
        simulation_time_ms: 700,
        pin_count,
        standing_pin_count: pin_count - fallen_pin_count,
        fallen_pin_count: 0,
        snapshot_data: create_snapshot(pin_count, fallen_pin_count, fallen_pin_count),
      });
      publish({ type: "sweep_complete", pin_count });
      return;
    }
    if (request.type === "preview_path") {
      const preview_event: SimulationEvent = {
        type: "preview_path",
        request_id: request.request_id,
        pin_count,
        points: new Float32Array([
          request.start_position,
          0,
          request.start_position + Math.sin(request.angle) * 3,
          24,
        ]),
      };
      publish(preview_event);
    }
  }

  function subscribe(listener: (event: SimulationEvent) => void): () => void {
    listeners.add(listener);
    function unsubscribe(): void {
      listeners.delete(listener);
    }
    return unsubscribe;
  }

  function dispose(): void {
    disposed = true;
    listeners.clear();
  }

  return { send, subscribe, dispose };
}
