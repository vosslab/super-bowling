/**
 * Interpolates radian angles through the shortest arc.
 *
 * The returned angle is continuous from `first` and may fall outside the
 * conventional [-PI, PI) range. Callers that need a canonical representation
 * can normalize after interpolation; renderers keep this continuous value so
 * an axis does not visibly spin almost one full turn at the boundary.
 */
export function interpolate_shortest_angle(first: number, second: number, alpha: number): number {
  const clamped_alpha = Math.min(1, Math.max(0, alpha));
  const raw_delta = second - first;
  const shortest_delta =
    ((((raw_delta + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
  const result = first + shortest_delta * clamped_alpha;
  return Number.isFinite(result) ? result : 0;
}
