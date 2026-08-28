# Letting the frontend agent see its own work

For three increments `frontend-craft` mandated a perception loop — render, look,
critique, revise — and it never once executed. There is no browser preview server
in the CLI, so the loop always fell to its third tier: "state that you could not
look". Every design rule was being applied blind.

## What changed

`scripts/shoot.mjs` drives an already-installed Chromium-family browser headlessly
and writes a PNG. No dependency, no install — it finds Edge or Chrome on the usual
paths, honours `CHROME_PATH`, and falls back to `PATH`. It verifies the output is a
real PNG by reading the IHDR chunk, and exits non-zero with an actionable message
when it cannot. A silent failure would let an agent believe it had looked when it
had not, which is the exact failure this exists to remove.

The agent then reads the PNG with the `Read` tool, which renders images. That is
the whole mechanism.

## Evidence it matters

A status page built by the team was typographically strong — monospace, dark
instrument-panel field, hairline rules, one teal accent carrying state — but its
composition did not own the viewport. A small card floated high-left, leaving a
large dead zone right and below. It read as unfinished rather than deliberate.

That flaw is invisible in the source and obvious in one glance. Nobody had ever
glanced, including the agent that wrote it.

Given the ability to screenshot and read its own output, and told only that the
composition did not own the viewport, the agent produced a full-bleed panel: the
display type scaled to the canvas, the status pill moved right to balance what had
been dead space, a three-column data row spanning the width, the accent rule
running full height, and the footer balanced left-to-right. It kept the direction
it was told to keep rather than restyling into something else.

Same agent, same skill, same model. The only difference was that it could see.

## What the loop now requires

1. Serve, then shoot, then **read the image**. Taking the screenshot is not the
   step; looking at it is.
2. A browser preview MCP is equally good where one exists.
3. Only if neither is possible: say so in `assumptions`. Never imply you looked.

Two rules learned from the first real screenshot:

- **Shoot over HTTP, never `file://`.** The page in question uses a root-absolute
  stylesheet href, which loads from a server and fails completely from the
  filesystem. Checked over `file://` it appeared entirely unstyled — a page can
  look broken when it is fine, or fine when it is broken.
- **Judge composition, not just correctness.** Does the layout use the viewport
  deliberately, is vertical rhythm consistent, is there one clear focal entry
  point, does anything crowd at this width.

A mobile pass at 390x844 is required as well, and the pre-flight now demands both
screenshot paths in the report — or an explicit statement that visual verification
was impossible and why.

## Honest limits

- The browser-discovery and spawn paths are exercised by real runs, not by the
  automated suite; only the pure parsing and argument handling are unit-tested.
- One before-and-after. The improvement was clear, but it is a single case.
- The improved page still has weaknesses a designer would push on — the tick-mark
  motifs under each column read as texture filling space rather than encoding
  anything real. Seeing raises the floor; it does not replace judgement.
