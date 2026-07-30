import { create_rack } from "../simulation/rack";
import { get_rack_pin_count, type PinCount, type RackPinCount } from "../config/pin_counts";
import {
  ball_snapshot_stride,
  pin_snapshot_stride,
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

function create_snapshot(pin_count: RackPinCount, fallen_pin_count: number): Float32Array {
  const rack = create_rack(pin_count);
  const snapshot = new Float32Array(pin_count * pin_snapshot_stride + ball_snapshot_stride);
  for (const slot of rack.slots) {
    const offset = Number(slot.pin_id) * pin_snapshot_stride;
    snapshot[offset + snapshot_x_offset] = slot.x;
    snapshot[offset + snapshot_y_offset] = slot.y;
    snapshot[offset + snapshot_state_flag_offset] = Number(slot.pin_id) < fallen_pin_count ? 1 : 0;
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

/** Delivers a deterministic deck-side ball snapshot for camera framing evidence. */
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
        return_snapshot[rack_pin_count * pin_snapshot_stride + snapshot_y_offset] = -2;
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

function create_fixture_client(
  pin_count: RackPinCount,
  fallen_pin_count: number,
): SimulationClient {
  const listeners = new Set<(event: SimulationEvent) => void>();
  let disposed = false;

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
      publish({
        type: "snapshot",
        simulation_time_ms: 500,
        pin_count,
        standing_pin_count: pin_count - fallen_pin_count,
        fallen_pin_count,
        snapshot_data: create_snapshot(pin_count, fallen_pin_count),
      });
      publish({
        type: "settled",
        pin_count,
        standing_pin_count: pin_count - fallen_pin_count,
        fallen_pin_count,
        timed_out: false,
      });
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
