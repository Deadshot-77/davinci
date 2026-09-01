const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { foundationErrors, gitPorcelainLines } = require('../validate-report.js');
const { knownAgents } = require('../lib/agents.js');

// --- foundationErrors: the report gate's actual stack-profile decision ---
//
// Ruling R2 required this in both directions: a trivial infra report with
// no scaffold evidence passes with no profile present, and a report showing
// a genuine scaffold with no profile present still fails. Previously
// untested -- validate-report.js had no test coverage at all, and the
// requiresStackProfile() function this decision used to bypass was tested
// but never called by anything.

test('a trivial infra report (no scaffold evidence) passes with no stack profile present', () => {
  const errors = foundationErrors(
    'infra-architect',
    ['.devteam/reports/infra-architect-1.json'],
    [],
    null,
    null);
  assert.deepStrictEqual(errors, []);
});

test('a genuine scaffold with no stack profile present still fails', () => {
  const errors = foundationErrors(
    'infra-architect',
    ['package.json', 'src/lib/db.ts'],
    [],
    null,
    null);
  assert.ok(errors.length > 0);
  assert.ok(errors.some((e) => /stack-profile\.md was not created/.test(e)));
});

test('a genuine scaffold detected only via git (report under-reports) still fails without a profile', () => {
  const errors = foundationErrors(
    'infra-architect',
    ['.devteam/reports/infra-architect-1.json'],
    [' M package.json'],
    null,
    null);
  assert.ok(errors.some((e) => /stack-profile\.md was not created/.test(e)));
});

test('a genuine scaffold with a complete stack profile passes', () => {
  const profile = [
    '## Framework', '', 'Next.js 15', '',
    '## Language', '', 'TypeScript 5', '',
    '## Package manager', '', 'npm', '',
    '## Directory map', '', 'src/app', '',
    '## Naming conventions', '', 'kebab-case', '',
    '## Testing', '', 'vitest', '',
    '## Commands', '', 'npm run dev', '',
    '## Available to build with', '', 'framer-motion 11; no GSAP', '',
  ].join('\n');
  const errors = foundationErrors('infra-architect', ['package.json'], [], profile, null);
  assert.deepStrictEqual(errors, []);
});

test('a non-infra agent never triggers the foundation check, scaffold evidence or not', () => {
  const errors = foundationErrors('frontend-engineer', ['package.json'], [' M package.json'], null, null);
  assert.deepStrictEqual(errors, []);
});

// --- gitPorcelainLines: cwd-relative, not repo-root-relative ---
//
// git status --porcelain reports paths relative to the repo root. A project
// living in a subdirectory of a larger repo saw those paths come back
// prefixed ("sub/.devteam/brief.md"), which scaffoldEvidence()'s
// outside-.devteam check misread as outside .devteam/, firing the gate
// unconditionally. These tests build a real temp git repo with the project
// one level down and confirm the returned lines are relative to that
// subdirectory.

// The repo's "sub" directory (where the project lives, one level below the
// repo root) and its ".devteam" subdirectory are committed up front as part
// of the initial commit. Otherwise git treats a wholly new, never-tracked
// directory as one opaque unit -- "?? sub/" -- which collapses to nothing
// useful once the "sub/" prefix is stripped, and would not reproduce the
// bug this fix targets (individual paths *inside* an already-tracked
// subdirectory coming back repo-root-relative instead of cwd-relative).
function mkTempRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'davinci-git-'));
  const opts = { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'] };
  execFileSync('git', ['init', '-q'], opts);
  execFileSync('git', ['config', 'user.email', 'test@example.com'], opts);
  execFileSync('git', ['config', 'user.name', 'Test'], opts);
  fs.writeFileSync(path.join(dir, 'README.md'), 'root readme\n');
  fs.mkdirSync(path.join(dir, 'sub', '.devteam'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'sub', '.gitkeep'), '');
  fs.writeFileSync(path.join(dir, 'sub', '.devteam', '.gitkeep'), '');
  execFileSync('git', ['add', '-A'], opts);
  execFileSync('git', ['commit', '-q', '-m', 'init'], opts);
  return dir;
}

