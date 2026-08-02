export type BenchmarkFixtureId =
  "head_on" | "left_pocket" | "right_pocket" | "late_left_hook" | "gutter_recovery";

export type BenchmarkFixture = {
  fixture_id: BenchmarkFixtureId;
  label: string;
  power: number;
  start_position: number;
  angle: number;
  spin: number;
};

export const benchmark_fixtures: readonly BenchmarkFixture[] = [
  {
    fixture_id: "head_on",
    label: "head-on",
    power: 18,
    start_position: 0,
    angle: 0,
    spin: 0,
  },
  {
    fixture_id: "left_pocket",
    label: "left pocket",
    power: 18,
    start_position: -0.38,
    angle: 0,
    spin: 0,
  },
  {
    fixture_id: "right_pocket",
    label: "right pocket",
    power: 18,
    start_position: 0.38,
    angle: 0,
    spin: 0,
  },
  {
    fixture_id: "late_left_hook",
    label: "late left hook",
    power: 17,
    start_position: 0.25,
    angle: -0.05,
    spin: -0.7,
  },
  {
    fixture_id: "gutter_recovery",
    label: "gutter recovery",
    power: 15,
    start_position: 0.82,
    angle: -0.08,
    spin: -0.8,
  },
];

export function get_benchmark_fixture(fixture_id: string | null): BenchmarkFixture {
  const fixture = benchmark_fixtures.find((candidate) => candidate.fixture_id === fixture_id);
  return fixture ?? benchmark_fixtures[0]!;
}
