'use strict';

const path = require('path');
const { matchAny, globToRegExp } = require('./glob.js');
const { normalizeAgentType } = require('./agents.js');

function toRepoRelative(filePath, cwd) {
  const rel = path.relative(cwd, filePath);
  return rel.split(path.sep).join('/');
}

// The agent that owns the stack profile is the foundation layer and is exempt
// from needing one -- it is the one that writes it. Derived from the map rather
// than named here, so renaming the foundation agent cannot desynchronise this.
function ownsStackProfile(scopes) {
  return scopes.includes('.devteam/stack-profile.md');
}

function decideScope(input, scopeMap, known, foundation) {
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

  // No builder starts before the foundation exists. The design has always said
  // so; a live run showed the lead skipping it anyway, and builders then work
  // against a contract nobody wrote. Coordination state under .devteam/ is
  // always allowed -- a blocked agent must still be able to file its report.
  if (foundation && !foundation.hasStackProfile && !foundation.routeDirect &&
      !rel.startsWith('.devteam/') && scopes.length > 0 && !ownsStackProfile(scopes)) {
    return {
      deny:
        `${agent} may not write ${rel} yet: .devteam/stack-profile.md does not exist, so there is ` +
        `no contract for this build to obey. Report blocked. The lead must dispatch infra-architect ` +
        `and pass the foundation gate before any builder starts, unless the brief carries ` +
        `"Route: direct".`,
    };
  }

  if (scopes.length === 0) {
    return { deny: `${agent} is read-only and may not write ${rel}. Report findings instead.` };
  }
  if (!matchAny(rel, scopes)) {
    return {
      deny:
        `${agent} may not write ${rel}. Its write scope is: ${scopes.join(', ')}. ` +
        `Report this as a blocked dependency so the tech-lead can route it.`,
    };
  }
  return null;
}

module.exports = { decideScope, toRepoRelative, ownsStackProfile };
