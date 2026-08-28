'use strict';

// The shipped scope map fits one shape of project. A Next.js app puts route
// handlers under app/api/**, which the shipped map hands wholesale to the
// frontend; Astro's src/pages/** and src/content/** match nothing at all; a PHP
// CMS matches nothing whatsoever. Every miss strands a builder mid-task, and a
// live run had one stop and ask about exactly that.
//
// So a project may declare its own map at .devteam/scope-map.json, written by
// the agent that owns the foundation and reviewed at the foundation gate. This
// module decides whether such a map may be trusted. It is pure: the caller
// reads the file.

const DEVTEAM_PREFIX = '.devteam/';

// An agent whose shipped ground is only coordination state is a gate. A project
// map may not turn one into a writer -- an auditor that can patch its own
// findings is grading its own homework, and no per-project layout needs that.
function isGate(shippedScopes) {
  return Array.isArray(shippedScopes) &&
    shippedScopes.every((s) => String(s).startsWith(DEVTEAM_PREFIX));
}

function validateProjectScopeMap(projectMap, shippedMap) {
  const errors = [];
  if (!projectMap || typeof projectMap !== 'object' || Array.isArray(projectMap)) {
    return ['.devteam/scope-map.json is not a JSON object of agent names to glob arrays.'];
  }

  const seen = new Map();

  for (const [agent, scopes] of Object.entries(projectMap)) {
    if (!Object.prototype.hasOwnProperty.call(shippedMap, agent)) {
      errors.push(
        `.devteam/scope-map.json names "${agent}", which is not an agent this plugin ships. ` +
        `A map cannot invent an agent; the write hook would never consult the entry.`);
      continue;
    }

    if (!Array.isArray(scopes) || scopes.some((s) => typeof s !== 'string' || s.trim() === '')) {
      errors.push(`.devteam/scope-map.json entry for "${agent}" is not an array of non-empty glob strings.`);
      continue;
    }

    const gate = isGate(shippedMap[agent]);

    for (const raw of scopes) {
      const glob = raw.trim();

      if (glob.startsWith('/') || /^[A-Za-z]:[\\/]/.test(glob) || glob.split('/').includes('..')) {
        errors.push(
          `.devteam/scope-map.json gives "${agent}" the path "${glob}", which is absolute or escapes ` +
          `the project. Scopes are project-relative.`);
        continue;
      }

      // Coordination state is the hook's own ground. A project map may not
      // hand out another agent's reports, the brief, the stack profile, or the
      // scope map itself -- that last one would let a map widen itself.
      if (glob.startsWith(DEVTEAM_PREFIX)) {
        const ownScratch = `${DEVTEAM_PREFIX}scratch/${agent}/**`;
        if (glob !== ownScratch) {
          errors.push(
            `.devteam/scope-map.json gives "${agent}" the path "${glob}". A project map may not ` +
            `assign anything under .devteam/ except that agent's own "${ownScratch}"; reports, the ` +
            `brief, the stack profile and this file are the hook's own ground.`);
        }
        continue;
      }

      if (gate) {
        errors.push(
          `.devteam/scope-map.json gives the read-only agent "${agent}" the writable path "${glob}". ` +
          `A gate may not be turned into a builder: a reviewer that can patch its own findings is ` +
          `grading its own homework.`);
        continue;
      }

      if (seen.has(glob)) {
        errors.push(
          `.devteam/scope-map.json gives "${glob}" to both "${seen.get(glob)}" and "${agent}". ` +
          `Scopes must be disjoint, or two agents dispatched in parallel can write the same file.`);
        continue;
      }
      seen.set(glob, agent);
    }
  }

  return errors;
}

// The map the hook should actually enforce. A project map that does not exist,
// does not parse, or does not validate leaves the shipped map in force -- never
// an absent one. Returns the reason alongside, so a caller can say why.
function effectiveScopeMap(shippedMap, projectMapText) {
  if (typeof projectMapText !== 'string' || projectMapText.trim() === '') {
    return { map: shippedMap, source: 'shipped', errors: [] };
  }

  let parsed;
  try {
    parsed = JSON.parse(projectMapText.replace(/^﻿/, ''));
  } catch (err) {
    return { map: shippedMap, source: 'shipped', errors: [`.devteam/scope-map.json is not valid JSON: ${err.message}`] };
  }

  const errors = validateProjectScopeMap(parsed, shippedMap);
  if (errors.length) return { map: shippedMap, source: 'shipped', errors };

  // Agents the project map does not mention keep their shipped scope. A map
  // that specialises the frontend for Astro should not silently strip everyone
  // else of the ground they had.
  return { map: { ...shippedMap, ...parsed }, source: 'project', errors: [] };
}

module.exports = { validateProjectScopeMap, effectiveScopeMap, isGate };
