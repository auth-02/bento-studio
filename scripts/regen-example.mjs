#!/usr/bin/env node
/**
 * Regenerate an example's exports from the CURRENT Bento Studio code.
 *
 * Drives the real Studio in a headless browser: imports the example's existing
 * page (preserving exact layout/positions/assets via the app's own lossless
 * round-trip), then re-exports all four artifacts through the actual export UI:
 *
 *   examples/<name>/page/<name>-page.html   (page · single file)
 *   examples/<name>/page/<name>-page.zip    (page · folder)
 *   examples/<name>/studio/<name>-studio.html     (Studio copy · single file)
 *   examples/<name>/studio/<name>-studio.zip       (Studio copy · folder)
 *
 * The page single-file (with embedded state) is the import source of truth.
 *
 * Usage:
 *   node scripts/regen-example.mjs <name>          # default: luffy
 *   node scripts/regen-example.mjs <name> --check  # also verify the page renders
 *
 * With --check, after regenerating it reopens the page single-file and fails
 * (exit 1) if no items land on-canvas — so a broken/empty export can't ship
 * silently. (Catches the off-canvas coordinate drift that produced a blank page.)
 *
 * Requires playwright + chromium. If not installed in this repo, point NODE_PATH
 * at an install that has them, e.g.:
 *   NODE_PATH=/path/to/node_modules node scripts/regen-example.mjs luffy
 */
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';

const argv = process.argv.slice(2);
const CHECK = argv.includes('--check');
const NAME = argv.find(a => !a.startsWith('--')) || 'luffy';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP = resolve(ROOT, 'bento-studio.html');
const EX = resolve(ROOT, 'examples', NAME);
const SRC_PAGE = resolve(EX, 'page', `${NAME}-page.html`);

const OUT = {
  'page:single':     resolve(EX, 'page', `${NAME}-page.html`),
  'page:zip':        resolve(EX, 'page', `${NAME}-page.zip`),
  'editable:single': resolve(EX, 'studio', `${NAME}-studio.html`),
  'editable:zip':    resolve(EX, 'studio', `${NAME}-studio.zip`),
};

for (const p of [APP, SRC_PAGE]) {
  if (!existsSync(p)) { console.error(`✗ missing: ${p}`); process.exit(1); }
}

const log = (...a) => console.log('·', ...a);

const browser = await chromium.launch();
const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();
page.on('console', m => { if (m.type() === 'error') console.error('  [page error]', m.text()); });

try {
  log('open Studio', APP);
  await page.goto(pathToFileURL(APP).href, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof state !== 'undefined' && !!document.querySelector('#importInput'), null, { timeout: 30000 });

  log('import source page', SRC_PAGE);
  // Record the boot sample's id so we can wait for the import to actually swap it in
  // (importFile → adoptState is async, and the sample already has items).
  const beforeId = await page.evaluate(() => (typeof state !== 'undefined' && state) ? state.id : null);
  await page.setInputFiles('#importInput', SRC_PAGE);
  await page.waitForFunction(
    prev => state && state.id && state.id !== prev && Array.isArray(state.items) && state.items.length > 0,
    beforeId, { timeout: 30000 });
  const info = await page.evaluate(() => ({ title: state.title, items: state.items.length }));
  log(`loaded "${info.title}" · ${info.items} items`);

  // Normalize coordinates before exporting. A page export shifts items to be
  // frame-relative but leaves the frame's own offset in the embedded state, so a
  // naive import→export round-trip double-shifts and drifts items off-canvas.
  // fitFrameToContent() wraps the frame around the actual content and calls
  // normaliseWorld() (items → origin), which both fixes the current drift and
  // makes future regens idempotent.
  await page.evaluate(() => fitFrameToContent());
  await page.waitForTimeout(300);
  const box = await page.evaluate(() => ({ frame: state.frame, canvas: state.canvas }));
  log(`normalized frame ${box.frame.w}×${box.frame.h} @ (${box.frame.x},${box.frame.y})`);

  // Export each flavour × packaging through the real UI, saving to our paths.
  for (const [key, dest] of Object.entries(OUT)) {
    const [flav, pack] = key.split(':');
    log(`export ${flav}/${pack} → ${dest}`);
    await page.evaluate(() => openExport());
    await page.waitForSelector('#exportModal.on', { timeout: 10000 });
    // fmt defaults to 'html'; set flavour first (re-renders opts), then packaging.
    await page.click(`#exportOpts [data-flav="${flav}"]`);
    await page.click(`#exportOpts [data-pack="${pack}"]`);
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 120000 }),
      page.click('#bExportGo'),
    ]);
    await download.saveAs(dest);
    await page.waitForSelector('#exportModal', { state: 'hidden', timeout: 20000 }).catch(() => {});
  }

  if (CHECK) {
    const target = OUT['page:single'];
    log('check: verifying page renders', target);
    await page.goto(pathToFileURL(target).href, { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    // "Not empty" = at least one non-spacer item is a real box that intersects
    // the viewport. The off-canvas-drift bug parked every item at negative
    // coordinates far outside the viewport, so this catches it.
    const res = await page.evaluate(() => {
      const vw = innerWidth, vh = innerHeight;
      const items = [...document.querySelectorAll('.item')].filter(n => n.dataset.type !== 'spacer');
      let onCanvas = 0;
      for (const n of items) {
        const r = n.getBoundingClientRect();
        if (r.width > 1 && r.height > 1 && r.right > 0 && r.bottom > 0 && r.left < vw && r.top < vh) onCanvas++;
      }
      return { items: items.length, onCanvas };
    });
    if (res.onCanvas < 1) {
      console.error(`✗ CHECK FAILED: page renders empty — 0 of ${res.items} items on-canvas (${target})`);
      process.exitCode = 1;
    } else {
      log(`check OK · ${res.onCanvas}/${res.items} items on-canvas`);
    }
  }

  log('done');
} finally {
  await browser.close();
}
