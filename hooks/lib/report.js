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

  // files_changed entries are paths and verification[].cmd entries are shell
  // commands; both legitimately contain words like FILL/TODO/placeholder and
  // must not be scanned for placeholder text.
  const scanTarget = Object.assign({}, report);
  delete scanTarget.files_changed;
  if (Array.isArray(scanTarget.verification)) {
    scanTarget.verification = scanTarget.verification.map((v) => {
      if (!v || typeof v !== 'object') return v;
      const copy = Object.assign({}, v);
      delete copy.cmd;
      return copy;
    });
  }

  for (const s of collectStrings(scanTarget, [])) {
    if (PLACEHOLDER.test(s)) {
      errors.push(`Report contains placeholder text: "${s.slice(0, 60)}"`);
      break;
    }
  }

  return errors;
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

module.exports = { validateReport, validateGateReport, PLACEHOLDER };
