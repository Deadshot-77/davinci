---
description: Set up Davinci for this project — writes the permissions the team needs to work
argument-hint: [project directory, or leave blank for here]
---

You are setting someone up to use this plugin for the first time. Assume they
are a capable person who does not know this plugin, may not know what a
permission profile is, and should not have to.

**Explain, do not interrogate.** One question, in plain language, and only
because it has a real consequence they should choose knowingly.

## Why this exists, if they ask

The team's agents run in their own sealed sessions and cannot reach the user.
Normally Claude Code asks before running a shell command; down there, there is
nobody to ask, so an ungranted command is simply refused. The agent then
correctly reports that it could not check something — honest, and useless.

This writes the answers in advance, once.

## 1. Find the plugin

The tool that does the work lives in the plugin directory, whose path differs on
every machine. Find it:

```
cat ~/.claude/plugins/installed_plugins.json
```

Look for a key beginning `davinci@` and take its `installPath`.

If there is no such entry, the plugin was loaded with `--plugin-dir`, and that
path is the one the user typed when they started this session. If you cannot
determine it, ask for it — that is a fair question, and the only one worth
asking twice.

## 2. Show them what it found

Run the dry run first. It writes nothing.

```
node <plugin>/scripts/setup.mjs .
```

Tell them, in their words, what it detected: the framework, which of their own
scripts it will let the team run, and that six of the plugin's own tools are
included by full path so they do not have to write them out.

## 3. Ask the one question that matters

**"May the team install packages?"**

Put it plainly, with the trade in one line each:

- **Yes** — the team can create a new project and pick current, compatible
  versions itself rather than guessing from memory. This is what you want for a
  new build. It also means `npm install` runs whatever setup scripts a package
  ships with, which is code from the internet running on your machine.
- **No** — safer, and the team can only work in a project that already exists
  and is already installed.

Use `AskUserQuestion`. If they cannot decide, recommend **yes** for a new
project and **no** for an existing one they care about, say which you picked,
and move on. Never leave them stuck on this.

Only mention image generation if they have brought it up. It spends money, and
an unprompted question about credits is noise to someone who wants a website.

## 4. Write it

```
node <plugin>/scripts/setup.mjs . --write            (and --allow-install if they said yes)
```

It writes `.claude/settings.local.json`, merges rather than overwrites anything
already there, and adds the file to `.gitignore` — the paths inside are specific
to this machine, so committing them would break everyone else's.

## 5. Tell them what happens next

Three sentences, no more:

- What was granted, roughly — "the team can now build, lint and check its own
  work, and use the plugin's own tools."
- What was deliberately left out and why, in one line: **`node -e` is never
  granted**, because it is the one command that would let an agent write
  anywhere on disk regardless of the file-write guard.
- How to start: `/davinci:build <what you want>`.

## What you never do

- Ask them to hand-write a path, a glob, or a JSON file.
- Grant `node -e`, `node -p`, or an arbitrary script runner. A test exists that
  fails the suite if anyone adds one, and this command must not be the exception.
- Overwrite an existing settings file. The script merges; if it reports the file
  is unreadable, say so and stop rather than replacing it.
- Explain the permission model unless they ask. They want a website.

The project to set up:

$ARGUMENTS
