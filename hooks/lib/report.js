'use strict';

const { knownAgents } = require('./agents.js');

const REQUIRED = [
  'agent', 'status', 'files_changed', 'criteria_addressed',
  'verification', 'assumptions', 'handoff_notes',
];
const STATUSES = ['complete', 'blocked', 'needs_input'];
const VERDICTS = ['pass', 'fail'];
const MAX_QUESTIONS = 2;
const MAX_OBSERVATIONS = 3;
// Kept in step with the tiers work-tiers defines; a test asserts they match.
const TIERS = ['load-bearing', 'standard', 'scaffolding'];
// Markers of a template nobody filled in. The bare word "placeholder" used to
// be on this list and was removed: a security review discussing placeholder
// credentials, or a design review citing frontend-craft's ban on placeholder
// names, is doing its job, not shipping an unfilled template. In a live run
// that false positive bounced the security gate four times and tripped the
// give-up valve on a report whose verdict was correct. An angle-bracket slot
// or an explicit fill-me marker is evidence; the English word is not.
const PLACEHOLDER = /\b(TODO|TBD|FIXME|lorem ipsum)\b|(^|\n)\s*FILL\b|\bplaceholder (text|value|content|here)\b|<(your|insert|fill)[ -][^>]*>/i;

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

  // A report that carries a "verdict" key at all is a gate or lens judging
  // someone else's work, whatever its agent name -- that is the one signal
  // this pure layer has to go on. Its value gets the same literal-match
  // treatment as status: no "pass-with-findings", no third option. A review
  // that passes with non-blocking issues is verdict "pass" plus those issues
  // as severity "advisory" findings; that field is what already carries the
  // nuance a hedge value would be reaching for.
  const hasVerdict = Object.prototype.hasOwnProperty.call(report, 'verdict');
  if (hasVerdict && !VERDICTS.includes(report.verdict)) {
    errors.push(`Unknown verdict "${report.verdict}". Must be one of: ${VERDICTS.join(', ')}.`);
  }

  if (report.status === 'complete') {
    // Builders prove "complete" with commands; gates prove it with a
    // verdict. The verification rule exists so a builder cannot claim "I
    // ran the tests" by assertion -- but a read-only reviewer's work IS
    // reading code. It often has no write tools and no permission to run
    // commands, so forcing a shell command out of it just to satisfy this
    // check invites exactly the fabrication the rule was written to
    // prevent. A report that carries a verdict is exempted from the
    // verification requirement; every other agent's rule is unchanged.
    if (!hasVerdict && (!Array.isArray(report.verification) || report.verification.length === 0)) {
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

  // Two rules make the question channel safe to open. A question must carry a
  // default, because most runs are unattended and an unanswerable question
  // would otherwise kill the run outright. And asking must mean stopping: an
  // agent that keeps building past an open question produces work the answer
  // may invalidate, which is either thrown away or silently kept when it
  // should have changed.
  if (Object.prototype.hasOwnProperty.call(report, 'questions')) {
    if (!Array.isArray(report.questions)) {
      errors.push('"questions" must be an array.');
    } else {
      if (report.questions.length > MAX_QUESTIONS) {
        errors.push(`questions has ${report.questions.length} entries; at most ${MAX_QUESTIONS} are allowed per report. A third question means the brief was misread -- put that in handoff_notes.`);
      }
      if (report.questions.length > 0 && report.status !== 'needs_input') {
        errors.push(`status is "${report.status}" but the report carries questions. Asking means stopping: report "needs_input" and continue when you are re-dispatched with the answer.`);
      }
      report.questions.forEach((q, i) => {
        if (!q || typeof q !== 'object' || Array.isArray(q)) {
          errors.push(`questions[${i}] is not an object.`);
          return;
        }
        if (typeof q.question !== 'string' || q.question.trim() === '') {
          errors.push(`questions[${i}] is missing a "question" string.`);
        }
        const opts = q.options;
        if (!Array.isArray(opts) || opts.length < 2 || opts.length > 4) {
          errors.push(`questions[${i}] needs an "options" array of two to four concrete choices; an open-ended question cannot be answered by a picker.`);
        } else if (opts.some((o) => typeof o !== 'string' || o.trim() === '')) {
          errors.push(`questions[${i}].options contains an empty choice.`);
        }
        if (typeof q.default !== 'string' || q.default.trim() === '') {
          errors.push(`questions[${i}] is missing a "default". Every question states what to do if nobody answers, or an unattended run dies on it.`);
        } else if (Array.isArray(opts) && opts.length && !opts.includes(q.default)) {
          errors.push(`questions[${i}].default "${q.default}" is not one of its own options.`);
        }
      });
    }
  }

  if (Object.prototype.hasOwnProperty.call(report, 'tier') && !TIERS.includes(report.tier)) {
    errors.push(`Unknown tier "${report.tier}". Must be one of: ${TIERS.join(', ')}.`);
  }

  // An observation is something noticed in passing and handed to the lead. It
  // never stops the reporting agent -- that is what separates it from a
  // question -- so nothing here constrains status. What it must carry is a
  // consequence: without one it is a preference, and preferences filed as
  // findings are noise in the lead's inbox.
  if (Object.prototype.hasOwnProperty.call(report, 'observations')) {
    if (!Array.isArray(report.observations)) {
      errors.push('"observations" must be an array.');
    } else {
      if (report.observations.length > MAX_OBSERVATIONS) {
        errors.push(`observations has ${report.observations.length} entries; at most ${MAX_OBSERVATIONS} are allowed per report.`);
      }
      report.observations.forEach((o, i) => {
        if (!o || typeof o !== 'object' || Array.isArray(o)) {
          errors.push(`observations[${i}] is not an object.`);
          return;
        }
        for (const field of ['observation', 'impact', 'recommendation']) {
          if (typeof o[field] !== 'string' || o[field].trim() === '') {
            errors.push(`observations[${i}] is missing a "${field}" string.`);
          }
        }
      });
    }
  }

  if (Array.isArray(report.findings)) {
    report.findings.forEach((f, i) => {
      // A finding whose text sits under an invented key is a finding the lead
      // never reads. A live run produced 54 of them under "detail" and "title"
      // before this check existed.
      if (f && (typeof f.description !== 'string' || f.description.trim() === '')) {
        errors.push(`findings[${i}] is missing a "description" string. The finding text goes in "description" -- not "detail", "title", or "note".`);
      }
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
      errors.push(`Report contains an unfilled template marker: "${s.slice(0, 60)}"`);
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

// Which counter file identifies one running instance of an agent, for the
// give-up loop bound's attempt cap in validate-report.js. That counter used
// to live at .devteam/.gate-attempts-<agent>.json, keyed on agent TYPE
// alone. Four concurrent review-lens instances shared that one file: their
// rejection attempts pooled, the four-attempt cap tripped collectively, and
// a lens that had actually submitted a valid report got refused anyway
// because its siblings had already exhausted the shared budget. Hook input
// carries agent_id, unique per subagent instance, so keying the counter on
// agent name plus that id gives each instance its own independent budget.
// When agentId is absent or empty (a caller that predates it, or a test
// harness that doesn't supply one) this falls back to the agent name alone,
// preserving today's single-instance behaviour exactly.
//
// The id is sanitised to [A-Za-z0-9_-] because it lands in a filename on
// Windows: stripping anything else (path separators, "..", colons, spaces)
// means a hostile or malformed id can neither escape .devteam/ nor break
// the path. Pure and filesystem-free so it is unit-testable directly; the
// wrapper in validate-report.js does the actual path join and file I/O.
function gateAttemptKey(agentName, agentId) {
  const safeId = String(agentId || '').replace(/[^A-Za-z0-9_-]/g, '');
  return safeId ? `${agentName}-${safeId}` : agentName;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Which report filenames belong to `agentName`, oldest-to-newest. Supports
// both the original single-instance form (<agent>-<n>.json) and the
// concurrency-safe form several instances of the same agent type use to
// avoid colliding on <n> (<agent>-<label>-<n>.json, where <label> is free
// text and may itself contain hyphens -- review-lens's own "silent-failure"
// lens is exactly this shape). Pure: the caller (validate-report.js) does
// the actual fs.readdirSync of .devteam/reports/; this function only
// filters and sorts an already-read list of names.
//
// A shorter agent name can be a literal string prefix of a longer, distinct
// agent's name -- "code" of "code-reviewer", a real agent shipped in
// agents/. Naive prefix matching would let "code" swallow
// "code-reviewer-1.json" by misreading "reviewer" as its own label. Two
// prefixes of the same string always have one containing the other, so
// whenever a strictly longer known agent name also prefixes the filename,
// that longer agent is the more specific owner and this agent's match is
// suppressed.
function matchReportFiles(agentName, filenames) {
  const pattern = new RegExp('^' + escapeRegExp(agentName) + '(?:-.+)?-(\\d+)\\.json$');
  const longerAgents = Array.from(knownAgents()).filter(
    (a) => a !== agentName && a.length > agentName.length
  );

  const matches = [];
  for (const name of filenames) {
    const m = pattern.exec(name);
    if (!m) continue;
    if (longerAgents.some((a) => name.startsWith(a + '-'))) continue;
    matches.push({ name, n: parseInt(m[1], 10) });
  }

  return matches.sort((a, b) => a.n - b.n).map((x) => x.name);
}

module.exports = { validateReport, validateGateReport, nextGateAttempt, matchReportFiles, gateAttemptKey, PLACEHOLDER };
