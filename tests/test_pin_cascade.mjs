import assert from "node:assert/strict";
import test from "node:test";

import { get_settle_max_seconds, physics_config } from "../src/config/physics.ts";
import { create_simulation_world } from "../src/simulation/world.ts";

const pocket_launch = {
  power: 24,
  start_position: -0.22169230769230772,
  angle: 0,
  spin: 0,
};

const centered_launch = { ...pocket_launch, start_position: 0 };

async function run_to_terminal(launch) {
  const world = await create_simulation_world(10);
  try {
    world.launch(launch.power, launch.start_position, launch.angle, launch.spin);
    const step_cap = Math.ceil(get_settle_max_seconds(10) / physics_config.fixed_step_seconds);
    let terminal;
    for (let step = 0; step < step_cap; step += 1) {
      const result = world.step_fixed();
      const counts = world.get_counts();
      assert.equal(
        counts.standing_pin_count + counts.fallen_pin_count,
        10,
        "each fixed step conserves the ten-pin rack",
      );
      if (result.settled || result.timed_out) {
        terminal = result;
        break;
      }
    }
    assert.ok(terminal, `roll must finish within its ${step_cap}-step settlement budget`);
    assert.equal(terminal.timed_out, false, "roll must settle rather than time out");
    return {
      fallen_pin_count: world.get_counts().fallen_pin_count,
      rear_row_pin_fallen_from_pin: world.rack.slots
        .filter(
          (slot) =>
            slot.row_index === Math.max(...world.rack.slots.map((entry) => entry.row_index)),
        )
        .some(
          (slot) =>
            world.is_pin_fallen(slot.pin_id) &&
            world.get_pin_first_contact(slot.pin_id) === "pin_pin",
        ),
    };
  } finally {
    world.dispose();
  }
}

test("a robust pocket roll cascades beyond the centered control", async () => {
  const pocket = await run_to_terminal(pocket_launch);
  const centered = await run_to_terminal(centered_launch);

  assert.ok(
    pocket.fallen_pin_count > centered.fallen_pin_count,
    "pocket roll should knock down more pins than the same-power centered roll",
  );
  assert.equal(
    pocket.rear_row_pin_fallen_from_pin,
    true,
    "a fallen rear-row pin must have first been contacted by another pin",
  );
});
