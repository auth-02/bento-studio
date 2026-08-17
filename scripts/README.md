# Maintainer scripts

Dev-only tooling. Kept separate from the app root so `bento-studio.html` stays a
zero-dependency, no-build single file — nothing here ships to users.

## Regenerate an example's exports

Keeps the bundled examples in sync with the current Studio code. It drives the
**real** Studio in a headless browser: imports the example's existing Bento Page
(preserving exact layout, positions and assets via the app's lossless
round-trip), then re-exports all four artifacts through the actual export UI:

```
examples/<name>/page/<name>-page.html       Bento Page · single file
examples/<name>/page/<name>-page.zip         Bento Page · folder (host this)
examples/<name>/studio/<name>-studio.html    Studio copy · single file
examples/<name>/studio/<name>-studio.zip     Studio copy · folder
```

Only the **Studio copies** embed the editor, so they're the ones that actually
change when Studio code changes; the Bento Pages are read-only and are
regenerated for completeness. The Bento Page single-file (with embedded state) is
the import source of truth.

Scope: the script only rewrites `page/` and `studio/`. `examples/<name>/assets/`
is the original source media and is **kept as-is** — never touched by regen.

### Setup (once)

```bash
cd scripts
npm install                 # installs playwright
npx playwright install chromium
```

### Run

```bash
# from the repo root
node scripts/regen-example.mjs <name>            # e.g. luffy (the default)
node scripts/regen-example.mjs <name> --check    # regen, then verify the page renders
```

`--check` reopens the regenerated Bento Page single-file and exits non-zero if no
items land on-canvas — a guard against the off-canvas coordinate drift that once
produced a blank page, so a bad run can't ship silently.

### Notes

- **When to run:** after any change to `bento-studio.html` that affects exported
  output (chrome wording, export logic, page runtime), so examples don't drift.
- **Remote images:** assets referenced by URL that block cross-origin fetch
  (no `Access-Control-Allow-Origin`) can't be re-embedded and stay as links —
  the script logs a CORS warning for each. This matches how the app behaves.
- **Fidelity:** title, item set and positions are preserved; re-export is a
  round-trip, not a rebuild.
