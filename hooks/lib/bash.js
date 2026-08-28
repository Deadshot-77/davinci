'use strict';

const { normalizeAgentType } = require('./agents.js');

// Best-effort guard. An arbitrary shell cannot be made safe by pattern
// matching; this exists so a read-only agent cannot casually route around its
// own write scope, not to stop a determined one. See ruling R22.
//
// Commands that modify files by their nature.
const WRITE_INTENT = [
  />>?\s*[^|&\s>]/,
  /\btee\b/,
  /\bsed\b[^|]*\s-i\b/,
  /\b(rm|mv|cp|truncate|dd|touch|mkdir|rmdir)\b/,
  /\bgit\s+(checkout|restore|apply|am|commit|reset|clean|stash|rebase|merge|push)\b/,
  /\b(npm|pnpm|yarn|bun)\s+(i|install|add|remove|uninstall|link)\b/,
];

// A scripting one-liner is only write-intent when the script body itself writes.
const SCRIPT_ONELINER = /\b(node|python3?|perl|ruby)\b[^|]*\s-(e|c)\b/;
const SCRIPT_WRITES = /writeFileSync|appendFileSync|createWriteStream|\bunlink\b|\brmdir\b|\bmkdirSync\b|\brenameSync\b|open\s*\([^)]*,\s*(mode\s*=\s*)?['"][waxb+]{1,3}['"]|\.write\s*\(/;

function writesOnlyCoordinationState(scopes) {
  return scopes.every((s) => s.startsWith('.devteam/'));
}

function decideBash(input, scopeMap, known) {
  const agent = normalizeAgentType(input && input.agent_type);
  if (!agent) return null;

  const inMap = Object.prototype.hasOwnProperty.call(scopeMap, agent);
  if (inMap) {
    // A gate whose only writable ground is coordination state under .devteam/
    // stays bash-guarded. It can write evidence through the Write tool, which
    // is checked by exact path; it has no business running a shell command
    // that modifies files, and an arbitrary shell cannot be checked by path at
    // all. Anything with real source scope is a builder and is not guarded
    // here -- that has not changed.
    if (scopeMap[agent].length !== 0 && !writesOnlyCoordinationState(scopeMap[agent])) return null;
  } else if (!(known && known.has(agent))) {
    return null;
  }

  const ti = input.tool_input || {};
  const cmd = ti.command || ti.script || '';
  if (!cmd) return null;

  const isWriteIntent =
    WRITE_INTENT.some((re) => re.test(cmd)) ||
    (SCRIPT_ONELINER.test(cmd) && SCRIPT_WRITES.test(cmd));
  if (!isWriteIntent) return null;

  const cmdStr = String(cmd);
  const truncated = cmdStr.length > 200;
  const shown = cmdStr.slice(0, 200) + (truncated ? '…' : '');

  if (!inMap) {
    return {
      deny:
        `${agent} is a Davinci agent but has no entry in scope-map.json, so its write scope ` +
        `cannot be checked. Refusing rather than allowing an ungoverned write. ` +
        `Blocked: ${shown}.`,
    };
  }

  return {
    deny:
      `${agent} is read-only and may not run a command that can modify files. ` +
      `Blocked: ${shown}. Report findings instead of fixing them.`,
  };
}

module.exports = { decideBash, writesOnlyCoordinationState, WRITE_INTENT, SCRIPT_ONELINER, SCRIPT_WRITES };
