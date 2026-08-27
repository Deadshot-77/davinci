const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { validateReport, validateGateReport, nextGateAttempt } = require('../lib/report.js');

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
