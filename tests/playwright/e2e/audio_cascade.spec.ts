// Production-path selector contract: setup start / mute buttons come from src/app/setup.tsx:143,337;
// the live bowl button comes from src/app/game_controls.tsx:263; game-state attributes come from
// src/app/game.tsx:751-771. Instrument native Web Audio before the app loads, then bowl through
// those visible controls. This is intentionally a graph observation, not a source-level mock.
import { expect, test, type Page } from "@playwright/test";

type AudioStart = {
  arity: number;
  buffer_duration_s: number | undefined;
  duration_s: number | undefined;
  offset_s: number | undefined;
  playback_rate: number;
  scheduled_at_s: number;
  when_s: number;
};

type AudioSource = {
  disconnect_count: number;
  id: number;
  starts: AudioStart[];
  stops: number[];
};

type AudioPanner = { values: number[] };

type AudioGraphTrace = {
  panners: AudioPanner[];
  sources: AudioSource[];
};

declare global {
  interface Window {
    __super_bowling_audio_graph__?: AudioGraphTrace;
  }
}

function install_audio_graph_trace(): void {
  const trace: AudioGraphTrace = { panners: [], sources: [] };
  window.__super_bowling_audio_graph__ = trace;
  let next_source_id = 0;

  const create_source = Reflect.get(AudioContext.prototype, "createBufferSource");
  AudioContext.prototype.createBufferSource =
    function traced_create_buffer_source(): AudioBufferSourceNode {
      const source = Reflect.apply(create_source, this, []);
      const entry: AudioSource = {
        disconnect_count: 0,
        id: next_source_id++,
        starts: [],
        stops: [],
      };
      trace.sources.push(entry);
      const start = source.start.bind(source);
      source.start = (...arguments_: [number?, number?, number?]): void => {
        entry.starts.push({
          arity: arguments_.length,
          buffer_duration_s: source.buffer?.duration,
          duration_s: arguments_[2],
          offset_s: arguments_[1],
          playback_rate: source.playbackRate.value,
          scheduled_at_s: this.currentTime,
          when_s: arguments_[0] ?? this.currentTime,
        });
        start(...arguments_);
      };
      const stop = source.stop.bind(source);
      source.stop = (when_s?: number): void => {
        entry.stops.push(when_s ?? this.currentTime);
        stop(when_s);
      };
      const disconnect = source.disconnect.bind(source);
      source.disconnect = ((...arguments_: Parameters<AudioNode["disconnect"]>): void => {
        entry.disconnect_count += 1;
        disconnect(...arguments_);
      }) as AudioNode["disconnect"];
      return source;
    };

  const create_panner = Reflect.get(AudioContext.prototype, "createStereoPanner");
  AudioContext.prototype.createStereoPanner =
    function traced_create_stereo_panner(): StereoPannerNode {
      const panner = Reflect.apply(create_panner, this, []);
      const entry: AudioPanner = { values: [] };
      trace.panners.push(entry);
      const set_value_at_time = panner.pan.setValueAtTime.bind(panner.pan);
      panner.pan.setValueAtTime = (value: number, time_s: number): AudioParam => {
        entry.values.push(value);
        return set_value_at_time(value, time_s);
      };
      return panner;
    };
}

function collision_sample_starts(
  trace: AudioGraphTrace,
): Array<AudioStart & { source_id: number }> {
  return trace.sources.flatMap((source) =>
    source.starts
      .filter((start) => start.arity === 3)
      .map((start) => ({ ...start, source_id: source.id })),
  );
}

type AudibleCollisionInterval = {
  end_s: number;
  source_id: number;
  start_s: number;
};

function collision_sample_intervals(trace: AudioGraphTrace): AudibleCollisionInterval[] {
  return trace.sources.flatMap((source) =>
    source.starts.flatMap((start) => {
      if (
        start.arity !== 3 ||
        start.duration_s === undefined ||
        !Number.isFinite(start.when_s) ||
        !Number.isFinite(start.duration_s) ||
        !Number.isFinite(start.playback_rate) ||
        start.duration_s <= 0 ||
        start.playback_rate <= 0
      )
        return [];
      const natural_end_s = start.when_s + start.duration_s / start.playback_rate;
      const stopped_end_s = source.stops
        .filter((stop_s) => Number.isFinite(stop_s) && stop_s >= start.when_s)
        .reduce((earliest_s, stop_s) => Math.min(earliest_s, stop_s), natural_end_s);
      const end_s = Math.min(natural_end_s, stopped_end_s);
      return end_s > start.when_s ? [{ end_s, source_id: source.id, start_s: start.when_s }] : [];
    }),
  );
}

