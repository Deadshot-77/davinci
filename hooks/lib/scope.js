'use strict';

const path = require('path');
const { matchAny, globToRegExp } = require('./glob.js');
const { normalizeAgentType } = require('./agents.js');
const { decideWorkerWrite, ASSIGNMENTS_PATH } = require('./assignments.js');

function toRepoRelative(filePath, cwd) {
  const rel = path.relative(cwd, filePath);
  return rel.split(path.sep).join('/');
}

// Which agent, if any, may write this path. A denial that names the owner turns
// a dead end into a routing instruction: the blocked agent reports who should
// have had the work, and the lead re-dispatches instead of guessing. Three runs
// in a row assigned a path to a builder that the map gave to someone else.
function ownerOf(rel, scopeMap, excluding) {
  for (const [agent, scopes] of Object.entries(scopeMap)) {
    // An empty scope needs no special case: matchAny() against [] is already false.
    if (agent === excluding || !Array.isArray(scopes)) continue;
    if (matchAny(rel, scopes)) return agent;
  }
  return null;
}

// The agent that owns the stack profile is the foundation layer and is exempt
// from needing one -- it is the one that writes it. Derived from the map rather
// than named here, so renaming the foundation agent cannot desynchronise this.
function ownsStackProfile(scopes) {
  return scopes.includes('.devteam/stack-profile.md');
}

// Agents dispatched several at a time by a department lead to write disjoint
// parts of one slice. They hold no static scope -- the paths they need are
// their lead's, and a test asserts no path in the map has two owners -- so
// their scope arrives per batch through .devteam/assignments.json. See
// lib/assignments.js.
const WORKERS = new Set(['implementer']);

// The agents allowed to write the batch file that governs workers. Named
// rather than inferred: "has a non-empty scope" would have let the review
// gates write it too, on the strength of their scratch directories. A test
// asserts this set is exactly the agents declaring the worker Agent tool, so
// the two cannot drift apart.
const WORKER_LEADS = new Set(['frontend-engineer', 'backend-engineer']);

function decideScope(input, scopeMap, known, foundation, workers) {
  const agent = normalizeAgentType(input && input.agent_type);
  if (!agent) return null;
  if (!Object.prototype.hasOwnProperty.call(scopeMap, agent)) {
    if (known && known.has(agent)) {
      return {
        deny:
          `${agent} is a Davinci agent but has no entry in scope-map.json, so its write scope ` +
          `cannot be checked. Refusing rather than allowing an ungoverned write.`,
      };
    }
    return null;
  }

  const ti = input.tool_input || {};
  const filePath = ti.file_path || ti.path || ti.notebook_path;
  if (!filePath) {
    return {
      deny:
        `${agent} used a write tool with no recognisable file path ` +
        `(tool_input keys: ${Object.keys(ti).join(', ')}). ` +
        `Denied because write scope cannot be checked.`,
    };
  }

  const rel = toRepoRelative(filePath, input.cwd || process.cwd());

  if (rel === '..' || rel.startsWith('../') || path.isAbsolute(rel)) {
    return { deny: `${agent} attempted to write outside the project: ${filePath}` };
  }

  // Every agent may always write its own report.
  if (globToRegExp(`.devteam/reports/${agent}-*.json`).test(rel)) return null;

  const scopes = scopeMap[agent];

  // A lead writes the batch that governs its own workers. This cannot come
  // from the scope map: both leads need the same path, and a test asserts no
  // path there has two owners -- so it is an exemption, like the report above.
  //
  // Workers are absent from that set on purpose: choosing your own assignment
  // is choosing your own scope, and the partition would then be self-declared by
  // the very agents it exists to constrain.
  if (rel === ASSIGNMENTS_PATH && WORKER_LEADS.has(agent)) return null;

  // No builder starts before the foundation exists. The design has always said
  // so; a live run showed the lead skipping it anyway, and builders then work
  // against a contract nobody wrote. Coordination state under .devteam/ is
  // always allowed -- a blocked agent must still be able to file its report.
  if (foundation && !foundation.hasStackProfile && !foundation.routeDirect &&
      !rel.startsWith('.devteam/') && (scopes.length > 0 || WORKERS.has(agent)) &&
      !ownsStackProfile(scopes)) {
    return {
      deny:
        `${agent} may not write ${rel} yet: .devteam/stack-profile.md does not exist, so there is ` +
        `no contract for this build to obey. Report blocked. The lead must dispatch infra-architect ` +
        `and pass the foundation gate before any builder starts, unless the brief carries ` +
        `"Route: direct".`,
    };
  }

  // A worker's scope is the assignment its lead wrote for this batch, not an
  // entry in the map. Checked before the read-only rule below, which would
  // otherwise refuse it for holding the empty scope that makes it a worker.
  if (WORKERS.has(agent)) {
    return decideWorkerWrite({
      rel,
      agent,
      agentId: input.agent_id,
      doc: workers && workers.doc,
      claims: workers && workers.claims,
      scopeMap,
    });
  }

  if (scopes.length === 0) {
    return { deny: `${agent} is read-only and may not write ${rel}. Report findings instead.` };
  }
  if (!matchAny(rel, scopes)) {
    const owner = ownerOf(rel, scopeMap, agent);
    const routing = owner
      ? `${owner} owns this path. Report blocked and name ${owner} so the lead ` +
        `re-dispatches it there rather than guessing.`
      : `No agent owns this path, which is a gap in the foundation rather than a ` +
        `mistake of yours. Report blocked and say so, so the scope map can be fixed ` +
        `before anyone tries again.`;
    return {
      deny: `${agent} may not write ${rel}. Its write scope is: ${scopes.join(', ')}. ` + routing,
    };
  }
  return null;
}

module.exports = { decideScope, toRepoRelative, ownsStackProfile, ownerOf, WORKERS, WORKER_LEADS };
