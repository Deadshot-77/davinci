const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { validateReport, validateGateReport, nextGateAttempt, matchReportFiles, gateAttemptKey } = require('../lib/report.js');

function valid() {
  return {
    agent: 'infra-architect',
    status: 'complete',
    files_changed: ['package.json'],
    criteria_addressed: ['AC-1'],
    verification: [{ cmd: 'npm run build', exit_code: 0 }],
    assumptions: [],
    handoff_notes: 'Scaffold created.',
  };
}

test('a well-formed complete report passes', () => {
  assert.deepStrictEqual(validateReport(valid(), 'infra-architect'), []);
});

test('missing required field is reported', () => {
  const r = valid();
  delete r.verification;
  assert.ok(validateReport(r, 'infra-architect').some((e) => /verification/.test(e)));
});

test('agent name mismatch is reported', () => {
  assert.ok(validateReport(valid(), 'tech-lead').some((e) => /does not match/.test(e)));
});

test('unknown status is reported', () => {
  const r = valid();
  r.status = 'done';
  assert.ok(validateReport(r, 'infra-architect').some((e) => /status/.test(e)));
});

test('complete with empty verification is reported', () => {
  const r = valid();
  r.verification = [];
  assert.ok(validateReport(r, 'infra-architect').some((e) => /verification/.test(e)));
});

test('complete with empty criteria_addressed is reported', () => {
  const r = valid();
  r.criteria_addressed = [];
  assert.ok(validateReport(r, 'infra-architect').some((e) => /criteria/.test(e)));
});

test('verification entry without a real exit code is reported', () => {
  const r = valid();
  r.verification = [{ cmd: 'npm test' }];
  assert.ok(validateReport(r, 'infra-architect').some((e) => /exit_code/.test(e)));
});

test('placeholder text anywhere is reported', () => {
  const r = valid();
  r.handoff_notes = 'TODO: finish this';
  assert.ok(validateReport(r, 'infra-architect').some((e) => /placeholder/i.test(e)));
});

test('blocked status does not require verification', () => {
  const r = valid();
  r.status = 'blocked';
  r.verification = [];
  r.criteria_addressed = [];
  assert.deepStrictEqual(validateReport(r, 'infra-architect'), []);
});

test('a blocking finding without a criterion is reported', () => {
  const r = valid();
  r.verdict = 'fail';
  r.findings = [{ severity: 'blocking', criterion: '', description: 'looks wrong' }];
  assert.ok(validateReport(r, 'infra-architect').some((e) => /criterion/.test(e)));
});

test('a blocking finding citing the reserved SECURITY criterion passes validation', () => {
  const r = valid();
  r.verdict = 'fail';
  r.findings = [{ severity: 'blocking', criterion: 'SECURITY', description: 'exposed API token in source' }];
  assert.deepStrictEqual(validateReport(r, 'infra-architect'), []);
});

test('a blocking finding citing an AC-<n> criterion passes validation', () => {
  const r = valid();
  r.verdict = 'fail';
  r.findings = [{ severity: 'blocking', criterion: 'AC-3', description: 'does not meet acceptance criterion' }];
  assert.deepStrictEqual(validateReport(r, 'infra-architect'), []);
});

test('a blocking finding with a missing criterion is rejected', () => {
  const r = valid();
  r.verdict = 'fail';
  r.findings = [{ severity: 'blocking', description: 'looks wrong' }];
  assert.ok(validateReport(r, 'infra-architect').some((e) => /criterion/.test(e)));
});

test('an advisory finding with no criterion is accepted', () => {
  const r = valid();
  r.verdict = 'pass';
  r.findings = [{ severity: 'advisory', description: 'nice to have, not blocking' }];
  assert.deepStrictEqual(validateReport(r, 'infra-architect'), []);
});

test('paths and commands are exempt from the placeholder scan', () => {
  const r = valid();
  r.files_changed = ['src/fixtures/placeholder.png'];
  r.verification = [{ cmd: 'npm run build -- --todo-check', exit_code: 0 }];
  assert.deepStrictEqual(validateReport(r, 'infra-architect'), []);
});

