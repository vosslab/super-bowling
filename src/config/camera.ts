/** Stable presentation values for the single Super Bowling shot camera. */
export const camera_config = {
  lane_near_y: -10,
  lane_back_padding: 2,
  horizontal_padding: 0.35,
  // This is deliberately a gentle framing change, not a camera cut or a
  // ball-follow camera. The fixed horizon keeps the full-lane read intact.
  maximum_shot_zoom: 0.1,
} as const;
