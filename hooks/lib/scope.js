'use strict';

const path = require('path');
const { matchAny, globToRegExp } = require('./glob.js');

function toRepoRelative(filePath, cwd) {
  const rel = path.relative(cwd, filePath);
  return rel.split(path.sep).join('/');
}

function decideScope(input, scopeMap) {
  const agent = input && input.agent_type;
  if (!agent || !Object.prototype.hasOwnProperty.call(scopeMap, agent)) return null;

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

module.exports = { decideScope, toRepoRelative };
