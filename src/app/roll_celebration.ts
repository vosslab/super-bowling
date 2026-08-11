import type { MatchState } from "../game/contracts";

export type RollCelebration = {
  kind: "strike" | "spare";
  label: "STRIKE" | "SPARE";
  support_text: "All pins cleared" | "Clean pickup";
};

/** Derives the visual result burst from the reducer's player-facing result. */
export function roll_celebration(state: MatchState): RollCelebration | undefined {
  if (state.phase !== "result") return undefined;
  if (state.result_message === "Strike!") {
    return { kind: "strike", label: "STRIKE", support_text: "All pins cleared" };
  }
  if (state.result_message === "Spare!") {
    return { kind: "spare", label: "SPARE", support_text: "Clean pickup" };
  }
  return undefined;
}
