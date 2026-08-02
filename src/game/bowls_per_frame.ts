/** The one supported bowls-per-frame range for setup, scoring, and saved matches. */
export const default_bowls_per_frame = 2;
export const minimum_bowls_per_frame = 1;
export const maximum_bowls_per_frame = 5;
export const supported_bowls_per_frame = [1, 2, 3, 4, 5] as const;

export function is_valid_bowls_per_frame(value: number): boolean {
  return (
    Number.isInteger(value) && value >= minimum_bowls_per_frame && value <= maximum_bowls_per_frame
  );
}

export function normalize_bowls_per_frame(value: unknown): number {
  return typeof value === "number" && is_valid_bowls_per_frame(value)
    ? value
    : default_bowls_per_frame;
}

export function bowls_per_frame_rule_text(bowls_per_frame: number): string {
  if (bowls_per_frame === default_bowls_per_frame) {
    return "Classic 2 bowls per frame; frames 1-9 can end on a strike; frame 10 gets a fill bowl after a strike or spare.";
  }
  return `Super ${bowls_per_frame} bowls per frame; frames 1-9 end after a clear or ${bowls_per_frame} bowls; frame 10 always has ${bowls_per_frame + 1} bowls.`;
}
