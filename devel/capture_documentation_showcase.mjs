/* global document, HTMLInputElement */

import { execFile } from "node:child_process";
import { copyFile, mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import {
  capture_live_screenshot,
  freeze_mid_roll_canvas,
  install_canvas_ellipse_probe,
  remove_frozen_mid_roll_canvas,
  png_metadata,
  start_aiming_state,
  wait_for_best_frame_earned,
} from "./capture_live_support.mjs";

const viewport = { width: 1600, height: 1000 };
const documentation_roll_timeout_ms = 30_000;
const documentation_directory = "docs/screenshots";
const temporary_directory = "/tmp/super_bowling_showcase";
const run_process = promisify(execFile);

async function capture_documentation_image(page, filename, state, pin_count) {
  await Promise.all([
    mkdir(documentation_directory, { recursive: true }),
    mkdir(temporary_directory, { recursive: true }),
  ]);
  const temporary_path = join(temporary_directory, filename);
  const documentation_path = join(documentation_directory, filename);
  await capture_live_screenshot(page, temporary_path, state, pin_count, viewport);
  await copyFile(temporary_path, documentation_path);
  return png_metadata(documentation_path, viewport);
}

async function wait_for_phase(page, phase) {
  await page.waitForFunction(
    (expected_phase) =>
      document.querySelector("main.play_shell")?.getAttribute("data-phase") === expected_phase,
    phase,
  );
}

async function wait_for_numeric_attribute(page, attribute, minimum, phase = "rolling") {
  await page.waitForFunction(
    ({ expected_phase, minimum_value, name }) => {
      const root = document.querySelector("main.play_shell");
      if (root?.getAttribute("data-phase") !== expected_phase) return false;
      return Number(root.getAttribute(name)) >= minimum_value;
    },
    { expected_phase: phase, minimum_value: minimum, name: attribute },
  );
}

async function wait_for_first_impact(page) {
  await page.waitForFunction(
    () =>
      document.querySelector("main.play_shell")?.getAttribute("data-first-impact-seen") === "true",
  );
}

async function finish_animation(locator) {
  await locator.waitFor();
  await locator.evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished));
  });
}

async function capture_thousand_pin_action(browser, base_url) {
  console.log("==> Capturing the real 990-pin action sequence");
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.setDefaultTimeout(documentation_roll_timeout_ms);
  const captures = [];
  try {
    await start_aiming_state(
      page,
      base_url,
      "1,000 mode - 990 pins",
      "Start 1,000 mode - 990 pins for 1 player",
      990,
    );
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Space");
    await wait_for_phase(page, "rolling");
    await wait_for_numeric_attribute(page, "data-camera-physical-progress", 0.34);
    captures.push(
      await capture_documentation_image(
        page,
        "thousand_pin_approach.png",
        "thousand_pin_approach",
        990,
      ),
    );
    await wait_for_first_impact(page);
    captures.push(
      await capture_documentation_image(
        page,
        "thousand_pin_first_impact.png",
        "thousand_pin_first_impact",
        990,
      ),
    );
    await wait_for_numeric_attribute(page, "data-impact-window-count", 4);
    captures.push(
      await capture_documentation_image(
        page,
        "thousand_pin_impact_wave.png",
        "thousand_pin_impact_wave",
        990,
      ),
    );
    await wait_for_numeric_attribute(page, "data-drawn-fallen-pin-count", 100);
    captures.push(
      await capture_documentation_image(
        page,
        "thousand_pin_cascade.png",
        "thousand_pin_cascade",
        990,
      ),
    );
    await wait_for_numeric_attribute(page, "data-drawn-fallen-pin-count", 300);
    captures.push(
      await capture_documentation_image(
        page,
        "thousand_pin_collision_field.png",
        "thousand_pin_collision_field",
        990,
      ),
    );
    await wait_for_phase(page, "result");
    captures.push(
      await capture_documentation_image(
        page,
        "thousand_pin_result.png",
        "thousand_pin_result",
        990,
      ),
    );
    return captures;
  } finally {
    await context.close();
  }
}

async function capture_hundred_pin_action(browser, base_url) {
  console.log("==> Capturing the real 105-pin collision sequence");
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.setDefaultTimeout(documentation_roll_timeout_ms);
  const captures = [];
  try {
    await start_aiming_state(
      page,
      base_url,
      "100 mode - 105 pins",
      "Start 100 mode - 105 pins for 1 player",
      105,
    );
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Space");
    await wait_for_first_impact(page);
    captures.push(
      await capture_documentation_image(
        page,
        "hundred_pin_first_impact.png",
        "hundred_pin_first_impact",
        105,
      ),
    );
    await wait_for_numeric_attribute(page, "data-drawn-fallen-pin-count", 20);
    captures.push(
      await capture_documentation_image(
        page,
        "hundred_pin_cascade.png",
        "hundred_pin_cascade",
        105,
      ),
    );
    return captures;
  } finally {
    await context.close();
  }
}

