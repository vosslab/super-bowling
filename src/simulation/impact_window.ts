import type { FallTransitionSummary, ImpactPathSummary } from "./protocol";
import type { CollisionPath, ImpactWindow } from "./world_contracts";

type PendingImpactPath = ImpactPathSummary & {
  centroid_weight: number;
};

type PendingFallTransition = FallTransitionSummary & {
  centroid_weight: number;
};

function create_pending_impact_path(): PendingImpactPath {
  return {
    contact_count: 0,
    total_impulse: 0,
    maximum_impulse: 0,
    centroid_x: 0,
    centroid_y: 0,
    centroid_weight: 0,
  };
}

function create_pending_fall_transition(): PendingFallTransition {
  return {
    transition_count: 0,
    total_speed: 0,
    maximum_speed: 0,
    centroid_x: 0,
    centroid_y: 0,
    centroid_weight: 0,
  };
}

export type ImpactPosition = { x: number; y: number };

export type ImpactWindowAccumulator = {
  record_collision(path: CollisionPath, impulse: number, positions: ImpactPosition[]): void;
  record_fall(speed: number, position: ImpactPosition): void;
  reset(): void;
  drain(): ImpactWindow;
};

export function create_impact_window_accumulator(): ImpactWindowAccumulator {
  const pending_impact_by_path: Record<CollisionPath, PendingImpactPath> = {
    ball_pin: create_pending_impact_path(),
    pin_pin: create_pending_impact_path(),
  };
  const pending_fall_transition = create_pending_fall_transition();

  function reset(): void {
    for (const path of ["ball_pin", "pin_pin"] as const) {
      Object.assign(pending_impact_by_path[path], create_pending_impact_path());
    }
    Object.assign(pending_fall_transition, create_pending_fall_transition());
  }

  function record_collision(
    path: CollisionPath,
    impulse: number,
    positions: ImpactPosition[],
  ): void {
    const pending_impact = pending_impact_by_path[path];
    pending_impact.contact_count += 1;
    pending_impact.total_impulse += impulse;
    pending_impact.maximum_impulse = Math.max(pending_impact.maximum_impulse, impulse);
    const centroid_weight = Math.max(impulse, 1);
    for (const position of positions) {
      pending_impact.centroid_x += (position.x * centroid_weight) / positions.length;
      pending_impact.centroid_y += (position.y * centroid_weight) / positions.length;
    }
    pending_impact.centroid_weight += centroid_weight;
  }

  function record_fall(speed: number, position: ImpactPosition): void {
    const centroid_weight = Math.max(speed, 1);
    pending_fall_transition.transition_count += 1;
    pending_fall_transition.total_speed += speed;
    pending_fall_transition.maximum_speed = Math.max(pending_fall_transition.maximum_speed, speed);
    pending_fall_transition.centroid_x += position.x * centroid_weight;
    pending_fall_transition.centroid_y += position.y * centroid_weight;
    pending_fall_transition.centroid_weight += centroid_weight;
  }

  function drain_path(path: CollisionPath): ImpactPathSummary | undefined {
    const pending_impact = pending_impact_by_path[path];
    if (pending_impact.contact_count === 0) return undefined;
    const summary: ImpactPathSummary = {
      contact_count: pending_impact.contact_count,
      total_impulse: pending_impact.total_impulse,
      maximum_impulse: pending_impact.maximum_impulse,
      centroid_x: pending_impact.centroid_x / pending_impact.centroid_weight,
      centroid_y: pending_impact.centroid_y / pending_impact.centroid_weight,
    };
    Object.assign(pending_impact, create_pending_impact_path());
    return summary;
  }

  function drain(): ImpactWindow {
    const fallen =
      pending_fall_transition.transition_count === 0
        ? undefined
        : {
            transition_count: pending_fall_transition.transition_count,
            total_speed: pending_fall_transition.total_speed,
            maximum_speed: pending_fall_transition.maximum_speed,
            centroid_x:
              pending_fall_transition.centroid_x / pending_fall_transition.centroid_weight,
            centroid_y:
              pending_fall_transition.centroid_y / pending_fall_transition.centroid_weight,
          };
    Object.assign(pending_fall_transition, create_pending_fall_transition());
    return { ball_pin: drain_path("ball_pin"), pin_pin: drain_path("pin_pin"), fallen };
  }

  return { record_collision, record_fall, reset, drain };
}
