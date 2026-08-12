import { maximum_concurrent_collision_cues } from "../src/audio/collision_render_contract.ts";

/**
 * Maintained calibration for the unattended collision-audio evidence probe.
 *
 * These values deliberately live outside fast unit tests.  They describe a
 * useful range for the production mix, not a frozen recording or a substitute
 * for the director's relational behavior tests.
 */
export const audio_cascade_evidence_contract = Object.freeze({
  fixture_revision: "cascade-director-fixtures-v1",
  early_window_ms: [0, 1_200],
  propagation_window_ms: [1_200, 4_500],
  tail_window_ms: [4_500, 7_500],
  frame_ms: 50,
  activity_rms_floor: 0.0015,
  // The real post-master recorder retains a faint analyser/roll bed after a
  // collision source ends. This floor measures collision occupancy, not it.
  post_master_activity_rms_floor: 0.005,
  onset_ratio: 1.55,
  onset_refractory_ms: 70,
  opening_protection_ms: 45,
  propagation_gap_ms: 650,
  tail_min_duration_ms: 120,
  early_duty_fraction: [0.35, 0.82],
  early_broadband_fraction: [0.15, 0.8],
  large_vs_ten_duration_ratio: 1.5,
  large_vs_ten_exposure_ratio: 1.2,
  large_vs_ten_onset_ratio: 1.25,
  transient_ratio: 0.8,
  stereo_bin_energy_fraction: 0.15,
  source_audio_delay_ms: [0, 100],
  post_settlement_grace_ms: 250,
  pcm_peak_guard: 0.999,
  minimum_fallen_pins: 400,
  declared_controller_cap: maximum_concurrent_collision_cues,
  provenance: "post_master_compressor_output",
});

export function metric(name, value, pass, detail) {
  return { name, value, pass: Boolean(pass), detail };
}

export function finished_report(kind, contract, metrics, extra = {}) {
  const failed = metrics.filter((entry) => !entry.pass);
  return {
    schema_version: 1,
    kind,
    generated_at: new Date().toISOString(),
    contract,
    metrics,
    passed: failed.length === 0,
    failed_metric_names: failed.map((entry) => entry.name),
    ...extra,
  };
}