async function capture_hundred_pin_animation(browser, base_url) {
  console.log("==> Recording the real 105-pin cascade demonstration");
  await mkdir(temporary_directory, { recursive: true });
  const context = await browser.newContext({
    viewport,
    recordVideo: { dir: temporary_directory, size: { width: 960, height: 600 } },
  });
  const page = await context.newPage();
  const video = page.video();
  if (video === null) throw new Error("Documentation animation requires Playwright video capture.");
  page.setDefaultTimeout(documentation_roll_timeout_ms);
  const video_path = join(temporary_directory, "hundred_pin_cascade_demo.webm");
  const temporary_gif = join(temporary_directory, "hundred_pin_cascade_demo.gif");
  const documentation_gif = join(documentation_directory, "hundred_pin_cascade_demo.gif");
  try {
    await start_aiming_state(
      page,
      base_url,
      "100 mode - 105 pins",
      "Start 100 mode - 105 pins for 1 player",
      105,
    );
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Space");
    await wait_for_first_impact(page);
    await wait_for_numeric_attribute(page, "data-drawn-fallen-pin-count", 20);
    await page.waitForTimeout(900);
  } finally {
    await context.close();
  }
  await video.saveAs(video_path);
  await run_process("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-ss",
    "1.25",
    "-i",
    video_path,
    "-t",
    "5",
    "-an",
    "-filter_complex",
    "fps=12,scale=960:-1:flags=lanczos,split[frames][palette_input];[palette_input]palettegen=max_colors=128:stats_mode=diff[palette];[frames][palette]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle",
    "-loop",
    "-1",
    temporary_gif,
  ]);
  const gif_stat = await stat(temporary_gif);
  if (gif_stat.size > 5 * 1024 * 1024)
    throw new Error(`Documentation GIF exceeds 5 MB: ${gif_stat.size} bytes.`);
  await copyFile(temporary_gif, documentation_gif);
  return {
    path: documentation_gif,
    bytes: gif_stat.size,
    width: 960,
    fps: 12,
    duration_seconds: 5,
  };
}

async function verify_hundred_pin_reduced_motion(browser, base_url) {
  const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
  const page = await context.newPage();
  page.setDefaultTimeout(documentation_roll_timeout_ms);
  try {
    await start_aiming_state(
      page,
      base_url,
      "100 mode - 105 pins",
      "Start 100 mode - 105 pins for 1 player",
      105,
    );
    await page.keyboard.press("Space");
    await wait_for_first_impact(page);
    await wait_for_numeric_attribute(page, "data-drawn-fallen-pin-count", 20);
    return {
      reduced_motion: "reduce",
      outcome: "105-pin cascade remains readable through the static HUD",
    };
  } finally {
    await context.close();
  }
}

async function capture_result(browser, base_url, fixture, celebration, filename) {
  console.log(`==> Capturing the ${celebration} result stinger`);
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  try {
    await page.goto(`${base_url}?fixture=${fixture}`, { waitUntil: "networkidle" });
    await page
      .getByRole("button", { name: "Start 10 mode - 10 pins for 1 player", exact: true })
      .click();
    await page.keyboard.press("Space");
    await wait_for_phase(page, "result");
    if (celebration === "spare") {
      await page.getByRole("button", { name: "Continue to the next roll" }).click();
      await wait_for_phase(page, "aiming");
      await page.keyboard.press("Space");
      await wait_for_phase(page, "result");
    }
    await finish_animation(page.locator(`[data-celebration="${celebration}"]`));
    const capture = await capture_documentation_image(page, filename, `${celebration}_result`, 10);
    return capture;
  } finally {
    await context.close();
  }
}

