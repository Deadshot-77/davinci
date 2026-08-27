'use strict';

const fs = require('fs');
const path = require('path');

// Claude Code namespaces plugin agents as "<plugin>:<agent>". The same
// definitions loaded from .claude/agents/ are bare. Normalise so one scope map
// governs both, and so report filenames never contain a colon.
function normalizeAgentType(agentType) {
  const s = String(agentType || '');
  const i = s.lastIndexOf(':');
  return i === -1 ? s : s.slice(i + 1);
}

// The agent definitions this plugin ships, by bare name.
function knownAgents(agentsDir) {
  const dir = agentsDir || path.join(__dirname, '..', '..', 'agents');
  try {
    return new Set(
      fs.readdirSync(dir)
        .filter((f) => f.endsWith('.md'))
        .map((f) => f.slice(0, -3))
    );
  } catch (err) {
    return new Set();
  }
}

module.exports = { normalizeAgentType, knownAgents };
