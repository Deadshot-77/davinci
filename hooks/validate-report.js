#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { validateReport, validateGateReport, nextGateAttempt, matchReportFiles, gateAttemptKey } = require('./lib/report.js');
const { validateFoundation, scaffoldEvidence, scopeConflicts } = require('./lib/foundation.js');
const { parseJson } = require('./lib/json.js');
const { normalizeAgentType, knownAgents } = require('./lib/agents.js');

// Loaded once at module load, not inside foundationErrors() -- that function
// is documented pure (see below) and must not touch fs itself. A read
// failure here degrades to {} rather than throwing, matching how the rest
// of this file treats a missing/unreadable config file: an enforcement hook
// that crashes stops enforcing entirely.
function loadScopeMap() {
  try {
    return parseJson(fs.readFileSync(path.join(__dirname, 'scope-map.json'), 'utf8'));
  } catch (err) {
    return {};
  }
}
const SCOPE_MAP = loadScopeMap();

// stdio: silence git's own stderr ("fatal: not a git repository" is expected
// noise outside a repo, not a real failure -- letting it leak makes every
// run outside a repo print a scary line for nothing). timeout/maxBuffer:
// an index.lock contention must not hang SubagentStop, and a porcelain
// listing over the default buffer must not silently disable the git half.
const GIT_OPTS = { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000, maxBuffer: 8e6 };

// git status --porcelain reports paths relative to the REPO ROOT, not to
// `cwd`. A project living in a subdirectory of a larger repo (or any repo
// that happens to carry unrelated uncommitted changes elsewhere) then sees
// paths like "sub/.devteam/brief.md" here -- which scaffoldEvidence()'s
// outside-.devteam check reads as outside .devteam/ even though it plainly
// is not, so the foundation gate fires unconditionally. Scope the query to
// the cwd subtree with a pathspec and strip the repo-root prefix (from
// `git rev-parse --show-prefix`) so returned paths are cwd-relative, which
// is what scaffoldEvidence() expects.
//
// Independent evidence for scaffoldEvidence(): the working tree itself, not
// the self-reported files_changed. A failure here (no git, not a repo, git
// not installed, a lock timeout) must not crash or hang the hook -- an
// enforcement hook that throws or hangs stops enforcing entirely -- so it
// degrades to no evidence.
function gitPorcelainLines(cwd) {
  try {
    const prefix = execFileSync('git', ['rev-parse', '--show-prefix'], { cwd, ...GIT_OPTS }).trim();
    const out = execFileSync('git', ['status', '--porcelain', '--', '.'], { cwd, ...GIT_OPTS });
    const lines = out.split(/\r?\n/).filter((l) => l.length > 0);
    if (!prefix) return lines;
    return lines.map((l) => {
      const status = l.slice(0, 3);
      const rest = l.slice(3);
      return rest.startsWith(prefix) ? status + rest.slice(prefix.length) : l;
    });
  } catch (err) {
    return [];
  }
}

// davinci only relays to the user and writes the brief; tech-lead only
// orchestrates dispatches. Neither produces a change or a judgement, so
// neither files a report -- everything else knownAgents() finds on disk
// does, and is governed by this gate. This used to be a second
// hand-maintained list (GOVERNED) alongside scope-map.json and agents/
// itself; review-lens shipped in agents/ but was never added to it, so the
// gate silently let it finish without ever filing a report. Deriving
// governance from knownAgents() instead means a newly shipped agent is
// governed the moment its file lands, with nothing else to remember to update.
const NO_REPORT = new Set(['davinci', 'tech-lead']);

function block(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SubagentStop',
      additionalContext:
        'Your report was rejected by the Davinci report gate. Fix it and finish again.\n' + reason,
    },
  }));
  process.exit(2);
}