async function set_real_ten_pin_pocket_shot(page) {
  const start_position = page.locator('[data-control="start-position"]');
  const power = page.locator('[data-control="power"]');
  await start_position.evaluate((element) => {
    if (!(element instanceof HTMLInputElement)) throw new Error("Expected range input.");
    element.value = "-20";
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await power.evaluate((element) => {
    if (!(element instanceof HTMLInputElement)) throw new Error("Expected range input.");
    element.value = "18";
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function capture_real_ten_pin_arcade_evidence(browser, base_url) {
  console.log("==> Capturing real ten-pin ball, physical strike, and payoff evidence");
  const context = await browser.newContext({ viewport });
  await install_canvas_ellipse_probe(context);
  const page = await context.newPage();
  page.setDefaultTimeout(documentation_roll_timeout_ms);
  const captures = [];
  try {
    await start_aiming_state(
      page,
      base_url,
      "10 mode - 10 pins",
      "Start 10 mode - 10 pins for 1 player",
      10,
    );
    await set_real_ten_pin_pocket_shot(page);
    await page.getByRole("button", { name: "Bowl now" }).click();
    await wait_for_phase(page, "rolling");
    await wait_for_numeric_attribute(page, "data-camera-physical-progress", 0.34);
    const frozen_ball = await freeze_mid_roll_canvas(page);
    try {
      captures.push(
        await capture_documentation_image(
          page,
          "classic_ball_in_motion.png",
          "ten_pin_moving_ball",
          10,
        ),
      );
    } finally {
      await remove_frozen_mid_roll_canvas(page, frozen_ball);
    }
    await wait_for_phase(page, "result");
    const strike_celebration = page.locator('[data-celebration="strike"]');
    await strike_celebration.waitFor();
    await strike_celebration.evaluate((element) => {
      element.setAttribute("style", "visibility: hidden");
    });
    captures.push(
      await capture_documentation_image(
        page,
        "classic_physical_strike_aftermath.png",
        "ten_pin_physical_strike_aftermath",
        10,
      ),
    );
    await strike_celebration.evaluate((element) => {
      element.removeAttribute("style");
    });
    captures.push(
      await capture_documentation_image(
        page,
        "classic_strike.png",
        "ten_pin_real_strike_payoff",
        10,
      ),
    );
    return captures;
  } finally {
    await context.close();
  }
}

async function capture_best_frame(browser, base_url) {
  console.log("==> Capturing the real 990-pin BEST FRAME moment");
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.setDefaultTimeout(documentation_roll_timeout_ms);
  try {
    await start_aiming_state(
      page,
      base_url,
      "1,000 mode - 990 pins",
      "Start 1,000 mode - 990 pins for 1 player",
      990,
    );
    await page.keyboard.press("Space");
    await wait_for_phase(page, "result");
    await page.getByRole("button", { name: "Continue to the next roll" }).click();
    await wait_for_phase(page, "aiming");
    await page.keyboard.press("Space");
    await wait_for_best_frame_earned(page);
    const capture = await capture_documentation_image(
      page,
      "thousand_pin_deck.png",
      "best_frame_earned",
      990,
    );
    return capture;
  } finally {
    await context.close();
  }
}

async function capture_pass_the_keyboard(browser, base_url) {
  console.log("==> Capturing the four-player handoff");
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  try {
    await page.goto(`${base_url}?fixture=zero_knock`, { waitUntil: "networkidle" });
    const player_names = ["Ari", "Bea", "Chen", "Dia"];
    for (let player_index = 2; player_index <= 4; player_index += 1) {
      await page.getByRole("button", { name: "Add player" }).click();
    }
    for (const [index, name] of player_names.entries()) {
      await page.getByLabel(`Player ${index + 1} name`).fill(name);
    }
    await page
      .getByRole("button", { name: "Start 10 mode - 10 pins for 4 players", exact: true })
      .click();
    await page.getByRole("button", { name: "Bowl now" }).click();
    await page.getByRole("button", { name: "Bowl now" }).click();
    const handoff = page.getByRole("dialog");
    await handoff.waitFor();
    await handoff.getByRole("button", { name: "Bea, start your turn" }).focus();
    const capture = await capture_documentation_image(
      page,
      "pass_the_keyboard.png",
      "player_handoff",
      10,
    );
    return capture;
  } finally {
    await context.close();
  }
}

export async function capture_documentation_showcase(browser, base_url) {
  const captures = [];
  captures.push(...(await capture_thousand_pin_action(browser, base_url)));
  captures.push(...(await capture_hundred_pin_action(browser, base_url)));
  captures.push(await capture_hundred_pin_animation(browser, base_url));
  captures.push(await verify_hundred_pin_reduced_motion(browser, base_url));
  captures.push(...(await capture_real_ten_pin_arcade_evidence(browser, base_url)));
  captures.push(
    await capture_result(browser, base_url, "spare_pickup", "spare", "classic_spare.png"),
  );
  captures.push(await capture_best_frame(browser, base_url));
  captures.push(await capture_pass_the_keyboard(browser, base_url));
  return captures;
}
