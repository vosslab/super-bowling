import assert from "node:assert/strict";
import test from "node:test";

import { format_frame_roll_marks, format_frame_roll_slots } from "../src/game/score_display.ts";

test("formats open, spare, and strike frames for the score strip", () => {
  assert.deepEqual(format_frame_roll_marks({ frame_index: 0, rolls: [3, 4] }, 10), ["3", "4"]);
  assert.deepEqual(format_frame_roll_marks({ frame_index: 1, rolls: [6, 4] }, 10), ["6", "/"]);
  assert.deepEqual(format_frame_roll_marks({ frame_index: 2, rolls: [10] }, 10), ["X"]);
  assert.deepEqual(format_frame_roll_marks({ frame_index: 9, rolls: [10, 10, 10] }, 10), [
    "X",
    "X",
    "X",
  ]);
});

test("uses numeric marks for super frames", () => {
  assert.deepEqual(format_frame_roll_marks({ frame_index: 0, rolls: [10] }, 10, 3), ["10"]);
  assert.deepEqual(format_frame_roll_marks({ frame_index: 1, rolls: [6, 4] }, 10, 3), ["6", "4"]);
});

test("marks a missed roll with a dash", () => {
  assert.deepEqual(format_frame_roll_marks({ frame_index: 0, rolls: [0, 9] }, 10), ["-", "9"]);
});

test("places roll marks into real scorecard boxes", () => {
  assert.deepEqual(format_frame_roll_slots(0, { frame_index: 0, rolls: [10] }, 10), [
    undefined,
    "X",
  ]);
  assert.deepEqual(format_frame_roll_slots(0, { frame_index: 0, rolls: [3, 2, 6, 6] }, 21, 4), [
    "3",
    "2",
    "6",
    "6",
  ]);
  assert.deepEqual(format_frame_roll_slots(9, { frame_index: 9, rolls: [3, 2, 6, 6] }, 21, 4), [
    "3",
    "2",
    "6",
    "6",
    undefined,
  ]);
});
