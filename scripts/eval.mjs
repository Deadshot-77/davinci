// Behavioural evals: does an agent actually do what the skills say?
//
// The 355 tests in hooks/test assert that a rule is written down in a markdown
// file. Not one of them proves an agent follows it. That is the deepest gap in
// this plugin: ten releases of guidance are, strictly, hope with good
// bookkeeping.
//
// Claude Code ships `claude plugin eval` for exactly this and it is currently
// early-access gated, so this is the same job done with what is available: a
// real `claude -p` run against a fixture, scored by mechanical assertions over
// the working tree and the run's own stream.
//
// Two things it deliberately does NOT do. There is no LLM judge -- every
// assertion is a file that exists or a string that appears, so a result cannot
// be argued with. And it does not run in `npm test`: each case is a real agent
// run costing real minutes and real money.
//
// Usage: node scripts/eval.mjs list
//        node scripts/eval.mjs run <case-name> [--baseline] [--keep]

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const PLUGIN = path.resolve(HERE, '..');
const CASES = path.join(PLUGIN, 'evals', 'cases');

export function loadCases(dir = CASES) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const file = path.join(dir, d.name, 'case.json');
      if (!fs.existsSync(file)) return null;
      try { return { ...JSON.parse(fs.readFileSync(file, 'utf8')), dir: path.join(dir, d.name) }; }
      catch (err) { return { name: d.name, dir: path.join(dir, d.name), error: 'unreadable case.json: ' + err.message }; }
    })
    .filter(Boolean);
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, e.name), d = path.join(to, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

// Every assertion is mechanical on purpose. A grader that reasons can be
// argued with, and an eval you can argue with settles nothing.
export function check(expectation, ctx) {
  const { kind, path: rel, pattern, flags, why } = expectation;
  const full = rel ? path.join(ctx.root, rel) : null;

  // A bad pattern must never take down a run that already cost real money and
  // minutes. The first version threw on `(?i)` -- PCRE syntax, not JS -- and
  // lost a nine-minute run to a typo in an assertion.
  let re = null;
  if (pattern !== undefined) {
    try { re = new RegExp(pattern, flags ?? 'i'); }
    catch (err) {
      return { pass: false, invalid: true, detail: `unusable pattern /${pattern}/: ${err.message}` };
    }
  }
  const has = (t) => re.test(t);

  switch (kind) {
    case 'file-exists':
      return { pass: fs.existsSync(full), detail: rel };
    case 'file-absent':
      return { pass: !fs.existsSync(full), detail: rel };
    case 'file-contains': {
      if (!fs.existsSync(full)) return { pass: false, detail: rel + ' does not exist' };
      return { pass: has(fs.readFileSync(full, 'utf8')), detail: `${rel} =~ /${pattern}/` };
    }
    case 'file-lacks': {
      if (!fs.existsSync(full)) return { pass: true, detail: rel + ' does not exist' };
      return { pass: !has(fs.readFileSync(full, 'utf8')), detail: `${rel} !~ /${pattern}/` };
    }
    case 'stream-contains':
      return { pass: has(ctx.stream), detail: `run stream =~ /${pattern}/` };
    case 'stream-lacks':
      return { pass: !has(ctx.stream), detail: `run stream !~ /${pattern}/` };
    default:
      return { pass: false, detail: 'unknown expectation kind: ' + kind, invalid: true };
  }
  // `why` is carried by the caller for reporting; it is the sentence that
  // explains what a failure means, not decoration.
}

export function score(expectations, ctx) {
  return expectations.map((e) => ({ ...check(e, ctx), why: e.why, kind: e.kind }));
}

function runCase(c, { baseline = false, keep = false } = {}) {
  if (c.error) return { name: c.name, ok: false, error: c.error };

  // Not os.tmpdir(). On this machine it resolves to a path containing an 8.3
  // short name (`GLOBAL~1`), and Claude Code refuses to read or write under a
  // path it considers suspicious -- so the first run of this harness scored a
  // case entirely on refusals that had nothing to do with the plugin.
  const workRoot = path.join(PLUGIN, 'evals', '.work');
  fs.mkdirSync(workRoot, { recursive: true });
  const root = fs.mkdtempSync(path.join(workRoot, c.name + '-'));
  const fixture = path.join(c.dir, c.fixture || 'fixture');
  if (fs.existsSync(fixture)) copyDir(fixture, root);

  const streamFile = path.join(root, '.eval-stream.jsonl');
  const args = ['-p', c.prompt, '--output-format', 'stream-json', '--verbose',
    '--permission-mode', 'acceptEdits'];
  // The ablation arm. Without it a case tells you what the agent did, not what
  // the plugin caused -- which is the whole question.
  if (!baseline) args.push('--plugin-dir', PLUGIN);
  const settings = path.join(c.dir, c.settings || 'settings.json');
  if (fs.existsSync(settings)) {
    // The plugin's tool paths are absolute and differ per installation, so a
    // committed settings file cannot name them. <PLUGIN> is substituted here.
    const text = fs.readFileSync(settings, 'utf8')
      .split('<PLUGIN>').join(PLUGIN.split(path.sep).join('/'));
    args.push('--settings', text);
  }

  const started = Date.now();
  const res = spawnSync('claude', args, {
    cwd: root, encoding: 'utf8', timeout: c.timeoutMs || 900000,
    env: { ...process.env, CLAUDE_CODE_FORK_SUBAGENT: '0', CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS: '0' },
    maxBuffer: 256 * 1024 * 1024,
  });
  const stream = String(res.stdout || '');
  fs.writeFileSync(streamFile, stream);

  const results = score(c.expect || [], { root, stream });
  const passed = results.filter((r) => r.pass).length;

  // A run that never attempted the task must not be scored. The first baseline
  // arm answered "Unknown command: /davinci:build" in zero turns for $0.00 and
  // scored 3/5 -- every one of those passes was an assertion about a file that
  // was absent because nothing had run. Scoring that as a delta would have
  // been a fabricated result, which is precisely what this harness exists to
  // prevent elsewhere.
  const noAttempt = /Unknown command:/.test(stream) || /"num_turns":0/.test(stream.replace(/\s/g, ''));

  return {
    name: c.name, baseline, ok: true, root: keep ? root : null,
    durationMs: Date.now() - started,
    exit: res.status, timedOut: res.error?.code === 'ETIMEDOUT',
    noAttempt,
    passed, total: results.length, results,
    streamBytes: stream.length,
  };
}

function report(r) {
  if (!r.ok) { console.log(`  ${r.name}: ${r.error}`); return 1; }
  const arm = r.baseline ? 'baseline (no plugin)' : 'with plugin';
  const mins = Math.round(r.durationMs / 60000);

  if (r.noAttempt) {
    console.log(`\n${r.name} — ${arm}: INCONCLUSIVE, the run never attempted the task.`);
    console.log('  Its assertions are not scored: they would pass on absence caused by nothing');
    console.log('  having happened. A case whose prompt is a plugin command cannot be ablated,');
    console.log('  because the baseline arm has no such command to run.');
    if (r.root) console.log(`  kept: ${r.root}`);
    return 0;
  }

  console.log(`\n${r.name} — ${arm}: ${r.passed}/${r.total} in ${mins}m` +
    (r.timedOut ? ' (TIMED OUT)' : '') + (r.streamBytes ? '' : ' (EMPTY STREAM — did the run start?)'));
  for (const x of r.results) {
    console.log(`  ${x.pass ? 'PASS' : 'FAIL'}  ${x.detail}`);
    if (!x.pass && x.why) console.log(`        ${x.why}`);
  }
  if (r.root) console.log(`  kept: ${r.root}`);
  return r.passed === r.total ? 0 : 1;
}

const invokedDirectly = (() => {
  if (!process.argv[1]) return false;
  try { return import.meta.url.endsWith(path.basename(process.argv[1])); } catch { return false; }
})();

if (invokedDirectly) {
  const [cmd, name] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const flags = process.argv.slice(2).filter((a) => a.startsWith('--'));
  const cases = loadCases();

  if (cmd === 'list' || !cmd) {
    if (!cases.length) { console.log('no cases under evals/cases/'); process.exit(0); }
    for (const c of cases) {
      console.log(`${c.name}  ${(c.expect || []).length} expectation(s)  ${c.why || ''}`);
    }
    process.exit(0);
  }

  if (cmd === 'run') {
    const chosen = name ? cases.filter((c) => c.name === name) : cases;
    if (!chosen.length) { console.error('no such case: ' + name); process.exit(2); }
    console.log(`running ${chosen.length} case(s). These are real agent runs — minutes and money.`);
    const keep = flags.includes('--keep');
    // --baseline-only exists so an arm already measured is not paid for twice.
    const onlyBaseline = flags.includes('--baseline-only');
    let worst = 0;
    for (const c of chosen) {
      if (!onlyBaseline) worst = Math.max(worst, report(runCase(c, { keep })));
      if (onlyBaseline || flags.includes('--baseline')) {
        worst = Math.max(worst, report(runCase(c, { baseline: true, keep })));
      }
    }
    process.exit(worst);
  }

  console.error('usage: node scripts/eval.mjs list | run <case> [--baseline] [--keep]');
  process.exit(2);
}
