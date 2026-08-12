import assert from "node:assert/strict";
import test from "node:test";

import {
  accept_launch_preview,
  create_launch_preview_lifecycle,
  queue_launch_preview,
  request_aim_preview,
} from "../src/app/launch_preview.ts";

const aim = { power: 16, start_position: 0, angle: 0, spin: 0 };

test("an immediate Bowl waits for and consumes exactly its matching public preview", () => {
  const lifecycle = create_launch_preview_lifecycle();
  const request = queue_launch_preview(lifecycle, 990, aim);

  assert.ok(request, "Bowl immediately asks the worker for its path");
  assert.equal(queue_launch_preview(lifecycle, 990, aim), undefined, "one Bowl remains pending");

  const path = new Float32Array([0, 0, 0, 60]);
  const accepted = accept_launch_preview(lifecycle, {
    type: "preview_path",
    request_id: request.request_id,
    pin_count: 990,
    points: path,
  });
  assert.deepEqual(accepted?.aim, aim, "launch keeps the aim that requested this path");
  assert.equal(accepted?.path, path, "camera receives the worker path by identity");
  assert.equal(
    accept_launch_preview(lifecycle, {
      type: "preview_path",
      request_id: request.request_id,
      pin_count: 990,
      points: path,
    }),
    undefined,
    "the response launches exactly once",
  );
});

test("ordinary preview IDs cannot collide with a pending Bowl", () => {
  const lifecycle = create_launch_preview_lifecycle();
  const ordinary = request_aim_preview(lifecycle, 496, aim);
  const pending = queue_launch_preview(lifecycle, 496, { ...aim, spin: 0.2 });

  assert.ok(pending);
  assert.notEqual(ordinary.request_id, pending.request_id);
  assert.equal(
    accept_launch_preview(lifecycle, {
      type: "preview_path",
      request_id: ordinary.request_id,
      pin_count: 496,
      points: new Float32Array(),
    }),
    undefined,
  );
});
