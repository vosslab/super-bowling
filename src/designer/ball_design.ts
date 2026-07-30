export const ball_patterns = ["solid", "single_band", "double_band", "chevron"] as const;

export type BallPattern = (typeof ball_patterns)[number];

export type BallDesign = {
  base_color: string;
  accent_color: string;
  pattern: BallPattern;
  monogram?: string;
};

const default_design: BallDesign = {
  base_color: "#1479d4",
  accent_color: "#c9f3ff",
  pattern: "solid",
};

function normalize_color(value: string | undefined, fallback: string): string {
  if (value === undefined) {
    return fallback;
  }
  const trimmed_value = value.trim();
  const valid_color = /^#[0-9a-fA-F]{6}$/.test(trimmed_value);
  return valid_color ? trimmed_value.toUpperCase() : fallback;
}

function normalize_monogram(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const normalized_value = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 2);
  return normalized_value.length > 0 ? normalized_value : undefined;
}

function is_ball_pattern(value: string): value is BallPattern {
  return ball_patterns.some((pattern) => pattern === value);
}

function normalize_pattern(value: string | undefined): BallPattern {
  if (value !== undefined && is_ball_pattern(value)) {
    return value;
  }
  return default_design.pattern;
}

export function normalize_ball_design(input: Partial<BallDesign>): BallDesign {
  const base_color = normalize_color(input.base_color, default_design.base_color);
  const accent_color = normalize_color(input.accent_color, default_design.accent_color);
  const pattern = normalize_pattern(input.pattern);
  const monogram = normalize_monogram(input.monogram);
  const design: BallDesign = { base_color, accent_color, pattern };
  if (monogram !== undefined) {
    design.monogram = monogram;
  }
  return design;
}