test('gitPorcelainLines returns paths relative to cwd, not the repo root, for a project in a subdirectory', () => {
  const repo = mkTempRepo();
  try {
    const sub = path.join(repo, 'sub');
    fs.mkdirSync(path.join(sub, '.devteam'), { recursive: true });
    fs.writeFileSync(path.join(sub, '.devteam', 'brief.md'), 'brief\n');
    fs.writeFileSync(path.join(sub, 'package.json'), '{}\n');

    const lines = gitPorcelainLines(sub);
    const paths = lines.map((l) => l.slice(3).trim());

    assert.ok(paths.includes('.devteam/brief.md'),
      'expected a cwd-relative .devteam path, got: ' + JSON.stringify(paths));
    assert.ok(paths.includes('package.json'),
      'expected a cwd-relative package.json path, got: ' + JSON.stringify(paths));
    assert.ok(!paths.some((p) => p.startsWith('sub/')),
      'a repo-root-relative "sub/..." path leaked through unstripped: ' + JSON.stringify(paths));
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('a subdirectory project with only .devteam/ changes is not mistaken for a scaffold', () => {
  const { scaffoldEvidence } = require('../lib/foundation.js');
  const repo = mkTempRepo();
  try {
    const sub = path.join(repo, 'sub');
    fs.mkdirSync(path.join(sub, '.devteam'), { recursive: true });
    fs.writeFileSync(path.join(sub, '.devteam', 'brief.md'), 'brief\n');

    const lines = gitPorcelainLines(sub);
    assert.strictEqual(scaffoldEvidence([], lines), false,
      'unrelated .devteam/-only changes in a subdirectory project should not read as scaffold evidence');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('a subdirectory project with a real scaffold change is still detected via git', () => {
  const { scaffoldEvidence } = require('../lib/foundation.js');
  const repo = mkTempRepo();
  try {
    const sub = path.join(repo, 'sub');
    fs.mkdirSync(sub, { recursive: true });
    fs.writeFileSync(path.join(sub, 'package.json'), '{}\n');

    const lines = gitPorcelainLines(sub);
    assert.strictEqual(scaffoldEvidence([], lines), true,
      'a genuine scaffold in a subdirectory project should still be detected via git');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('gitPorcelainLines degrades to an empty array outside a git repository, without throwing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'davinci-nogit-'));
  try {
    assert.deepStrictEqual(gitPorcelainLines(dir), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// --- the give-up loop bound, run as the real hook process ---
//
// Reproduces the live defect directly: a dispatch tells security-engineer
// to write no files, so no report ever appears. Before the fix, the gate
// rejected this forever. After the fix, it must reject exactly three times
// (with escalating warnings on the 2nd and 3rd) and then, on the fourth
// consecutive rejection, give up loudly instead of blocking again: write a
// GATE-FAILED report and exit 0 so the agent can stop.

function runHookOnce(cwd, agentType) {
  const hookPath = path.join(__dirname, '..', 'validate-report.js');
  try {
    const stdout = execFileSync(process.execPath, [hookPath], {
      cwd, input: JSON.stringify({ agent_type: agentType, cwd }), encoding: 'utf8',
    });
    return { status: 0, stdout };
  } catch (err) {
    return { status: err.status, stdout: err.stdout || '' };
  }
}

test('the gate rejects three times with escalating warnings, then gives up loudly on the fourth', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'davinci-gate-'));
  try {
    fs.mkdirSync(path.join(cwd, '.devteam', 'reports'), { recursive: true });
    const counterPath = path.join(cwd, '.devteam', '.gate-attempts-security-engineer.json');
    const gateFailedPath = path.join(cwd, '.devteam', 'reports', 'security-engineer-GATE-FAILED.json');

    // No security-engineer-<n>.json report ever exists, exactly as when a
    // dispatch forbids the agent from writing any file at all.
    const r1 = runHookOnce(cwd, 'security-engineer');
    assert.strictEqual(r1.status, 2, 'first rejection must still block');
    assert.strictEqual(JSON.parse(fs.readFileSync(counterPath, 'utf8')).attempts, 1);
    assert.ok(!fs.existsSync(gateFailedPath));

    const r2 = runHookOnce(cwd, 'security-engineer');
    assert.strictEqual(r2.status, 2, 'second rejection must still block');
    assert.strictEqual(JSON.parse(fs.readFileSync(counterPath, 'utf8')).attempts, 2);
    const ctx2 = JSON.parse(r2.stdout).hookSpecificOutput.additionalContext;
    assert.match(ctx2, /attempt.*remain/i, 'second rejection must warn how many attempts remain');

    const r3 = runHookOnce(cwd, 'security-engineer');
    assert.strictEqual(r3.status, 2, 'third rejection must still block');
    assert.strictEqual(JSON.parse(fs.readFileSync(counterPath, 'utf8')).attempts, 3);
    const ctx3 = JSON.parse(r3.stdout).hookSpecificOutput.additionalContext;
    assert.match(ctx3, /attempt.*remain/i, 'third rejection must warn how many attempts remain');

    const r4 = runHookOnce(cwd, 'security-engineer');
    assert.strictEqual(r4.status, 0, 'fourth consecutive rejection must give up, not block again');
    assert.ok(fs.existsSync(gateFailedPath), 'a GATE-FAILED report must be written when the gate gives up');
    const gateFailed = JSON.parse(fs.readFileSync(gateFailedPath, 'utf8'));
    assert.strictEqual(gateFailed.agent, 'security-engineer');
    assert.strictEqual(gateFailed.attempts, 4);
    assert.ok(Array.isArray(gateFailed.errors) && gateFailed.errors.length > 0);
    assert.ok(!fs.existsSync(counterPath), 'the counter must be cleared once the gate gives up');
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('a successful validation clears any prior attempt counter', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'davinci-gate-ok-'));
  try {
    const devteam = path.join(cwd, '.devteam');
    fs.mkdirSync(path.join(devteam, 'reports'), { recursive: true });
    const counterPath = path.join(devteam, '.gate-attempts-frontend-engineer.json');
    fs.writeFileSync(counterPath, JSON.stringify({ attempts: 2 }));
    fs.writeFileSync(path.join(devteam, 'reports', 'frontend-engineer-1.json'), JSON.stringify({
      agent: 'frontend-engineer',
      status: 'complete',
      model: 'sonnet',
      files_changed: ['app/page.tsx'],
      criteria_addressed: ['AC-1'],
      verification: [{ cmd: 'npm run build', exit_code: 0 }],
      assumptions: [],
      handoff_notes: 'Done.',
    }));

    const result = runHookOnce(cwd, 'frontend-engineer');
    assert.strictEqual(result.status, 0);
    assert.ok(!fs.existsSync(counterPath), 'a passing report must clear the attempt counter');
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

// --- governance is derived from knownAgents(), not a hand-maintained list ---
//
// validate-report.js used to hardcode which agents it governs in a GOVERNED
// array -- a third source of truth alongside scope-map.json and the agents/
// directory that knownAgents() already reads. review-lens shipped in
// agents/ but nobody remembered to add it to that array, so the report gate
// silently let it finish without ever filing a report. These tests run the
// real hook process against every agent knownAgents() actually finds on
// disk, so a regression back to a hand-maintained list -- which leaves any
// newly shipped agent ungoverned -- fails the suite instead of shipping
// quietly again.

const NO_REPORT_EXCEPTIONS = new Set(['tech-lead']);

test('every agent in knownAgents() except tech-lead is governed by the report validator', () => {
  for (const agent of knownAgents()) {
    if (NO_REPORT_EXCEPTIONS.has(agent)) continue;
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'davinci-governance-'));
    try {
      fs.mkdirSync(path.join(cwd, '.devteam', 'reports'), { recursive: true });
      const result = runHookOnce(cwd, agent);
      assert.strictEqual(result.status, 2,
        `${agent} is shipped in agents/ but the report gate did not demand a report from it ` +
        `(exit ${result.status}) -- it has fallen through the governance check.`);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  }
});

test('tech-lead filing no report at all remains fine', () => {
  for (const agent of NO_REPORT_EXCEPTIONS) {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'davinci-governance-'));
    try {
      fs.mkdirSync(path.join(cwd, '.devteam', 'reports'), { recursive: true });
      const result = runHookOnce(cwd, agent);
      assert.strictEqual(result.status, 0, `${agent} is control-plane and should not be required to file a report`);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  }
});

function writeReviewLensReport(cwd, overrides) {
  fs.mkdirSync(path.join(cwd, '.devteam', 'reports'), { recursive: true });
  const report = Object.assign({
    agent: 'review-lens',
    status: 'complete',
    model: 'sonnet',
    files_changed: [],
    criteria_addressed: ['AC-1'],
    verification: [{ cmd: 'git diff --stat HEAD~1', exit_code: 0 }],
    assumptions: [],
    handoff_notes: 'Reviewed the correctness lens.',
  }, overrides);
  fs.writeFileSync(path.join(cwd, '.devteam', 'reports', 'review-lens-1.json'), JSON.stringify(report));
}

test('review-lens filing a report with no verdict is rejected', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'davinci-lens-'));
  try {
    writeReviewLensReport(cwd, {});
    const result = runHookOnce(cwd, 'review-lens');
    assert.strictEqual(result.status, 2, 'a review-lens report with no verdict should be rejected');
    const ctx = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
    assert.match(ctx, /verdict/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('review-lens filing a report with verdict "pass" is accepted', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'davinci-lens-'));
  try {
    writeReviewLensReport(cwd, { verdict: 'pass', findings: [] });
    const result = runHookOnce(cwd, 'review-lens');
    assert.strictEqual(result.status, 0, 'a well-formed review-lens report should be accepted');
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

// --- the give-up counter is keyed per instance, not per agent type ---
//
// Live evidence: a fan-out of four concurrent review-lens instances shared
// one .gate-attempts-review-lens.json counter keyed on agent type alone.
// Their rejection attempts pooled, the four-attempt cap tripped
// collectively, and one lens that had submitted a perfectly valid report
// got refused anyway -- byte-identical rejection text regardless of what it
// changed -- because its siblings had already exhausted the shared budget.
// These tests run the real hook process with distinct agent_id values (as
// Claude Code supplies per subagent instance) and confirm each instance now
// gets its own counter file and its own independent give-up budget.

function runHookWithId(cwd, agentType, agentId) {
  const hookPath = path.join(__dirname, '..', 'validate-report.js');
  try {
    const stdout = execFileSync(process.execPath, [hookPath], {
      cwd, input: JSON.stringify({ agent_type: agentType, agent_id: agentId, cwd }), encoding: 'utf8',
    });
    return { status: 0, stdout };
  } catch (err) {
    return { status: err.status, stdout: err.stdout || '' };
  }
}

test('two concurrent review-lens instances get independent attempt counters, keyed on agent_id', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'davinci-gate-concurrent-'));
  try {
    fs.mkdirSync(path.join(cwd, '.devteam', 'reports'), { recursive: true });

    // siblingA rejects three times in a row (no report ever appears for it,
    // same as the live "dispatch forbids writing" scenario) -- its own
    // counter must climb to 3 without tripping the give-up valve early.
    runHookWithId(cwd, 'review-lens', 'siblingA');
    runHookWithId(cwd, 'review-lens', 'siblingA');
    const a3 = runHookWithId(cwd, 'review-lens', 'siblingA');
    assert.strictEqual(a3.status, 2, 'siblingA third rejection must still block, not give up early');
    const counterA = path.join(cwd, '.devteam', '.gate-attempts-review-lens-siblingA.json');
    assert.strictEqual(JSON.parse(fs.readFileSync(counterA, 'utf8')).attempts, 3);

    // siblingB's very first rejection must land as attempt 1, not attempt 4
    // -- it must not inherit siblingA's exhausted, pooled count.
    const b1 = runHookWithId(cwd, 'review-lens', 'siblingB');
    assert.strictEqual(b1.status, 2, 'siblingB first rejection must still block');
    const counterB = path.join(cwd, '.devteam', '.gate-attempts-review-lens-siblingB.json');
    assert.strictEqual(JSON.parse(fs.readFileSync(counterB, 'utf8')).attempts, 1,
      "siblingB must have its own independent counter, not inherit siblingA's pooled count");
    assert.ok(fs.existsSync(counterA), "siblingA's counter must be unaffected by siblingB's run");
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('a successful validation clears only that instance\'s counter, leaving a sibling\'s counter untouched', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'davinci-gate-ok-concurrent-'));
  try {
    const devteam = path.join(cwd, '.devteam');
    fs.mkdirSync(path.join(devteam, 'reports'), { recursive: true });
    const counterA = path.join(devteam, '.gate-attempts-review-lens-siblingA.json');
    const counterB = path.join(devteam, '.gate-attempts-review-lens-siblingB.json');
    fs.writeFileSync(counterA, JSON.stringify({ attempts: 2 }));
    fs.writeFileSync(counterB, JSON.stringify({ attempts: 2 }));
    writeReviewLensReport(cwd, { verdict: 'pass', findings: [] });

    const result = runHookWithId(cwd, 'review-lens', 'siblingA');
    assert.strictEqual(result.status, 0);
    assert.ok(!fs.existsSync(counterA), "siblingA's own counter must be cleared on its success");
    assert.ok(fs.existsSync(counterB), "siblingB's counter must be untouched by siblingA's success");
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('a missing agent_id falls back to the plain per-agent counter filename, unchanged', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'davinci-gate-fallback-'));
  try {
    fs.mkdirSync(path.join(cwd, '.devteam', 'reports'), { recursive: true });
    const r1 = runHookOnce(cwd, 'review-lens'); // no agent_id in the input at all
    assert.strictEqual(r1.status, 2);
    const counterPath = path.join(cwd, '.devteam', '.gate-attempts-review-lens.json');
    assert.ok(fs.existsSync(counterPath), 'a caller with no agent_id must still get the plain, un-suffixed counter file');
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

// --- de-duplicated rejection text ---
//
// validateReport() and validateGateReport() both check the verdict field,
// added independently for different reasons. A gate report with an invalid
// (but present) verdict value triggers the identical "Unknown verdict ..."
// message from both, so it used to appear twice in one rejection. Harmless,
// but an agent reading its own rejection sees the same complaint
// duplicated. Neither check should be removed -- only the missing-verdict
// case is caught by validateGateReport() alone -- so this confirms the
// final rejection text carries the message once.

test('an invalid gate verdict produces the "Unknown verdict" message once, not duplicated', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'davinci-lens-dup-'));
  try {
    writeReviewLensReport(cwd, { verdict: 'pass-with-findings', findings: [] });
    const result = runHookOnce(cwd, 'review-lens');
    assert.strictEqual(result.status, 2);
    const ctx = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
    const occurrences = (ctx.match(/Unknown verdict/g) || []).length;
    assert.strictEqual(occurrences, 1, `expected "Unknown verdict" exactly once, got ${occurrences} in: ${ctx}`);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('a missing gate verdict is still reported (the check validateReport() alone cannot make)', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'davinci-lens-missing-'));
  try {
    writeReviewLensReport(cwd, {});
    const result = runHookOnce(cwd, 'review-lens');
    assert.strictEqual(result.status, 2);
    const ctx = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
    assert.match(ctx, /must report a "verdict"/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