function has_overlapping_collision_intervals(
  intervals: readonly AudibleCollisionInterval[],
): boolean {
  return intervals.some((interval, index) =>
    intervals
      .slice(index + 1)
      .some(
        (other) =>
          Math.max(interval.start_s, other.start_s) < Math.min(interval.end_s, other.end_s),
      ),
  );
}

async function set_ten_pin_pocket_shot(page: Page): Promise<void> {
  // The range has ten ticks per player-facing board. -25 ticks is the
  // deterministic -2.5-board physical pocket line, and max regular power is
  // the source-valid ten-pin cascade from tests/test_pin_cascade.mjs.
  await page.locator('[data-control="start-position"]').fill("-25");
  await page.locator('[data-control="power"]').fill("24");
}

test.use({ viewport: { width: 1600, height: 1000 } });

test("audio-cascade: a real roll schedules bounded spatial collision slices and cleans them up", async ({
  page,
}) => {
  await page.addInitScript(install_audio_graph_trace);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Start 10 mode - 10 pins for 1 player", exact: true })
    .click();

  const play_shell = page.locator("main.play_shell");
  await expect(play_shell).toHaveAttribute("data-phase", "aiming");
  await expect(play_shell).toHaveAttribute("data-aim-guide", "visible");
  await set_ten_pin_pocket_shot(page);
  await expect(play_shell).toHaveAttribute("data-preview-status", "ready");
  await page.getByRole("button", { name: "Bowl now", exact: true }).click();
  await expect(play_shell).toHaveAttribute("data-phase", "rolling");
  await expect(play_shell).toHaveAttribute("data-first-impact-seen", "true", { timeout: 15_000 });
  await expect(play_shell).toHaveAttribute("data-phase", "result", { timeout: 15_000 });

  const impact_windows = Number(await play_shell.getAttribute("data-impact-window-count"));
  expect(impact_windows).toBeGreaterThan(0);
  const graph = await page.evaluate(() => window.__super_bowling_audio_graph__);
  expect(graph).toBeDefined();
  const trace = graph!;
  const collision_starts = collision_sample_starts(trace);

  // Each recorded sample is a separate one-shot source with explicit, safe slice bounds.
  expect(new Set(collision_starts.map((start) => start.source_id)).size).toBeGreaterThan(1);
  expect(collision_starts.length).toBeGreaterThan(0);
  for (const start of collision_starts) {
    expect(Number.isFinite(start.when_s)).toBe(true);
    expect(start.when_s).toBeGreaterThanOrEqual(start.scheduled_at_s - 0.02);
    expect(start.offset_s).toBeGreaterThanOrEqual(0);
    expect(start.duration_s).toBeGreaterThan(0);
    expect(start.buffer_duration_s).toBeGreaterThan(0);
    expect(start.playback_rate).toBeGreaterThan(0);
    expect(start.offset_s! + start.duration_s!).toBeLessThanOrEqual(
      start.buffer_duration_s! + 0.002,
    );
  }

  // These are rendered intervals, not merely close `start()` calls: duration is converted through
  // the voice playback rate and shortened by a scheduled stop if one ends the voice sooner.
  // A real cascade must leave at least one pair of distinct collision samples concurrently audible.
  const collision_intervals = collision_sample_intervals(trace);
  expect(collision_intervals.length).toBeGreaterThan(1);
  expect(has_overlapping_collision_intervals(collision_intervals)).toBe(true);

  // The graph is bounded by its own lifecycle: every sampled collision source is stopped and
  // disconnected after the roll settles, rather than accumulating a permanent node pile.
  const sampled_sources = trace.sources.filter((source) =>
    source.starts.some((start) => start.arity === 3),
  );
  expect(sampled_sources.length).toBeLessThanOrEqual(impact_windows * 3);
  expect(sampled_sources.every((source) => source.stops.length > 0)).toBe(true);
  expect(sampled_sources.every((source) => source.disconnect_count > 0)).toBe(true);

  // Actual collision geometry produces a signed spatial route; the test does not assume which
  // physical side wins or a fixed total number of panners.
  const pan_values = trace.panners.flatMap((panner) => panner.values);
  expect(pan_values.some((value) => value < 0)).toBe(true);
  expect(pan_values.some((value) => value > 0)).toBe(true);

  await page.getByRole("button", { name: "Mute off", exact: true }).click();
  await expect(page.getByRole("button", { name: "Mute on", exact: true })).toBeVisible();
  await expect
    .poll(async () =>
      page.evaluate(() =>
        (window.__super_bowling_audio_graph__?.sources ?? []).every(
          (source) => source.starts.length === 0 || source.stops.length > 0,
        ),
      ),
    )
    .toBe(true);
});
