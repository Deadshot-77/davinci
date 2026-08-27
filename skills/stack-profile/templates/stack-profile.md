# Stack profile

Every agent reads this file before writing code. It is the contract.

Every blank below is marked `FILL`. The foundation gate rejects any section that
still contains that word, so an unfilled section cannot pass as complete.

## Framework

FILL — name and major version, e.g. "Next.js 15 (App Router)". Must match a real
dependency in package.json.

## Language

FILL — e.g. "TypeScript 5, strict mode on"

## Package manager

FILL — npm | pnpm | yarn | bun, and the lockfile that proves it

## Directory map

FILL — where each kind of file lives. One line per directory.

## Naming conventions

FILL — file naming, component naming, export style. Be specific enough that two
agents writing different files produce consistent output.

## Testing

FILL — runner, file location, naming pattern, and how to run a single test.

## Commands

FILL — dev, build, test, lint. The exact command strings.