// node --test prints a "todo" count in its own summary output. An agent
// quoting that genuine runner output in a verification note was getting its
// report rejected by the placeholder scan -- a false positive that once led
// an agent to elide a runner label just to get past the gate, corrupting
// real evidence to satisfy a false alarm. The whole verification array is
// machine output, not prose, so it is exempt the same way files_changed is.
test('a verification note containing runner output like "todo 0" and "skipped 1" is exempt from the placeholder scan', () => {
  const r = valid();
  r.verification = [{
    cmd: 'node --test "hooks/test/**/*.test.js"',
    exit_code: 0,
    note: 'tests 113 pass 113 fail 0 cancelled 0 skipped 1 todo 0',
  }];
  assert.deepStrictEqual(validateReport(r, 'infra-architect'), []);
});

test('TODO in handoff_notes is still rejected even though verification is exempt', () => {
  const r = valid();
  r.verification = [{
    cmd: 'node --test',
    exit_code: 0,
    note: 'tests 1 pass 1 fail 0 todo 0 skipped 0',
  }];
  r.handoff_notes = 'TODO: still need to wire this up';
  const errors = validateReport(r, 'infra-architect');
  assert.ok(errors.some((e) => /placeholder/i.test(e)));
});

// --- builders prove completion with commands; gates prove it with a verdict ---
//
// A live review-lens fan-out produced a "silent-failure" lens report with
// status "complete" and no verification entries, which the old rule
// rejected -- but a read-only reviewer's work IS reading code. It has no
// write tools and often no permission to run commands, so demanding a shell
// command to prove it reviewed something just invites a fabricated one. The
// fix: a report that carries a "verdict" key proves completion with that
// verdict instead of a verification entry. Every other agent's rule (real
// commands, real exit codes) is unchanged.

function gateReport(overrides) {
  return Object.assign({
    agent: 'review-lens',
    status: 'complete',
    files_changed: [],
    criteria_addressed: ['AC-1'],
    verification: [],
    assumptions: [],
    handoff_notes: 'Reviewed the diff; nothing blocking.',
    verdict: 'pass',
    findings: [],
  }, overrides);
}

test('a gate report with verdict "pass", status "complete" and empty verification is accepted', () => {
  assert.deepStrictEqual(validateReport(gateReport(), 'review-lens'), []);
});

test('a builder report with status "complete" and empty verification is still rejected', () => {
  const r = valid();
  r.verification = [];
  assert.ok(validateReport(r, 'infra-architect').some((e) => /verification/.test(e)));
});

test('a report with status "partial" is rejected and the message names the three legal values', () => {
  const r = valid();
  r.status = 'partial';
  const errors = validateReport(r, 'infra-architect');
  const msg = errors.find((e) => /status/i.test(e));
  assert.ok(msg, 'expected a status-related error');
  assert.match(msg, /complete/);
  assert.match(msg, /blocked/);
  assert.match(msg, /needs_input/);
});

test('a report with verdict "pass-with-findings" is rejected and the message names the two legal values', () => {
  const r = gateReport({ verdict: 'pass-with-findings' });
  const errors = validateReport(r, 'review-lens');
  const msg = errors.find((e) => /verdict/i.test(e));
  assert.ok(msg, 'expected a verdict-related error');
  assert.match(msg, /pass/);
  assert.match(msg, /fail/);
});

test('a gate report with verdict "pass" and zero findings is accepted', () => {
  const r = gateReport({ findings: [] });
  assert.deepStrictEqual(validateReport(r, 'review-lens'), []);
});

test('a gate report without a verdict is rejected', () => {
  assert.ok(validateGateReport(valid()).some((e) => /verdict/.test(e)));
});

test('a gate report with a valid verdict passes', () => {
  const r = valid();
  r.verdict = 'pass';
  assert.deepStrictEqual(validateGateReport(r), []);
});

// --- nextGateAttempt: the report gate's loop-bound decision ---
//
// A live dispatch told security-engineer to write no files, and the report
// gate rejected its finish eight times in a row, each time demanding a
// report the dispatch had forbidden -- thirteen minutes burned for no
// output. nextGateAttempt is the pure decision behind the fix: escalate the
// attempt count on each rejection, and after the third rejection (the
// fourth call), tell the wrapper to stop rejecting and give up instead.

