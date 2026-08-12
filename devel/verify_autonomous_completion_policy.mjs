import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const CORE_OWNED_PATHS = [
  "docs/HUMAN_GUIDANCE.md",
  "AGENTS.md",
  "README.md",
  "devel/DEVEL_README.md",
  "docs/CODE_ARCHITECTURE.md",
  "docs/FILE_STRUCTURE.md",
  "docs/ROADMAP.md",
  "docs/TODO.md",
  "docs/LANE_MASTER_VIDEO_FINDINGS.md",
  "docs/active_plans/goal-objective.md",
  "goal-objective-revised.md",
  "docs/active_plans/user-feedback-plan.md",
  "docs/active_plans/active/practice_records_and_earned_moments.md",
  "docs/CHANGELOG.md",
];

// Kept as a compatibility export for focused callers. `discover_owned_paths()` adds every
// current plan at runtime, including an untracked plan being prepared for review.
export const OWNED_PATHS = CORE_OWNED_PATHS;

const terminal_pattern =
  /\b(final|complete|completion|accept|acceptance|gate|close|closed|done|authority)\b/i;
const dependency_pattern =
  /\b(listen|listening|view|viewing|watch|approve|approval|human|person|review|reviewer)\b/gi;
const requirement_pattern =
  /\b(requires?|required|must|needs?|depends? on|waits? for|only after|before)\b/i;
const negated_requirement_pattern =
  /\b(must not|does not|do not|not required|no|not|without|replace|remove|eliminate|avoid)\b[^.\n]{0,56}\b(requires?|required|must|needs?|depends? on|waits? for|block)\b/i;

// A record is deliberately line-specific: broad exemptions could hide a new completion dependency.
export const ALLOW_RECORDS = [
  {
    path: "docs/HUMAN_GUIDANCE.md",
    line_pattern: /^Human authority remains required for commits,$/,
    reason:
      "Preserves consent boundaries for commits, credentials, releases, and destructive work.",
  },
];

function strip_fenced_code(text) {
  let in_fence = false;
  return text
    .split("\n")
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        in_fence = !in_fence;
        return "";
      }
      return in_fence ? "" : line;
    })
    .join("\n");
}

function is_markdown_plan(relative_path) {
  return (
    relative_path.startsWith("docs/active_plans/") &&
    relative_path.endsWith(".md") &&
    !relative_path.split("/").includes("archive")
  );
}

function is_root_objective_plan(relative_path) {
  return /^goal-objective[^/]*\.md$/.test(relative_path);
}

function collect_markdown_files(directory, root_directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute_path = path.join(directory, entry.name);
    if (entry.isDirectory()) return collect_markdown_files(absolute_path, root_directory);
    if (!entry.isFile() || !entry.name.endsWith(".md")) return [];
    return [path.relative(root_directory, absolute_path)];
  });
}

/**
 * Return explicit policy-bearing documents plus every live plan that can introduce a new gate.
 * The recursive discovery deliberately includes untracked files: an in-flight plan is still a
 * completion contract and must not evade the policy merely because it has not been staged.
 */
export function discover_owned_paths(root_directory) {
  const active_plan_directory = path.join(root_directory, "docs/active_plans");
  const discovered_plans = collect_markdown_files(active_plan_directory, root_directory).filter(
    is_markdown_plan,
  );
  const root_objectives = fs
    .readdirSync(root_directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && is_root_objective_plan(entry.name))
    .map((entry) => entry.name);
  return [...new Set([...CORE_OWNED_PATHS, ...discovered_plans, ...root_objectives])].sort();
}

const TERMINAL_SECTION_HEADINGS = {
  "README.md": ["Status and boundaries"],
  "devel/DEVEL_README.md": ["Repo-local evidence tools"],
  "docs/CODE_ARCHITECTURE.md": ["Known gaps"],
  "docs/FILE_STRUCTURE.md": ["Known gaps"],
  "docs/ROADMAP.md": ["Next priority"],
  "docs/active_plans/goal-objective.md": [
    "Autonomous motion-evidence standard",
    "Completion standard",
  ],
  "goal-objective-revised.md": [
    "Screenshot evidence standard",
    "Autonomous motion-evidence standard",
    "Completion standard",
  ],
  "docs/active_plans/user-feedback-plan.md": ["Acceptance criteria and gates"],
  "docs/active_plans/active/practice_records_and_earned_moments.md": [
    "Acceptance criteria and gates",
  ],
};

