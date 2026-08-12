import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  CORE_OWNED_PATHS,
  OWNED_PATHS,
  discover_owned_paths,
  find_terminal_human_dependencies,
  verify_autonomous_completion_policy,
} from "../devel/verify_autonomous_completion_policy.mjs";

test("policy verifier accepts an unattended fixture gate", () => {
  const findings = find_terminal_human_dependencies(
    "The acceptance gate is the captured fixture and independent-subagent report.",
    "docs/HUMAN_GUIDANCE.md",
  );
  assert.deepEqual(findings, []);
});

test("policy verifier rejects a human listening completion dependency", () => {
  const findings = find_terminal_human_dependencies(
    "The final acceptance gate requires human listening before the milestone can close.",
    "docs/HUMAN_GUIDANCE.md",
  );
  assert.equal(findings.length, 2);
  assert.equal(findings[0].line, 1);
});

test("policy verifier catches terminal human gates across Markdown line wraps", () => {
  const exact_wrap = find_terminal_human_dependencies(
    "The final acceptance gate requires\nhuman listening before closure.",
    "docs/HUMAN_GUIDANCE.md",
  );
  assert.equal(exact_wrap.length, 2);
  assert.equal(exact_wrap[0].line, 2);

  const natural_wrap = find_terminal_human_dependencies(
    "- The final acceptance gate requires a\n  reviewer to listen to the captured cascade\n  before the milestone can close.",
    "docs/HUMAN_GUIDANCE.md",
  );
  assert.equal(natural_wrap.length, 2);
  assert.equal(natural_wrap[0].line, 2);
});

test("policy verifier ignores fenced command examples and examines every owned path", () => {
  const findings = find_terminal_human_dependencies(
    "```text\nfinal gate: human approval\n```\nThe fixture command closes unattended.",
    "README.md",
  );
  assert.deepEqual(findings, []);
  assert.ok(CORE_OWNED_PATHS.includes("docs/TODO.md"));
  assert.ok(CORE_OWNED_PATHS.includes("docs/LANE_MASTER_VIDEO_FINDINGS.md"));
  assert.ok(OWNED_PATHS.includes("docs/active_plans/goal-objective.md"));
  assert.deepEqual(verify_autonomous_completion_policy(process.cwd()), []);
});

test("policy verifier discovers an untracked active plan and rejects its listening gate", () => {
  const temporary_plan = path.join(
    process.cwd(),
    "docs/active_plans/active/_policy_probe_untracked.md",
  );
  fs.writeFileSync(
    temporary_plan,
    "# Temporary plan\n\n## Acceptance gate\n\nHuman listening is required before final closure.\n",
  );
  try {
    assert.ok(
      discover_owned_paths(process.cwd()).includes(
        "docs/active_plans/active/_policy_probe_untracked.md",
      ),
    );
    const findings = verify_autonomous_completion_policy(process.cwd());
    assert.ok(findings.some((finding) => finding.path.endsWith("_policy_probe_untracked.md")));
  } finally {
    fs.unlinkSync(temporary_plan);
  }
});

test("policy verifier accepts clean autonomous active-plan wording", () => {
  const findings = find_terminal_human_dependencies(
    "# Plan\n\n## Acceptance gate\n\nThe captured fixture, synthetic transition, and zero-exit behavior probe close the milestone unattended.\n",
    "docs/active_plans/active/example.md",
  );
  assert.deepEqual(findings, []);

  const wrapped_findings = find_terminal_human_dependencies(
    "# Plan\n\n## Acceptance gate\n\nThe captured fixture and synthetic transition\nproduce a report that closes the milestone\nunattended.",
    "docs/active_plans/active/example.md",
  );
  assert.deepEqual(wrapped_findings, []);
});

test("policy verifier reports missing core policy inputs instead of silently scanning nothing", () => {
  const empty_root = fs.mkdtempSync(path.join(os.tmpdir(), "super-bowling-policy-"));
  try {
    const findings = verify_autonomous_completion_policy(empty_root);
    assert.ok(findings.some((finding) => finding.excerpt === "required policy input is missing"));
  } finally {
    fs.rmSync(empty_root, { recursive: true, force: true });
  }
});

test("policy verifier permits only the line-specific consent boundary", () => {
  const allowed = find_terminal_human_dependencies(
    "Human authority remains required for commits,\ncredential use, releases, destructive operations, or external-state changes that need consent.",
    "docs/HUMAN_GUIDANCE.md",
  );
  assert.deepEqual(allowed, []);
});
