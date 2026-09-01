'use strict';

// The work ledger: what makes a run resumable and a delivery incremental.
//
// Two files, and the split is the point. `.devteam/plan.md` is the contract --
// written once at intake with the user, never rewritten. `.devteam/progress.jsonl`
// is an append-only journal of what happened. Durable-execution systems all
// converge on this shape: persist decisions as they occur rather than
// rewriting a state snapshot, because a rewrite can lose or invent history and
// an append cannot.
//
// It also answers the drift problem. The research on long-horizon agents is
// direct: step-by-step agents drift because each locally-best move pulls away
// from the goal, while plan-ahead agents hold. A plan the agent re-reads at the
// start of every slice re-anchors the goal from an artifact instead of trusting
// it to survive in context.

const SLICE_HEADING = /^##\s+(S\d+)\s+[-—–]\s+(.+?)\s*$/;
const CRITERION = /^-\s+\[( |x|X)\]\s+(.+?)\s*$/;
const DELIVERS = /^\*\*Delivers:\*\*\s*(.+?)\s*$/;

const TERMINAL = new Set(['done', 'blocked']);
const STATUSES = new Set(['started', 'done', 'blocked']);

// Parses plan.md into ordered slices. Deliberately tolerant of surrounding
// prose: the file is written for a person to read and approve.
function parsePlan(text) {
  const slices = [];
  let current = null;
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trimEnd();
    const heading = line.match(SLICE_HEADING);
    if (heading) {
      current = { id: heading[1], title: heading[2], delivers: '', criteria: [] };
      slices.push(current);
      continue;
    }
    if (!current) continue;
    const delivers = line.match(DELIVERS);
    if (delivers) { current.delivers = delivers[1]; continue; }
    const criterion = line.match(CRITERION);
    if (criterion) current.criteria.push(criterion[2]);
  }
  return slices;
}

// A plan that cannot be executed should fail at intake, where it is cheap to
// fix, rather than three slices in.
function validatePlan(slices) {
  const errors = [];
  if (!slices.length) return ['plan.md defines no slices; expected headings like "## S1 — thing it delivers".'];

  const seen = new Set();
  slices.forEach((s, i) => {
    if (seen.has(s.id)) errors.push(`plan.md repeats slice id "${s.id}".`);
    seen.add(s.id);
    const expected = 'S' + (i + 1);
    if (s.id !== expected) errors.push(`plan.md slice ${i + 1} is "${s.id}"; slices must be numbered in order, so it should be "${expected}".`);
    if (!s.delivers) errors.push(`${s.id} has no "**Delivers:**" line, so nobody can tell what it is for.`);
    if (!s.criteria.length) errors.push(`${s.id} has no "Done when" checkboxes; without them "done" is an opinion.`);
  });
  return errors;
}

// The journal. One JSON object per line, appended, never edited. A malformed
// line is reported rather than skipped -- silently ignoring history is how a
// resume lands in the wrong place.
function parseProgress(text) {
  const events = [];
  const errors = [];
  const lines = String(text || '').split('\n');
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let parsed;
    try { parsed = JSON.parse(trimmed); }
    catch { errors.push(`progress.jsonl line ${i + 1} is not valid JSON.`); return; }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      errors.push(`progress.jsonl line ${i + 1} is not a JSON object.`); return;
    }
    // Plan-level events carry no slice. Approval is the one that matters: a run
    // that died after writing plan.md but before the user saw it would
    // otherwise resume and start building a plan nobody agreed to.
    if (parsed.event) {
      if (parsed.event !== 'plan-approved') {
        errors.push(`progress.jsonl line ${i + 1} has unknown event "${parsed.event}".`);
        return;
      }
      events.push(parsed);
      return;
    }
    if (!parsed.slice) { errors.push(`progress.jsonl line ${i + 1} names no slice.`); return; }
    if (!STATUSES.has(parsed.status)) {
      errors.push(`progress.jsonl line ${i + 1} has status "${parsed.status}"; expected one of ${[...STATUSES].join(', ')}.`);
      return;
    }
    events.push(parsed);
  });
  return { events, errors };
}

// A plan nobody approved is a draft, whatever else the journal says. Building
// from one is the "drove away on its own" failure in its earliest form.
function planApproved(events) {
  return events.some((e) => e.event === 'plan-approved');
}

// Last event wins, so a blocked slice that was later finished reads as done.
function statusOf(sliceId, events) {
  let status = 'pending';
  for (const e of events) if (e.slice === sliceId) status = e.status;
  return status;
}

function evidenceFor(sliceId, events) {
  let evidence = [];
  for (const e of events) {
    if (e.slice === sliceId && Array.isArray(e.evidence)) evidence = e.evidence;
  }
  return evidence;
}

// Where to pick up. A slice left "started" is the resume target, not the one
// after it: a killed run may have written half its files.
function nextSlice(slices, events) {
  for (const s of slices) {
    const status = statusOf(s.id, events);
    if (status === 'done') continue;
    return { slice: s, status, resuming: status === 'started' };
  }
  return null;
}

// The slice whose acceptance check gets re-run before continuing. A status is
// a claim; the working tree is the fact, and a killed run can leave them
// disagreeing.
function lastDone(slices, events) {
  let found = null;
  for (const s of slices) {
    if (statusOf(s.id, events) === 'done') found = s;
  }
  return found;
}

function summarise(slices, events) {
  const counts = { pending: 0, started: 0, done: 0, blocked: 0 };
  for (const s of slices) counts[statusOf(s.id, events)]++;
  return { total: slices.length, ...counts };
}

module.exports = {
  parsePlan, validatePlan, parseProgress, planApproved,
  statusOf, evidenceFor, nextSlice, lastDone, summarise,
  TERMINAL, STATUSES,
};
