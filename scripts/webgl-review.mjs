// Agent-runnable WebGL review: drive the real UI in Chromium with software
// WebGL (SwiftShader), wait for the map to actually settle, and screenshot the
// rendered MapLibre canvas — the thing headless DOM-only QA can't see.
//
// Setup (once): pnpm add -D playwright && pnpm exec playwright install chromium
// Usage:        node scripts/webgl-review.mjs [url] [--ref=Cambridge]
//               [--target=San Francisco] [--headed]
//               url defaults to http://localhost:3000 (run `next start` first).
// Output:       /tmp/onto-webgl/*.png  (+ non-zero exit if the canvas looks
//               blank — software WebGL can silently fail; if it does, rerun
//               with --headed to use the real GPU).
//
// SwiftShader (--enable-unsafe-swiftshader, required since Chrome 130) is the
// primary path on purpose: deterministic pixels across runs/machines, so
// before/after comparisons are meaningful. Known risk: headless WebGL on ARM
// Macs is historically flaky — hence the blank-canvas guard + --headed escape
// hatch (no automatic fallback: a surprise headed window steals focus and
// breaks reproducibility).
import { mkdirSync, writeFileSync, statSync } from "node:fs";
import { chromium } from "playwright";

const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
};
const url = args.find((a) => !a.startsWith("--")) ?? "http://localhost:3000";
const refPlace = flag("ref", "Cambridge");
const targetPlace = flag("target", "San Francisco");
const headed = args.includes("--headed");

const OUT = "/tmp/onto-webgl";
mkdirSync(OUT, { recursive: true });

const die = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};

/** Wait until __ontoMapIdle has been continuously true for `holdMs`. Only
 *  valid AFTER a selection — the cold-globe idle spin re-renders forever. */
async function waitMapSettled(page, holdMs = 400, timeoutMs = 60_000) {
  await page.waitForFunction(
    (hold) =>
      new Promise((resolve) => {
        const start = performance.now();
        const tick = () => {
          if (!window.__ontoMapIdle) return resolve(false);
          if (performance.now() - start >= hold) return resolve(true);
          requestAnimationFrame(tick);
        };
        tick();
      }),
    holdMs,
    { timeout: timeoutMs, polling: 200 },
  );
}

/** Type a query into a combobox and click the first selectable result. */
async function selectPlace(page, input, query) {
  await input.click();
  await input.pressSequentially(query, { delay: 40 });
  const option = page
    .locator('[role="listbox"] button:not([disabled])')
    .filter({ hasText: new RegExp(query.split(",")[0], "i") })
    .first();
  await option.click({ timeout: 20_000 });
  // choose() closes the dropdown only after the land-clip finishes, so this
  // wait covers the whole selection pipeline.
  await page
    .locator('[role="listbox"]')
    .waitFor({ state: "detached", timeout: 30_000 });
}

const browser = await chromium.launch({
  headless: !headed,
  args: ["--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const consoleErrors = [];
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text());
});
page.on("pageerror", (e) => consoleErrors.push(String(e)));

console.log(`→ ${url}  ("${refPlace}" on "${targetPlace}")`);
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });

// Map booted? (__ontoMap is set in SpanMap's onMapLoad.)
await page.waitForFunction(() => !!window.__ontoMap, { timeout: 30_000 });
await page.waitForTimeout(2500); // let the cold globe paint some frames
await page.screenshot({ path: `${OUT}/01-cold-globe.png` });

// Reference ("somewhere you know") then target ("somewhere new").
await selectPlace(
  page,
  page.locator('input[role="combobox"]').first(),
  refPlace,
);
await selectPlace(page, page.getByPlaceholder("somewhere new"), targetPlace);

await waitMapSettled(page);
await page.waitForTimeout(600); // readout fade-in
await waitMapSettled(page); // re-verify nothing re-triggered rendering

await page.screenshot({ path: `${OUT}/02-comparison.png` });
const canvas = page.locator("canvas.maplibregl-canvas").first();
const box = await canvas.boundingBox();
if (!box || box.width < 100) die("map canvas missing or degenerate");
const canvasShot = await page.screenshot({ clip: box });
writeFileSync(`${OUT}/03-map-canvas.png`, canvasShot);

// Blank-canvas guard: a map that silently failed to render compresses to a
// few KB of flat background. A real basemap at 1440px is far denser.
const canvasBytes = statSync(`${OUT}/03-map-canvas.png`).size;
console.log(`map-canvas PNG: ${(canvasBytes / 1024).toFixed(0)} KB`);
if (canvasBytes < 40_000)
  die(
    `map canvas PNG is only ${(canvasBytes / 1024).toFixed(0)} KB — WebGL likely fell back to a blank canvas. Rerun with --headed to use the real GPU.`,
  );

if (consoleErrors.length) {
  console.log(`console errors (${consoleErrors.length}):`);
  for (const e of consoleErrors.slice(0, 10)) console.log(`  ${e}`);
}

await browser.close();
console.log(`✓ screenshots in ${OUT}: 01-cold-globe, 02-comparison, 03-map-canvas`);