test('nextGateAttempt escalates the attempt count by one each call', () => {
  assert.deepStrictEqual(nextGateAttempt(0), { attempts: 1, giveUp: false });
  assert.deepStrictEqual(nextGateAttempt(1), { attempts: 2, giveUp: false });
  assert.deepStrictEqual(nextGateAttempt(2), { attempts: 3, giveUp: false });
});

test('nextGateAttempt gives up on the fourth attempt, not before', () => {
  assert.strictEqual(nextGateAttempt(2).giveUp, false);
  assert.strictEqual(nextGateAttempt(3).giveUp, true);
  assert.deepStrictEqual(nextGateAttempt(3), { attempts: 4, giveUp: true });
});

test('nextGateAttempt keeps giving up on any further call once past the limit', () => {
  assert.strictEqual(nextGateAttempt(4).giveUp, true);
  assert.strictEqual(nextGateAttempt(10).giveUp, true);
});

test('nextGateAttempt treats a missing or invalid counter as zero', () => {
  assert.deepStrictEqual(nextGateAttempt(undefined), { attempts: 1, giveUp: false });
  assert.deepStrictEqual(nextGateAttempt(-1), { attempts: 1, giveUp: false });
  assert.deepStrictEqual(nextGateAttempt(NaN), { attempts: 1, giveUp: false });
});

test('the example report in delegation-contract SKILL.md validates cleanly', () => {
  const skillPath = path.join(__dirname, '..', '..', 'skills', 'delegation-contract', 'SKILL.md');
  const skillText = fs.readFileSync(skillPath, 'utf8');
  const match = skillText.match(/```json\r?\n([\s\S]*?)```/);
  assert.ok(match, 'SKILL.md must contain a fenced ```json example block');
  const example = JSON.parse(match[1]);
  assert.deepStrictEqual(validateReport(example, example.agent), []);
});

// --- matchReportFiles: which report files belong to which agent ---
//
// Four concurrent review-lens instances raced on the old single-instance
// filename convention (<agent>-<n>.json), each choosing <n> by looking at
// what existed on disk, and collided. They disambiguated themselves with
// <agent>-<label>-<n>.json instead -- a sensible instinct the validator's
// regex (^<agent>-\d+\.json$) could not see, so it reported "No report
// found" and bounced them anyway. matchReportFiles is the pure filename
// decision pulled out of that regex: given an agent name and a directory
// listing already read by the caller, which names belong to this agent, in
// oldest-to-newest order. It touches no filesystem itself, so every case
// below is a plain array in, array out.

test('matchReportFiles matches the original single-instance form <agent>-<n>.json', () => {
  const files = ['infra-architect-1.json', 'infra-architect-2.json', 'security-engineer-1.json'];
  assert.deepStrictEqual(
    matchReportFiles('infra-architect', files),
    ['infra-architect-1.json', 'infra-architect-2.json']
  );
});

test('matchReportFiles matches the labeled concurrency-safe form <agent>-<label>-<n>.json', () => {
  const files = ['review-lens-secrets-1.json', 'review-lens-correctness-1.json'];
  assert.deepStrictEqual(
    matchReportFiles('review-lens', files).sort(),
    ['review-lens-correctness-1.json', 'review-lens-secrets-1.json']
  );
});

test('matchReportFiles matches both the plain and labeled forms together', () => {
  const files = ['review-lens-1.json', 'review-lens-secrets-2.json'];
  const result = matchReportFiles('review-lens', files);
  assert.ok(result.includes('review-lens-1.json'));
  assert.ok(result.includes('review-lens-secrets-2.json'));
});

test('matchReportFiles accepts a label containing hyphens', () => {
  // The label is free text ("the lens you were told to run, the component
  // you were assigned, or similar"), so it may itself contain hyphens --
  // review-lens's own "silent-failure" lens is exactly this shape.
  assert.deepStrictEqual(
    matchReportFiles('review-lens', ['review-lens-silent-failure-2.json']),
    ['review-lens-silent-failure-2.json']
  );
  assert.deepStrictEqual(
    matchReportFiles('review-lens', ['review-lens-extra-agent-1.json']),
    ['review-lens-extra-agent-1.json']
  );
});

