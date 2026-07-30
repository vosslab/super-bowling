import { mkdir, writeFile } from "node:fs/promises";
import { platform, arch, release } from "node:os";

import { physics_config } from "../src/config/physics.ts";
import {
  get_benchmark_validation_failures,
  run_benchmark_report,
} from "../src/simulation/benchmark.ts";

async function main() {
  const report = await run_benchmark_report();
  const output = {
    environment: { platform: platform(), arch: arch(), release: release(), node: process.version },
    physics_config,
    ...report,
  };
  await mkdir("artifacts/benchmark", { recursive: true });
  const output_path = "artifacts/benchmark/simulation_benchmark.json";
  await writeFile(output_path, `${JSON.stringify(output, null, 2)}\n`);
  process.stdout.write(`Wrote ${output_path} with ${report.samples.length} samples.\n`);
  const failures = get_benchmark_validation_failures(report);
  if (failures.length > 0) {
    process.stderr.write(
      `Benchmark release gate failed:\n${failures.map((failure) => `- ${failure}\n`).join("")}`,
    );
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    "Benchmark release gate passed: every sample settled with conserved pins and finite measurements.\n",
  );
}

await main();
