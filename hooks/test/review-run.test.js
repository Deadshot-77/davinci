'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

let mod;
async function load() {
  if (!mod) {
    mod = await import(require('node:url').pathToFileURL(
      path.join(__dirname, '..', '..', 'scripts', 'review-run.mjs')).href);
  }
  return mod;
}

const use = (id, name, input) => ({
  type: 'assistant', message: { content: [{ type: 'tool_use', id, name, input }] },
});
const result = (id, content, is_error) => ({
  type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content, is_error }] },
});
const say = (text) => ({ type: 'assistant', message: { content: [{ type: 'text', text }] } });

test('a refusal is attributed to the command that caused it', async () => {
  const { analyseEvents } = await load();
  const r = analyseEvents([
    use('t1', 'Bash', { command: 'npm install' }),
    result('t1', 'Claude requested permissions to use Bash, but you haven\'t granted it yet.', true),
  ]);
  assert.strictEqual(r.denials.length, 1);
  assert.strictEqual(r.denials[0].tool, 'Bash');
  assert.match(r.denials[0].command, /npm install/);
});

test('output that merely mentions a denial is not a denial', async () => {
  // The first version of this matched any text, so the scripts written to
  // analyse denials reported themselves as refusals. A reader that cries wolf
  // gets switched off, and then it catches nothing at all.
  const { analyseEvents } = await load();
  const r = analyseEvents([
    use('t1', 'Bash', { command: 'node count-denials.js' }),
    result('t1', 'denials: 40\nDENIED (other): cd X && for b in ...', false),
  ]);
  assert.deepStrictEqual(r.denials, [],
    'a successful command whose output discusses denials was counted as one');
});

test('a headless permission_denied event is read directly', async () => {
  // Headless runs emit this structurally. Interactive transcripts do not,
  // which is why both paths exist.
  const { analyseEvents } = await load();
  const r = analyseEvents([
    { type: 'system', subtype: 'permission_denied', tool_name: 'Bash', command: 'git commit -m x' },
  ]);
  assert.strictEqual(r.denials.length, 1);
  assert.strictEqual(r.denials[0].tool, 'Bash');
  assert.match(r.denials[0].command, /git commit/);
});

test('a server started in the background is reported', async () => {
  // Four of these were once left running for hours, holding ports and a
  // directory handle that made the project undeletable. They were in the
  // record the whole time and nothing read it.
  const { analyseEvents } = await load();
  const r = analyseEvents([
    use('t1', 'Bash', { command: 'npm run build && (npx --yes serve out -l 4173 &) && sleep 4' }),
    use('t2', 'Bash', { command: 'python3 -m http.server 8000 &' }),
    use('t3', 'Bash', { command: 'npm test' }),
  ]);
  assert.strictEqual(r.serversStarted.length, 2, 'expected the two servers and not the test run');
});

test('agents and on-demand skills are counted', async () => {
  const { analyseEvents } = await load();
  const r = analyseEvents([
    use('t1', 'Agent', { subagent_type: 'davinci:tech-lead', description: 'Build the thing' }),
    use('t2', 'Skill', { skill: 'davinci:work-ledger' }),
    use('t3', 'Skill', { skill: 'davinci:work-ledger' }),
  ]);
  assert.strictEqual(r.agents.length, 1);
  assert.strictEqual(r.agents[0].agent, 'davinci:tech-lead');
  assert.deepStrictEqual(r.skills, ['davinci:work-ledger'], 'skills should be deduplicated');
  assert.strictEqual(r.skillCalls, 2, 'but the call count should not be');
});

test('a refusal beside a claim of absence is flagged for a human to check', async () => {
  // The plugin's most repeated bug, and the reason this tool exists: the check
  // could not run, and the absence was written down as the answer.
  const { analyseEvents } = await load();
  const r = analyseEvents([
    use('t1', 'Bash', { command: 'command -v higgsfield' }),
    result('t1', 'This command requires approval', true),
    say('I checked the machine and no generator was found, so the page uses drawn artwork.'),
  ]);
  assert.ok(r.suspectedBlockedChecks, 'the pairing went unflagged');
  assert.strictEqual(r.suspectedBlockedChecks.denials, 1);
  assert.ok(r.suspectedBlockedChecks.examples[0].includes('no generator was found'));
});

test('ordinary prose containing "none" is not an absence claim', async () => {
  // An early version matched a bare "none" and flagged `"authMethod": "none"`.
  const { analyseEvents } = await load();
  const r = analyseEvents([
    use('t1', 'Bash', { command: 'x' }),
    result('t1', 'requires approval', true),
    say('The config shows "authMethod": "none" and the remote is set to origin.'),
  ]);
  assert.strictEqual(r.suspectedBlockedChecks, null,
    'a refusal plus unrelated prose was flagged as a blocked check');
});

test('a clean run reports nothing to worry about', async () => {
  const { analyseEvents } = await load();
  const r = analyseEvents([
    use('t1', 'Bash', { command: 'npm test' }),
    result('t1', 'ok, 40 passing', false),
  ]);
  assert.deepStrictEqual(r.denials, []);
  assert.deepStrictEqual(r.serversStarted, []);
  assert.strictEqual(r.suspectedBlockedChecks, null);
});

test('a missing file is reported rather than read as an empty run', async () => {
  const { analyseFile } = await load();
  const r = await analyseFile(path.join(__dirname, 'no-such-run.jsonl'));
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /no such file/);
});
