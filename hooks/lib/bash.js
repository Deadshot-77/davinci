'use strict';

const { normalizeAgentType } = require('./agents.js');

// Best-effort guard. An arbitrary shell cannot be made safe by pattern
// matching; this exists so a read-only agent cannot casually route around its
// own write scope, not to stop a determined one. See ruling R22.
const WRITE_INTENT = [
  />>?\s*[^|&\s>]/,
  /\btee\b/,
  /\bsed\b[^|]*\s-i\b/,
  /\b(rm|mv|cp|truncate|dd|touch|mkdir)\b/,
  /\bgit\s+(checkout|restore|apply|am|commit|reset|clean|stash|rebase|merge|push)\b/,
  /\b(npm|pnpm|yarn|bun)\s+(i|install|add|remove|uninstall|link)\b/,
  /\b(node|python3?|perl|ruby)\b[^|]*\s-(e|c)\b/,
  /writeFileSync|appendFileSync|createWriteStream/,
];

function decideBash(input, scopeMap, known) {
  const agent = normalizeAgentType(input && input.agent_type);
  if (!agent) return null;

  const inMap = Object.prototype.hasOwnProperty.call(scopeMap, agent);
  if (inMap) {
    if (scopeMap[agent].length !== 0) return null;
  } else if (!(known && known.has(agent))) {
    return null;
  }

  const ti = input.tool_input || {};
  const cmd = ti.command || ti.script || '';
  if (!cmd) return null;
  if (!WRITE_INTENT.some((re) => re.test(cmd))) return null;

  if (!inMap) {
    return {
      deny:
        `${agent} is a Davinci agent but has no entry in scope-map.json, so its write scope ` +
        `cannot be checked. Refusing rather than allowing an ungoverned write. ` +
        `Blocked: ${String(cmd).slice(0, 120)}.`,
    };
  }

  return {
    deny:
      `${agent} is read-only and may not run a command that can modify files. ` +
      `Blocked: ${String(cmd).slice(0, 120)}. Report findings instead of fixing them.`,
  };
}

module.exports = { decideBash, WRITE_INTENT };