test('matchReportFiles sorts by trailing number, not string order, so -10 comes after -9', () => {
  const files = ['review-lens-secrets-10.json', 'review-lens-secrets-9.json', 'review-lens-secrets-2.json'];
  assert.deepStrictEqual(
    matchReportFiles('review-lens', files),
    ['review-lens-secrets-2.json', 'review-lens-secrets-9.json', 'review-lens-secrets-10.json']
  );
});

test('matchReportFiles never matches a different agent\'s reports', () => {
  const files = ['code-reviewer-1.json', 'security-engineer-1.json'];
  assert.deepStrictEqual(matchReportFiles('review-lens', files), []);
});

// code-reviewer is a real agent shipped in agents/ whose name has "code" as
// a literal string prefix. A shorter agent name that happens to be a prefix
// of a longer, distinct agent's name must not swallow that longer agent's
// reports by misreading the rest of its name as a label -- the exact
// mistake naive prefix matching makes.
test('matchReportFiles does not let a prefix agent name pick up a longer, distinct agent\'s reports', () => {
  assert.deepStrictEqual(matchReportFiles('code', ['code-reviewer-1.json']), []);
  assert.deepStrictEqual(matchReportFiles('code-reviewer', ['code-reviewer-1.json']), ['code-reviewer-1.json']);
});

test('matchReportFiles returns an empty list when nothing matches', () => {
  assert.deepStrictEqual(matchReportFiles('review-lens', []), []);
  assert.deepStrictEqual(matchReportFiles('review-lens', ['unrelated.json', 'review-lens-GATE-FAILED.json']), []);
});

// --- gateAttemptKey: per-instance identity for the give-up loop bound ---
//
// The give-up valve's attempt counter used to live at
// .devteam/.gate-attempts-<agent>.json, keyed on agent TYPE alone. Four
// concurrent review-lens instances therefore shared one counter: their
// rejection attempts pooled, the four-attempt cap tripped collectively, and
// a lens that had actually submitted a valid report got refused anyway
// because its siblings had already exhausted the shared budget. Hook input
// carries agent_id, unique per subagent instance -- gateAttemptKey is the
// pure key derivation (agent name plus that id, sanitised for a filename)
// pulled out of the counter path so it is unit-testable without touching
// the filesystem. The wrapper in validate-report.js does the actual path
// join and file I/O.

test("gateAttemptKey('review-lens','abc123') and gateAttemptKey('review-lens','def456') differ", () => {
  assert.notStrictEqual(gateAttemptKey('review-lens', 'abc123'), gateAttemptKey('review-lens', 'def456'));
});

test('two different ids for the same agent never collide', () => {
  const seen = new Set();
  for (const id of ['abc123', 'def456', 'ghijkl', 'zzz999', 'a', 'ab']) {
    const key = gateAttemptKey('review-lens', id);
    assert.ok(!seen.has(key), `duplicate key produced for id "${id}": ${key}`);
    seen.add(key);
  }
});

test('a missing agentId falls back to the agent name alone', () => {
  assert.strictEqual(gateAttemptKey('review-lens', undefined), 'review-lens');
  assert.strictEqual(gateAttemptKey('review-lens', null), 'review-lens');
});

test('an empty agentId falls back to the agent name alone', () => {
  assert.strictEqual(gateAttemptKey('review-lens', ''), 'review-lens');
});

test('an id containing path-hostile characters is sanitised to a safe filename fragment', () => {
  const key = gateAttemptKey('review-lens', '../../etc/passwd');
  assert.match(key, /^[A-Za-z0-9_-]+$/, `key must be a safe filename fragment, got: ${key}`);
  assert.ok(!key.includes('/') && !key.includes('\\'), `key must contain no path separators: ${key}`);
  assert.ok(!key.includes('..'), `key must contain no traversal segment: ${key}`);
});

test('an id containing colons and spaces is sanitised to a safe filename fragment', () => {
  const key = gateAttemptKey('review-lens', 'abc:123 def');
  assert.match(key, /^[A-Za-z0-9_-]+$/, `key must be a safe filename fragment, got: ${key}`);
});

