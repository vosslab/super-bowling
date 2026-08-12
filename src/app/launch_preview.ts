import type { AimValues } from "../game/aim";
import type { PreviewPathEvent, PreviewPathRequest } from "../simulation/protocol";
import type { RackPinCount } from "../config/pin_counts";

/** One requested Bowl, held until its exact public-worker preview arrives. */
export type PendingLaunch = Readonly<{
  request: PreviewPathRequest;
}>;

export type LaunchPreviewLifecycle = {
  next_request_id: number;
  pending_launch: PendingLaunch | undefined;
};

export type AcceptedLaunchPreview = Readonly<{
  aim: AimValues;
  path: Float32Array;
}>;

export function create_launch_preview_lifecycle(): LaunchPreviewLifecycle {
  return { next_request_id: 0, pending_launch: undefined };
}

function preview_request(
  lifecycle: LaunchPreviewLifecycle,
  pin_count: RackPinCount,
  aim: AimValues,
): PreviewPathRequest {
  lifecycle.next_request_id += 1;
  return { type: "preview_path", request_id: lifecycle.next_request_id, pin_count, ...aim };
}

/**
 * Captures a Bowl's aim and asks the public worker for that exact free path.
 * A second activation cannot replace or duplicate an accepted Bowl.
 */
export function queue_launch_preview(
  lifecycle: LaunchPreviewLifecycle,
  pin_count: RackPinCount,
  aim: AimValues,
): PreviewPathRequest | undefined {
  if (lifecycle.pending_launch !== undefined) return undefined;
  const request = preview_request(lifecycle, pin_count, aim);
  lifecycle.pending_launch = { request };
  return request;
}

/** Allocates an ordinary, non-launch aim-preview request. */
export function request_aim_preview(
  lifecycle: LaunchPreviewLifecycle,
  pin_count: RackPinCount,
  aim: AimValues,
): PreviewPathRequest {
  return preview_request(lifecycle, pin_count, aim);
}

/**
 * Accepts only the preview belonging to the captured Bowl. The returned path
 * is the exact worker-owned public preview that camera launch must retain.
 */
export function accept_launch_preview(
  lifecycle: LaunchPreviewLifecycle,
  event: PreviewPathEvent,
): AcceptedLaunchPreview | undefined {
  const pending = lifecycle.pending_launch;
  if (
    pending === undefined ||
    event.request_id !== pending.request.request_id ||
    event.pin_count !== pending.request.pin_count
  ) {
    return undefined;
  }
  lifecycle.pending_launch = undefined;
  const { power, start_position, angle, spin } = pending.request;
  return { aim: { power, start_position, angle, spin }, path: event.points };
}

export function launch_preview_pending(lifecycle: LaunchPreviewLifecycle): boolean {
  return lifecycle.pending_launch !== undefined;
}
