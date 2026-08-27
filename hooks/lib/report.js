'use strict';

const REQUIRED = [
  'agent', 'status', 'files_changed', 'criteria_addressed',
  'verification', 'assumptions', 'handoff_notes',
];
const STATUSES = ['complete', 'blocked', 'needs_input'];
const VERDICTS = ['pass', 'fail'];
const PLACEHOLDER = /\b(TODO|TBD|FIXME|lorem ipsum)\b|(^|\n)\s*FILL\b|\bplaceholder\b/i;

function collectStrings(value, out) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => collectStrings(v, out));
  return out;
}

function validateReport(report, agentName) {
  const errors = [];
  if (!report || typeof report !== 'object' || Array.isArray(report)) {
    return ['Report is not a JSON object.'];
  }

  for (const field of REQUIRED) {
    if (!(field in report)) errors.push(`Missing required field: ${field}`);
  }

  if (report.agent && agentName && report.agent !== agentName) {
    errors.push(`Report "agent" is "${report.agent}" but does not match the reporting agent "${agentName}".`);
  }

  if (report.status && !STATUSES.includes(report.status)) {
    errors.push(`Unknown status "${report.status}". Must be one of: ${STATUSES.join(', ')}.`);
  }

  if (report.status === 'complete') {
    if (!Array.isArray(report.verification) || report.verification.length === 0) {
      errors.push('status "complete" requires at least one verification entry with a real command and exit code.');
    }
    if (!Array.isArray(report.criteria_addressed) || report.criteria_addressed.length === 0) {
      errors.push('status "complete" requires at least one entry in criteria_addressed.');
    }
  }

  if (Array.isArray(report.verification)) {
    report.verification.forEach((v, i) => {
      if (!v || typeof v.cmd !== 'string' || v.cmd.length === 0) {
        errors.push(`verification[${i}] is missing a "cmd" string.`);
      }
      if (!v || !Number.isInteger(v.exit_code)) {
        errors.push(`verification[${i}] is missing an integer "exit_code". Report the real exit code; do not omit it.`);
      }
    });
  }

  if (Array.isArray(report.findings)) {
    report.findings.forEach((f, i) => {
      if (f && f.severity === 'blocking' && (!f.criterion || String(f.criterion).trim() === '')) {
        errors.push(`findings[${i}] is blocking but cites no criterion. Blocking findings must cite a brief criterion; otherwise mark it advisory.`);
      }
    });
  }

  // files_changed entries are paths, and the whole verification array is
  // machine output -- shell commands and runner output, not prose. Both
  // legitimately contain words like FILL/TODO/placeholder (node --test's own
  // summary prints a "todo" count) and must not be scanned for placeholder
  // text. handoff_notes and assumptions are prose and stay scanned.
  const scanTarget = Object.assign({}, report);
  delete scanTarget.files_changed;
  delete scanTarget.verification;

  for (const s of collectStrings(scanTarget, [])) {
    if (PLACEHOLDER.test(s)) {
      errors.push(`Report contains placeholder text: "${s.slice(0, 60)}"`);
      break;
    }
  }

  return errors;
}

// The report gate's loop-bound decision, pulled out as a pure function so it
// is unit-testable without touching the filesystem -- the wrapper in
// validate-report.js owns reading/writing the counter file. A live dispatch
// once told security-engineer to write no files; the gate rejected its
// finish eight times in a row, each rejection demanding a report the
// dispatch had forbidden, burning thirteen minutes for no output. Blocking
// forever is worse than failing loudly: after three rejections, the fourth
// call must tell the caller to give up instead of blocking again.
function nextGateAttempt(current) {
  const n = Number.isInteger(current) && current >= 0 ? current : 0;
  const attempts = n + 1;
  return { attempts, giveUp: attempts > 3 };
}

function validateGateReport(report) {
  const errors = [];
  if (!report || typeof report !== 'object') return ['Gate report is not a JSON object.'];
  if (!report.verdict) {
    errors.push('A gate agent must report a "verdict". A gate that finishes without one closes nothing.');
  } else if (!VERDICTS.includes(report.verdict)) {
    errors.push(`Unknown verdict "${report.verdict}". Must be one of: ${VERDICTS.join(', ')}.`);
  }
  return errors;
}

module.exports = { validateReport, validateGateReport, nextGateAttempt, PLACEHOLDER };