// Loop bound: a rejection this gate cannot resolve (e.g. a dispatch that
// forbids the agent from writing anything at all) must not bounce forever.
// A small per-INSTANCE counter under .devteam/ tracks consecutive
// rejections, keyed by gateAttemptKey() (hooks/lib/report.js) on the agent
// name plus the hook's agent_id -- not on agent name alone, which is what
// let four concurrent review-lens instances pool their attempts into one
// shared counter and made an innocent instance eat its siblings'
// rejections. nextGateAttempt() is the pure decision of when to stop. This
// wrapper owns all the filesystem I/O and degrades safely -- a write
// failure here must not crash the hook or hang the loop bound.
function gateAttemptsPath(cwd, key) {
  return path.join(cwd, '.devteam', `.gate-attempts-${key}.json`);
}

function readGateAttempts(cwd, key) {
  try {
    const data = parseJson(fs.readFileSync(gateAttemptsPath(cwd, key), 'utf8'));
    return Number.isInteger(data.attempts) ? data.attempts : 0;
  } catch (err) {
    return 0;
  }
}

function writeGateAttempts(cwd, key, attempts) {
  try {
    fs.mkdirSync(path.join(cwd, '.devteam'), { recursive: true });
    fs.writeFileSync(gateAttemptsPath(cwd, key), JSON.stringify({ attempts }));
  } catch (err) { /* best-effort; a lost counter just restarts the count at 0 */ }
}

function clearGateAttempts(cwd, key) {
  try { fs.unlinkSync(gateAttemptsPath(cwd, key)); } catch (err) { /* nothing to clear */ }
}

function writeGateFailed(cwd, agent, attempts, errors) {
  try {
    const dir = path.join(cwd, '.devteam', 'reports');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, `${agent}-GATE-FAILED.json`),
      JSON.stringify({ agent, attempts, errors }, null, 2)
    );
  } catch (err) { /* best-effort; failing loudly on disk is a bonus, not a dependency */ }
}

// Reject one finish attempt for `agent` (instance-keyed by `gateKey`, see
// gateAttemptKey()). Blocks (exit 2) for the first three consecutive
// rejections, warning on the 2nd and 3rd how many attempts remain; on the
// fourth consecutive rejection it gives up instead of blocking again --
// writes a GATE-FAILED report and exits 0 so the agent can stop rather than
// bounce forever. The GATE-FAILED report itself stays keyed on the agent
// name alone (unchanged): concurrency safety for that file is a separate,
// already-solved problem (the labeled report-filename convention).
function reject(cwd, agent, gateKey, errors, reminder) {
  const { attempts, giveUp } = nextGateAttempt(readGateAttempts(cwd, gateKey));

  if (giveUp) {
    clearGateAttempts(cwd, gateKey);
    writeGateFailed(cwd, agent, attempts, errors);
    process.exit(0);
  }

  writeGateAttempts(cwd, gateKey, attempts);

  let reason = errors.map((e) => '- ' + e).join('\n');
  if (reminder) reason += '\n' + reminder;
  if (attempts >= 2) {
    reason += `\n${3 - attempts} attempt(s) remain before this gate gives up and writes a GATE-FAILED report.`;
  }
  block(reason);
}

function latestReport(dir, agent) {
  let names = [];
  try { names = fs.readdirSync(dir); } catch (err) { return null; }
  const mine = matchReportFiles(agent, names);
  return mine.length ? path.join(dir, mine[mine.length - 1]) : null;
}

// The report gate's stack-profile decision, pulled out as a pure function so
// it can be unit tested directly -- without spawning this file as a
// subprocess -- in both directions: a trivial infra report with no scaffold
// evidence must pass with no profile present, and a report showing a
// genuine scaffold with no profile present must still fail. Callers supply
// the git evidence and file contents already read; this function touches no
// fs or child_process itself.
function foundationErrors(agent, reportFilesChanged, gitLines, profileText, pkgText, scopeMap) {
  if (agent !== 'infra-architect') return [];
  if (!scaffoldEvidence(reportFilesChanged, gitLines)) return [];
  if (profileText === null || profileText === undefined) {
    return ['.devteam/stack-profile.md was not created. Builders have no contract to obey.'];
  }
  const errors = validateFoundation(profileText, pkgText);
  // scopeMap is optional so this stays backward-compatible with any caller
  // that doesn't have one to hand -- without it there is simply nothing to
  // check the Directory map's assignments against.
  if (scopeMap) errors.push(...scopeConflicts(profileText, scopeMap));
  return errors;
}

