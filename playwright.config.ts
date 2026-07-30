/// <reference types="node" />
import { defineConfig } from "@playwright/test";

const PORT = process.env["PW_PORT"] ?? "4173";

export default defineConfig({
  testDir: "tests/playwright",
  testIgnore: ["**/_temp*", "**/dist_*/**"],
  timeout: 30_000,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    headless: true,
  },
  webServer: {
    command: `PORT=${PORT} ./run_web_server.sh`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