test('a sanitised id cannot escape the .devteam/ directory when joined into a path', () => {
  const key = gateAttemptKey('review-lens', '../../../../outside');
  const projectRoot = path.resolve('/project');
  const devteamRoot = path.join(projectRoot, '.devteam');
  const resolved = path.resolve(devteamRoot, `.gate-attempts-${key}.json`);
  assert.ok(resolved === path.join(devteamRoot, `.gate-attempts-${key}.json`) &&
    resolved.startsWith(devteamRoot + path.sep),
    `resolved path escaped .devteam/: ${resolved}`);
});

test('gateAttemptKey is stable across repeated calls for the same agent and id', () => {
  const first = gateAttemptKey('review-lens', 'abc123');
  const second = gateAttemptKey('review-lens', 'abc123');
  assert.strictEqual(first, second);
});


/* ---------- the question channel ---------- */

function asking() {
  const r = valid();
  r.status = 'needs_input';
  r.verification = [];
  r.criteria_addressed = [];
  r.questions = [{
    question: 'Should an invalid API key return 401 or 404?',
    options: ['401 Unauthorized', '404 Not Found, hiding the endpoint'],
    default: '401 Unauthorized',
  }];
  return r;
}

test('a well-formed question on a needs_input report passes', () => {
  assert.deepStrictEqual(validateReport(asking(), 'infra-architect'), []);
});

test('asking a question while reporting any other status is rejected', () => {
  // Asking means stopping. An agent that asks and keeps building produces work
  // the answer may invalidate -- either thrown away, or silently kept when it
  // should have changed.
  for (const status of ['complete', 'blocked']) {
    const r = asking();
    r.status = status;
    if (status === 'complete') {
      r.verification = [{ cmd: 'npm test', exit_code: 0 }];
      r.criteria_addressed = ['AC-1'];
    }
    const errors = validateReport(r, 'infra-architect');
    assert.ok(errors.some((e) => /Asking means stopping/.test(e)),
      `expected status "${status}" with questions to be rejected, got: ${errors.join(' | ')}`);
  }
});

test('a question with no default is rejected', () => {
  const r = asking();
  delete r.questions[0].default;
  assert.ok(validateReport(r, 'infra-architect').some((e) => /missing a "default"/.test(e)));
});

test('a question whose default is not one of its own options is rejected', () => {
  const r = asking();
  r.questions[0].default = '403 Forbidden';
  assert.ok(validateReport(r, 'infra-architect').some((e) => /not one of its own options/.test(e)));
});

test('a question offering fewer than two concrete options is rejected', () => {
  const r = asking();
  r.questions[0].options = ['401 Unauthorized'];
  r.questions[0].default = '401 Unauthorized';
  assert.ok(validateReport(r, 'infra-architect').some((e) => /two to four concrete choices/.test(e)));
});

test('a third question is rejected', () => {
  const r = asking();
  const q = r.questions[0];
  r.questions = [q, { ...q }, { ...q }];
  assert.ok(validateReport(r, 'infra-architect').some((e) => /at most 2 are allowed/.test(e)));
});

/* ---------- the observation channel ---------- */

function observing() {
  const r = valid();
  r.observations = [{
    observation: 'The static file handler catches stat() failures without binding the error.',
    where: 'src/server.js',
    impact: 'A permissions misconfiguration is served as a 404 with nothing logged.',
    recommendation: 'Bind the error and distinguish ENOENT from the rest.',
  }];
  return r;
}

test('an observation does not stop the agent: a complete report carrying one passes', () => {
  // This is the whole difference between an observation and a question. A
  // question halts the agent; an observation is handed over alongside finished
  // work.
  assert.deepStrictEqual(validateReport(observing(), 'infra-architect'), []);
});

test('an observation with no stated impact is rejected', () => {
  // Without a consequence it is a preference, and preferences filed as
  // findings are noise in the lead's inbox.
  const r = observing();
  delete r.observations[0].impact;
  assert.ok(validateReport(r, 'infra-architect').some((e) => /missing a "impact"/.test(e)));
});

test('a fourth observation is rejected', () => {
  const r = observing();
  const o = r.observations[0];
  r.observations = [o, { ...o }, { ...o }, { ...o }];
  assert.ok(validateReport(r, 'infra-architect').some((e) => /at most 3 are allowed/.test(e)));
});