function main() {
  let input;
  try { input = parseJson(fs.readFileSync(0, 'utf8')); } catch (err) { process.exit(0); }

  const agent = normalizeAgentType(input.agent_type);
  if (!agent || !knownAgents().has(agent)) process.exit(0);
  if (NO_REPORT.has(agent)) process.exit(0); // control plane: files no report

  // Per-instance loop-bound key: agent name plus the hook's agent_id (unique
  // per subagent instance), so concurrent instances of the same agent type
  // never share one attempt counter. Falls back to the agent name alone when
  // agent_id is absent, preserving single-instance behaviour exactly.
  const gateKey = gateAttemptKey(agent, input.agent_id);

  const cwd = input.cwd || process.cwd();
  const reportPath = latestReport(path.join(cwd, '.devteam', 'reports'), agent);
  if (!reportPath) {
    reject(cwd, agent, gateKey, [`No report found at .devteam/reports/${agent}-<label>-<n>.json (or the older ${agent}-<n>.json). Write one before finishing.`]);
  }

  let report;
  try {
    report = parseJson(fs.readFileSync(reportPath, 'utf8'));
  } catch (err) {
    reject(cwd, agent, gateKey, [`${reportPath} is not valid JSON: ${err.message}`]);
  }

  const errors = validateReport(report, agent);

  // Gates: agents whose report is a judgement (a verdict and findings) on
  // work someone else did, rather than a change to the codebase. This is
  // the only hand-maintained list left in this file -- it cannot be derived
  // from knownAgents() the way GOVERNED was, because "governed" and "is a
  // gate" are different questions the disk alone can't answer.
  const GATES = ['security-engineer', 'code-reviewer', 'review-lens'];
  if (GATES.includes(agent)) errors.push(...validateGateReport(report));

  if (agent === 'infra-architect') {
    const gitLines = gitPorcelainLines(cwd);
    let profileText = null;
    let pkgText = null;
    if (scaffoldEvidence(report.files_changed, gitLines)) {
      try { profileText = fs.readFileSync(path.join(cwd, '.devteam', 'stack-profile.md'), 'utf8'); } catch (err) { profileText = null; }
      try { pkgText = fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'); } catch (err) { pkgText = null; }
    }
    errors.push(...foundationErrors(agent, report.files_changed, gitLines, profileText, pkgText, SCOPE_MAP));
  }

  // validateReport() and validateGateReport() both check the verdict field
  // (added independently, for different reasons -- see the enum
  // literal-match fix), so a gate report with an invalid verdict triggers
  // the identical "Unknown verdict" message from each and it lands in the
  // rejection twice. Harmless but sloppy: an agent reading its own
  // rejection sees the same complaint duplicated. Dedupe the final list
  // rather than removing either check -- each still catches the case the
  // other cannot (a missing verdict is only caught by validateGateReport()).
  const uniqueErrors = Array.from(new Set(errors));

  if (uniqueErrors.length) {
    const reminder = 'Required shape: agent, status, files_changed, criteria_addressed, verification, assumptions, handoff_notes.';
    reject(cwd, agent, gateKey, uniqueErrors, reminder);
  }

  clearGateAttempts(cwd, gateKey);
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = {
  main, gitPorcelainLines, foundationErrors, latestReport, block, NO_REPORT,
  reject, gateAttemptsPath, readGateAttempts, writeGateAttempts, clearGateAttempts, writeGateFailed,
};
