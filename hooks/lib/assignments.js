'use strict';

const { matchAny } = require('./glob.js');

// A department lead (frontend-engineer, backend-engineer) dispatches several
// cheap workers at once to write disjoint parts of one slice. Those workers
// cannot have a static scope-map entry: the paths they need are their lead's
// paths, and a test asserts no path in that map is writable by two agents.
//
// So their scope arrives per batch instead, in .devteam/assignments.json,
// written by the lead before it dispatches. Two properties have to hold,
// because concurrent writers are the one place this system can corrupt its
// own output:
//
//   disjoint  -- no path is claimable by two assignments, so two workers can
//                never race on one file.
//   contained -- every path is inside the dispatching lead's own scope, so a
//                worker cannot reach somewhere its lead could not. Without
//                this, spawning a worker is a way around the scope map rather
//                than a way to work inside it faster.
//
// A file failing either check governs nothing and workers write nothing until
// it is fixed. Falling back to "allow" would make an invalid file strictly
// more permissive than a valid one, which is how a guard becomes a liability.

const ASSIGNMENTS_PATH = '.devteam/assignments.json';
const CLAIMS_PATH = '.devteam/.assignment-claims.json';

function validateAssignments(doc, scopeMap) {
  const errors = [];
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    return [`${ASSIGNMENTS_PATH} is not a JSON object.`];
  }
  if (typeof doc.batch !== 'string' || !doc.batch.trim()) {
    errors.push('"batch" must be a non-empty string. It is what retires the previous batch\'s claims.');
  }
  const lead = doc.lead;
  if (typeof lead !== 'string' || !lead.trim()) {
    errors.push('"lead" must name the agent dispatching these workers.');
  } else if (!Object.prototype.hasOwnProperty.call(scopeMap, lead)) {
    errors.push(`"lead" is "${lead}", which has no entry in the scope map.`);
  }
  const list = doc.assignments;
  if (!Array.isArray(list) || list.length === 0) {
    errors.push('"assignments" must be a non-empty array.');
    return errors;
  }

  const leadScopes = (lead && scopeMap[lead]) || [];
  const seen = new Map();
  list.forEach((a, i) => {
    const where = `assignments[${i}]`;
    if (!a || typeof a !== 'object' || Array.isArray(a)) {
      errors.push(`${where} is not an object.`);
      return;
    }
    if (typeof a.label !== 'string' || !a.label.trim()) {
      errors.push(`${where} has no "label". A worker with no label cannot be reported on.`);
    }
    if (!Array.isArray(a.paths) || a.paths.length === 0) {
      errors.push(`${where}.paths must be a non-empty array.`);
      return;
    }
    a.paths.forEach((p) => {
      if (typeof p !== 'string' || !p.trim()) {
        errors.push(`${where}.paths contains a non-string entry.`);
        return;
      }
      if (seen.has(p)) {
        errors.push(
          `"${p}" is assigned to both ${seen.get(p)} and ${where}. Two workers on one file is the ` +
          `race this file exists to prevent; split the work so each path has exactly one owner.`);
      } else {
        seen.set(p, where);
      }
      if (leadScopes.length && !matchAny(p, leadScopes)) {
        errors.push(
          `"${p}" is outside ${lead}'s own scope, so a worker would reach further than the lead ` +
          `that dispatched it. Dispatch the agent that owns that path instead.`);
      }
    });
  });
  return errors;
}

// Which assignment, if any, covers this path. Exact paths and globs both work;
// the lead usually names exact files, which is what makes disjointness legible.
function assignmentFor(rel, doc) {
  const list = (doc && doc.assignments) || [];
  for (let i = 0; i < list.length; i++) {
    const paths = (list[i] && list[i].paths) || [];
    if (paths.includes(rel) || matchAny(rel, paths)) return i;
  }
  return -1;
}

// Pure. Returns { deny } to refuse, or { allow: true, claims } with the claim
// table to persist when the write is permitted.
function decideWorkerWrite({ rel, agentId, doc, claims, scopeMap, agent }) {
  if (!doc) {
    return { deny:
      `${agent} has no ${ASSIGNMENTS_PATH}, so nothing says which files it owns. Its lead writes ` +
      `that file before dispatching; a worker never picks its own paths.` };
  }
  const errors = validateAssignments(doc, scopeMap);
  if (errors.length) {
    return { deny: `${ASSIGNMENTS_PATH} is not usable, so no worker may write: ${errors[0]}` };
  }

  const i = assignmentFor(rel, doc);
  if (i === -1) {
    return { deny:
      `${rel} is in no assignment, so ${agent} does not own it. Report it to your lead rather than ` +
      `taking it: a file nobody was assigned is one nobody is reviewing.` };
  }

  // A claim table from an earlier batch describes workers that no longer
  // exist. Retiring it on the batch name means the lead never has to clean up
  // by hand, and a forgotten cleanup cannot silently deny a live worker.
  const fresh = claims && claims.batch === doc.batch ? claims : { batch: doc.batch, byIndex: {} };
  const byIndex = Object.assign({}, fresh.byIndex);
  const holder = byIndex[String(i)];

  if (holder && agentId && holder !== agentId) {
    const label = (doc.assignments[i] && doc.assignments[i].label) || `assignments[${i}]`;
    return { deny:
      `${rel} belongs to the "${label}" assignment, which another worker is already writing. ` +
      `Two workers on one file would overwrite each other. Ask your lead to re-partition.` };
  }
  if (agentId) byIndex[String(i)] = agentId;
  return { allow: true, claims: { batch: doc.batch, byIndex } };
}

module.exports = {
  validateAssignments, assignmentFor, decideWorkerWrite,
  ASSIGNMENTS_PATH, CLAIMS_PATH,
};
