export type BenchmarkFixtureId =
  "head_on" | "left_pocket" | "right_pocket" | "late_left_hook" | "gutter_recovery";

export type BenchmarkFixture = {
  fixture_id: BenchmarkFixtureId;
  label: string;
  lateral_offset: number;
  power: number;
  steer_start_step: number;
  steer_end_step: number;
  steer_direction: -1 | 0 | 1;
};

export const benchmark_fixtures: readonly BenchmarkFixture[] = [
  {
    fixture_id: "head_on",
    label: "head-on",
    lateral_offset: 0,
    power: 18,
    steer_start_step: 0,
    steer_end_step: 0,
    steer_direction: 0,
  },
  {
    fixture_id: "left_pocket",
    label: "left pocket",
    lateral_offset: -0.38,
    power: 18,
    steer_start_step: 0,
    steer_end_step: 0,
    steer_direction: 0,
  },
  {
    fixture_id: "right_pocket",
    label: "right pocket",
    lateral_offset: 0.38,
    power: 18,
    steer_start_step: 0,
    steer_end_step: 0,
    steer_direction: 0,
  },
  {
    fixture_id: "late_left_hook",
    label: "late left hook",
    lateral_offset: 0.25,
    power: 17,
    steer_start_step: 90,
    steer_end_step: 210,
    steer_direction: -1,
  },
  {
    fixture_id: "gutter_recovery",
    label: "gutter recovery",
    lateral_offset: 0.82,
    power: 15,
    steer_start_step: 40,
    steer_end_step: 160,
    steer_direction: -1,
  },
];

export function get_benchmark_fixture(fixture_id: string | null): BenchmarkFixture {
  const fixture = benchmark_fixtures.find((candidate) => candidate.fixture_id === fixture_id);
  return fixture ?? benchmark_fixtures[0]!;
}
