import { performance } from "node:perf_hooks";

import { create_camera_state } from "../src/render/camera.ts";
import { create_camera_projection } from "../src/render/camera_projection.ts";

const canvas = { width: 1600, height: 1000 };
const samples_per_mode = 20;

function median(values) {
  const sorted = [...values].sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);
  return values.length % 2 === 1
    ? sorted[middle]
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function measure_warm_samples(pin_count) {
  const camera = create_camera_state(pin_count);
  create_camera_projection(camera, canvas.width, canvas.height);
  const samples = [];
  for (let index = 0; index < samples_per_mode; index += 1) {
    const start = performance.now();
    create_camera_projection(camera, canvas.width, canvas.height);
    samples.push(performance.now() - start);
  }
  return median(samples);
}

function measure_cold_samples(pin_count) {
  const camera = create_camera_state(pin_count);
  const samples = [];
  for (let index = 0; index < samples_per_mode; index += 1) {
    // The public cache key includes canvas geometry. A distinct width gives
    // each sample a new production solve without exposing a reset hook.
    const start = performance.now();
    create_camera_projection(camera, canvas.width + index + 1, canvas.height);
    samples.push(performance.now() - start);
  }
  return median(samples);
}

function main() {
  console.log("# Deck-solve memo timing probe");
  console.log("");
  console.log(`Canvas: ${canvas.width}x${canvas.height}; median of ${samples_per_mode} samples.`);
  console.log("Distinct public canvas geometries sample the production bisection path.");
  console.log("");
  console.log("| Pins | Forced-bisection median (ms) | Warm-cache median (ms) | Improvement |");
  console.log("| ---: | ---: | ---: | ---: |");
  for (const pin_count of [10, 496, 990]) {
    const uncached_ms = measure_cold_samples(pin_count);
    const cached_ms = measure_warm_samples(pin_count);
    const improvement = uncached_ms / cached_ms;
    console.log(
      `| ${pin_count} | ${uncached_ms.toFixed(3)} | ${cached_ms.toFixed(3)} | ${improvement.toFixed(1)}x |`,
    );
  }
}

main();
