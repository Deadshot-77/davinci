#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { validateReport, validateGateReport } = require('./lib/report.js');
const { validateFoundation, scaffoldEvidence } = require('./lib/foundation.js');
const { parseJson } = require('./lib/json.js');
const { normalizeAgentType } = require('./lib/agents.js');

// Independent evidence for scaffoldEvidence(): the working tree itself,
// not the self-reported files_changed. A failure here (no git, not a repo,
// git not installed) must not crash the hook -- an enforcement hook that
// throws stops enforcing entirely -- so it degrades to no evidence.
function gitPorcelainLines(cwd) {
  try {
    const out = execFileSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf8' });
    return out.split(/\r?\n/).filter((l) => l.length > 0);
  } catch (err) {
    return [];
  }
}

const GOVERNED = [
  'davinci', 'tech-lead', 'infra-architect',
  'backend-engineer', 'frontend-engineer', 'security-engineer', 'code-reviewer',
];

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

function latestReport(dir, agent) {
  let names = [];
  try { names = fs.readdirSync(dir); } catch (err) { return null; }
  const mine = names
    .filter((n) => new RegExp('^' + agent + '-\\d+\\.json$').test(n))
    .sort((a, b) => parseInt(a.match(/-(\d+)\./)[1], 10) - parseInt(b.match(/-(\d+)\./)[1], 10));
  return mine.length ? path.join(dir, mine[mine.length - 1]) : null;
}

function main() {
  let input;
  try { input = parseJson(fs.readFileSync(0, 'utf8')); } catch (err) { process.exit(0); }

  const agent = normalizeAgentType(input.agent_type);
  if (!agent || !GOVERNED.includes(agent)) process.exit(0);
  if (agent === 'davinci' || agent === 'tech-lead') process.exit(0); // control plane files no report

  const cwd = input.cwd || process.cwd();
  const reportPath = latestReport(path.join(cwd, '.devteam', 'reports'), agent);
  if (!reportPath) {
    block(`No report found at .devteam/reports/${agent}-<n>.json. Write one before finishing.`);
  }

  let report;
  try {
    report = parseJson(fs.readFileSync(reportPath, 'utf8'));
  } catch (err) {
    block(`${reportPath} is not valid JSON: ${err.message}`);
  }

  const errors = validateReport(report, agent);

  const GATES = ['security-engineer', 'code-reviewer'];
  if (GATES.includes(agent)) errors.push(...validateGateReport(report));

  if (agent === 'infra-architect' && scaffoldEvidence(report.files_changed, gitPorcelainLines(cwd))) {
    let profileText = null;
    let pkgText = null;
    try { profileText = fs.readFileSync(path.join(cwd, '.devteam', 'stack-profile.md'), 'utf8'); } catch (err) { profileText = null; }
    try { pkgText = fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'); } catch (err) { pkgText = null; }
    if (profileText === null) {
      errors.push('.devteam/stack-profile.md was not created. Builders have no contract to obey.');
    } else {
      errors.push(...validateFoundation(profileText, pkgText));
    }
  }

  if (errors.length) block(errors.map((e) => '- ' + e).join('\n'));
  process.exit(0);
}

main();