/* ---------- the tier echo ---------- */

test('every tier work-tiers defines is accepted by the validator, and nothing else is', () => {
  // The validator keeps its own tier list, which is a second source of truth
  // next to the skill. This asserts the two agree behaviourally, so renaming a
  // tier in the skill without updating the validator fails here rather than
  // silently rejecting reports at runtime.
  const skill = fs.readFileSync(
    path.join(__dirname, '..', '..', 'skills', 'work-tiers', 'SKILL.md'), 'utf8');
  const section = skill.split('## The three tiers')[1];
  assert.ok(section, 'work-tiers has no "The three tiers" section');
  const tiers = [...section.matchAll(/^### ([a-z-]+)$/gm)].map((m) => m[1]);
  assert.ok(tiers.length >= 2, 'expected work-tiers to define tiers, found ' + tiers.length);

  for (const tier of tiers) {
    const r = valid();
    r.tier = tier;
    assert.deepStrictEqual(validateReport(r, 'infra-architect'), [],
      `validator rejected the tier "${tier}" that work-tiers defines`);
  }

  const r = valid();
  r.tier = 'critical';
  assert.ok(validateReport(r, 'infra-architect').some((e) => /Unknown tier/.test(e)),
    'validator accepted a tier work-tiers does not define');
});


/* ---------- regressions from the live auth run ---------- */

function gate(findings) {
  const r = valid();
  r.agent = 'code-reviewer';
  r.verdict = 'pass';
  r.verification = [];
  r.findings = findings;
  return r;
}

test('a finding carrying its text under an invented key is rejected', () => {
  // The live run produced 54 findings whose prose sat under "detail" or
  // "title". The schema has always said "description"; nothing checked, so the
  // lead read an empty field 54 times.
  for (const key of ['detail', 'title', 'note']) {
    const r = gate([{ severity: 'advisory', criterion: null, [key]: 'The 401 and 404 paths share a builder.' }]);
    const errors = validateReport(r, 'code-reviewer');
    assert.ok(errors.some((e) => /missing a "description"/.test(e)),
      `expected a finding using "${key}" to be rejected, got: ${errors.join(' | ')}`);
  }
});

test('a well-formed finding with a description passes', () => {
  const r = gate([{
    severity: 'advisory',
    criterion: null,
    file: 'src/api/metrics.js',
    description: 'The 401 and 404 paths share a response builder.',
  }]);
  assert.deepStrictEqual(validateReport(r, 'code-reviewer'), []);
});

test('a security review that discusses placeholder credentials is not treated as an unfilled template', () => {
  // This false positive bounced the security gate four times in the live run
  // and tripped the give-up valve, on a report whose verdict was correct.
  // Discussing placeholder secrets is what a security review IS.
  const r = valid();
  r.agent = 'security-engineer';
  r.verdict = 'pass';
  r.verification = [];
  r.handoff_notes = 'No secrets committed. No placeholder credentials were left in src/api/metrics.js, and no key is written to any log.';
  assert.deepStrictEqual(validateReport(r, 'security-engineer'), []);
});

test('a design review citing the ban on placeholder names is likewise not flagged', () => {
  // frontend-craft names "placeholder person names" in its banned defaults, so
  // a craft lens quoting its own standard used to fail the report gate.
  const r = gate([{
    severity: 'advisory',
    criterion: null,
    description: 'The testimonial section uses placeholder person names, which frontend-craft bans.',
  }]);
  assert.deepStrictEqual(validateReport(r, 'code-reviewer'), []);
});

test('genuinely unfilled template markers are still caught', () => {
  // Narrowing the detector must not disarm it.
  for (const marker of ['TODO: wire this up', 'Status: TBD', 'FIXME before merge', 'placeholder text here', 'lorem ipsum dolor']) {
    const r = valid();
    r.handoff_notes = marker;
    const errors = validateReport(r, 'infra-architect');
    assert.ok(errors.some((e) => /placeholder text/.test(e)),
      `expected "${marker}" to be caught, got: ${errors.join(' | ') || '(no errors)'}`);
  }
});