function terminal_sections_only(text, relative_path) {
  if (
    is_markdown_plan(relative_path) ||
    relative_path === "docs/TODO.md" ||
    relative_path === "docs/LANE_MASTER_VIDEO_FINDINGS.md"
  ) {
    return text;
  }
  if (relative_path === "AGENTS.md" || relative_path === "docs/HUMAN_GUIDANCE.md") return text;
  if (relative_path === "docs/CHANGELOG.md") {
    const start = text.indexOf("- Added [docs/active_plans/active/collision_audio_excitement.md]");
    const end = text.indexOf("- Added maintained real-worker gameplay evidence", start);
    return start === -1 ? "" : text.slice(start, end === -1 ? undefined : end);
  }
  const headings = TERMINAL_SECTION_HEADINGS[relative_path] ?? [];
  const lines = text.split("\n");
  let selected = false;
  return lines
    .map((line) => {
      const heading = /^#{1,6}\s+(.+?)\s*$/.exec(line);
      if (heading) selected = headings.includes(heading[1]);
      return selected ? line : "";
    })
    .join("\n");
}

function line_number(text, index) {
  return text.slice(0, index).split("\n").length;
}

function is_structural_markdown_line(line) {
  return /^(#{1,6}\s|[-*+]\s|\d+\.\s|\|)/.test(line.trimStart());
}

function logical_markdown_block_at(text, index) {
  const lines = text.split("\n");
  const line = line_number(text, index) - 1;
  if (is_structural_markdown_line(lines[line])) return lines[line];

  let start = line;
  while (start > 0 && lines[start - 1].trim() !== "") {
    if (is_structural_markdown_line(lines[start - 1])) {
      if (/^[-*+]\s/.test(lines[start - 1].trimStart())) start -= 1;
      break;
    }
    start -= 1;
  }

  let end = line;
  while (end + 1 < lines.length && lines[end + 1].trim() !== "") {
    if (is_structural_markdown_line(lines[end + 1])) break;
    end += 1;
  }
  return lines
    .slice(start, end + 1)
    .join(" ")
    .replace(/\s+/g, " ");
}

function sentence_containing(text, dependency) {
  const dependency_pattern_for_sentence = new RegExp(
    `\\b${dependency.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
    "i",
  );
  const sentences = text.match(/[^.!?]+[.!?]*/g) ?? [text];
  return sentences.find((sentence) => dependency_pattern_for_sentence.test(sentence)) ?? text;
}

function requires_personal_perception(dependency, context) {
  const word = dependency.toLowerCase();
  if (
    ["listen", "listening", "approve", "approval", "human", "person", "reviewer"].includes(word)
  ) {
    return true;
  }
  return /\b(human|person|real-time|perceptual|manual)\b/i.test(context);
}

function is_allowed(relative_path, line) {
  return ALLOW_RECORDS.some(
    (record) => record.path === relative_path && record.line_pattern.test(line),
  );
}

export function find_terminal_human_dependencies(text, relative_path) {
  const stripped = terminal_sections_only(strip_fenced_code(text), relative_path);
  const findings = [];
  const dependency_matches = [...stripped.matchAll(dependency_pattern)];

  for (const dependency of dependency_matches) {
    const dependency_index = dependency.index ?? 0;
    const markdown_block = logical_markdown_block_at(stripped, dependency_index);
    const window = sentence_containing(markdown_block, dependency[0]);
    if (!requires_personal_perception(dependency[0], window)) continue;
    if (!terminal_pattern.test(window) || !requirement_pattern.test(window)) continue;
    if (negated_requirement_pattern.test(window)) continue;

    const line = line_number(stripped, dependency_index);
    const line_text = stripped.split("\n")[line - 1] ?? "";
    if (dependency[0].toLowerCase() === "reviewer" && /subagent/i.test(markdown_block)) continue;
    if (is_allowed(relative_path, line_text)) continue;
    findings.push({
      path: relative_path,
      line,
      excerpt: line_text.trim().slice(0, 220),
    });
  }
  return findings;
}

export function verify_autonomous_completion_policy(root_directory) {
  const owned_paths = discover_owned_paths(root_directory);
  if (owned_paths.length === 0) {
    return [{ path: ".", line: 0, excerpt: "no policy inputs were discovered" }];
  }
  return owned_paths.flatMap((relative_path) => {
    const absolute_path = path.join(root_directory, relative_path);
    if (!fs.existsSync(absolute_path)) {
      return [{ path: relative_path, line: 0, excerpt: "required policy input is missing" }];
    }
    return find_terminal_human_dependencies(fs.readFileSync(absolute_path, "utf8"), relative_path);
  });
}

function main() {
  const script_directory = path.dirname(fileURLToPath(import.meta.url));
  const root_directory = path.resolve(script_directory, "..");
  const findings = verify_autonomous_completion_policy(root_directory);
  if (findings.length === 0) {
    console.log("autonomous completion policy: clean");
    return;
  }
  for (const finding of findings) {
    console.error(`${finding.path}:${finding.line}:${finding.excerpt}`);
  }
  process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
