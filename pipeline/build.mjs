import { build } from "esbuild";
import { solidPlugin } from "esbuild-plugin-solid";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec_file = promisify(execFile);

const build_options = {
  bundle: true,
  format: "esm",
  minify: true,
  platform: "browser",
  sourcemap: true,
  target: "es2020",
};

async function check_types() {
  await exec_file("npx", ["tsc", "--noEmit", "-p", "tsconfig.json"]);
}

async function build_site() {
  await check_types();
  await rm("dist", { force: true, recursive: true });
  await mkdir("dist", { recursive: true });
  await build({
    ...build_options,
    entryPoints: ["src/main.ts"],
    outfile: "dist/main.js",
    plugins: [solidPlugin()],
  });
  await build({
    ...build_options,
    entryPoints: ["src/benchmark_main.ts"],
    outfile: "dist/benchmark_main.js",
  });
  await build({
    ...build_options,
    entryPoints: ["src/designer/designer_fixture.tsx"],
    outfile: "dist/designer_fixture.js",
    plugins: [solidPlugin()],
  });
  await build({
    ...build_options,
    entryPoints: ["src/simulation/worker.ts"],
    outfile: "dist/simulation_worker.js",
  });
  await cp("src/index.html", "dist/index.html");
  await cp("src/benchmark.html", "dist/benchmark.html");
  await cp("src/designer_fixture.html", "dist/designer_fixture.html");
  await cp("src/style.css", "dist/style.css");
  await cp("src/style_setup.css", "dist/style_setup.css");
  await cp("src/assets", "dist/assets", { recursive: true });
  await writeFile("dist/.nojekyll", "");
}

async function main() {
  await build_site();
  process.stdout.write("Built dist/ (GitHub Pages-ready).\n");
}

await main();
