// Stress test for the cold-globe interaction states: can the user always grab
// the drifting globe, does the drift stop/resume at the right moments, and
// does the "reset view" control surface when the view leaves home.
//
// Usage: node scripts/qa-cold-globe.mjs [url] [--headed] [--trials=8]
//        url defaults to http://localhost:3000. Screenshots: /tmp/onto-cold-globe
// Runs in Chromium with software WebGL (SwiftShader), same as webgl-review.mjs.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith("--")) ?? "http://localhost:3000";
const headed = args.includes("--headed");
const trials = Number(
  args.find((a) => a.startsWith("--trials="))?.slice(9) ?? 8,
);
const SHOTS = "/tmp/onto-cold-globe";
mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({
  headless: !headed,
  args: ["--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

let failures = 0;
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures++;
};

async function boot() {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForFunction(() => !!window.__ontoMap, { timeout: 30_000 });
  // Count real drag gestures from the map's own events.
  await page.evaluate(() => {
    window.__drags = 0;
    window.__ontoMap.on("dragstart", () => window.__drags++);
  });
  // Let the load ease + spin start (650ms delay) settle in.
  await page.waitForTimeout(1500);
}

const camera = () =>
  page.evaluate(() => {
    const m = window.__ontoMap;
    const c = m.getCenter();
    return { lng: c.lng, lat: c.lat, zoom: m.getZoom() };
  });

/** Is the camera drifting? Samples the center over `ms`. */
async function drifting(ms = 700) {
  const a = await camera();
  await page.waitForTimeout(ms);
  const b = await camera();
  return Math.abs(b.lng - a.lng) > 0.05;
}

// Offered = rendered with a box and not inside an `inert` (faded-out) wrapper.
// Playwright's isVisible() counts opacity:0 as visible, so check directly.
const resetVisible = () =>
  page.evaluate(() => {
    const b = document.querySelector(
      'button[aria-label="Reset view"], button[aria-label="Reset"]',
    );
    if (!b || b.closest("[inert]")) return false;
    const r = b.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });

const clickResetView = () =>
  page
    .locator('button[aria-label="Reset view"]')
    .first()
    .click({ timeout: 3000 })
    .catch(() => console.log("  (no Reset view control to click)"));

// A grab that presses, holds still for `holdMs`, then drags vertically
// (latitude change is unambiguous — the drift only moves longitude).
async function grab(holdMs, steps) {
  const cx = 720;
  const cy = 480;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  if (holdMs) await page.waitForTimeout(holdMs);
  await page.mouse.move(cx, cy + 160, { steps });
  await page.mouse.up();
  await page.waitForTimeout(250);
}

console.log(`→ ${url}\n`);

// 1. Grab reliability across timing patterns, fresh page each time.
const patterns = [
  { name: "press-hold-then-drag", holdMs: 120, steps: 12 },
  { name: "slow careful drag", holdMs: 40, steps: 60 },
  { name: "quick flick", holdMs: 0, steps: 3 },
];
for (const p of patterns) {
  let ok = 0;
  for (let i = 0; i < trials; i++) {
    await boot();
    const before = await camera();
    await grab(p.holdMs, p.steps);
    const after = await camera();
    const drags = await page.evaluate(() => window.__drags);
    if (drags > 0 && Math.abs(after.lat - before.lat) > 3) ok++;
  }
  check(ok === trials, `grab: ${p.name}`, `${ok}/${trials} moved the globe`);
}

// 2. State machine on one page.
await boot();
check(await drifting(), "cold: globe drifts on load");
check(!(await resetVisible()), "cold: no reset control at home");

// A plain click (no drag) must not stop the drift.
await page.mouse.click(720, 480);
await page.waitForTimeout(300);
check(await drifting(), "cold: click without drag keeps drifting");

// Holding the pointer down pauses the drift (so the grab can't be lost).
await page.mouse.move(720, 480);
await page.mouse.down();
check(!(await drifting(500)), "cold: drift pauses while pointer is held");
await page.mouse.up();
await page.waitForTimeout(300);
check(await drifting(), "cold: drift resumes after release without drag");

// Drag → drift stops for good, reset view appears.
await grab(60, 12);
await page.waitForTimeout(1200); // past any inertia
check(!(await drifting()), "moved: drift stays stopped after a drag");
check(await resetVisible(), "moved: reset view control surfaces");

// Reset view → home framing, drift resumes, control hides.
await clickResetView();
await page.waitForTimeout(1400);
check(await drifting(), "reset: drift resumes");
check(!(await resetVisible()), "reset: control hides again");
const home = await camera();
check(Math.abs(home.lat - 24) < 1, "reset: back at home latitude", home.lat.toFixed(2));

// Wheel zoom in → off-home: drift pauses, reset surfaces.
await page.mouse.move(720, 480);
for (let i = 0; i < 6; i++) {
  await page.mouse.wheel(0, -240);
  await page.waitForTimeout(60);
}
await page.waitForTimeout(1200);
const zoomed = await camera();
check(zoomed.zoom > home.zoom + 1, "zoom: wheel zooms in", zoomed.zoom.toFixed(2));
check(!(await drifting()), "zoom: drift pauses when zoomed in");
check(await resetVisible(), "zoom: reset view control surfaces");

await clickResetView();
await page.waitForTimeout(1400);
check(await drifting(), "zoom: reset returns to drifting");

// Zoom buttons: +1 leaves home, −1 comes back — no reset needed.
await page.getByRole("button", { name: "Zoom in" }).click();
await page.waitForTimeout(700);
check(await resetVisible(), "buttons: zoom in surfaces reset view");
check(!(await drifting()), "buttons: zoomed in holds the drift");
await page.getByRole("button", { name: "Zoom out" }).click();
await page.waitForTimeout(700);
check(!(await resetVisible()), "buttons: zoom back out hides reset view");
check(await drifting(1500), "buttons: zoom back out resumes the drift");

// Flat map: no drift; switching back to globe goes home and drifts.
await page.getByRole("button", { name: "Flat map" }).click();
await page.waitForTimeout(900);
check(!(await drifting()), "flat: no drift on the flat map");
await grab(60, 12);
await page.waitForTimeout(1000);
check(await resetVisible(), "flat: panning surfaces reset view");
await page.getByRole("button", { name: "Globe" }).click();
await page.waitForTimeout(1400);
check(!(await resetVisible()), "flat→globe: returns home, control hides");
check(await drifting(1500), "flat→globe: drift resumes");

// Resize while drifting must not snap the longitude back.
const pre = await camera();
await page.setViewportSize({ width: 1200, height: 800 });
await page.waitForTimeout(150);
const post = await camera();
check(
  Math.abs(post.lng - pre.lng) < 5,
  "resize: keeps current longitude",
  `${pre.lng.toFixed(1)} → ${post.lng.toFixed(1)}`,
);
await page.setViewportSize({ width: 1440, height: 900 });

// Selection → drift stops, reset reads "Reset"; reset → home + drift.
const combo = page.locator('input[role="combobox"]').first();
await combo.click();
await combo.pressSequentially("Paris", { delay: 40 });
await page
  .locator('[role="listbox"] button:not([disabled])')
  .first()
  .click({ timeout: 20_000 });
await page
  .locator('[role="listbox"]')
  .waitFor({ state: "detached", timeout: 30_000 });
await page.waitForTimeout(1500);
check(!(await drifting()), "one place: drift stops");
check(
  (await page.locator('button[aria-label="Reset"]').count()) === 1 &&
    (await resetVisible()),
  "one place: reset offered (fields can't be cleared otherwise)",
);
await page.locator('button[aria-label="Reset"]').click();
await page.waitForTimeout(1600);
check(await drifting(1500), "one place → reset: drift resumes");
check(!(await resetVisible()), "one place → reset: control hides");
await page.screenshot({ path: `${SHOTS}/desktop-home.png` });
await grab(60, 12);
await page.waitForTimeout(1000);
await page.screenshot({ path: `${SHOTS}/desktop-moved.png` });

// Touch (mobile viewport): a press-hold-then-drag must also pick up the globe.
const mobile = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});
const m = await mobile.newPage();
const cdp = await mobile.newCDPSession(m);
await m.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
await m.waitForFunction(() => !!window.__ontoMap, { timeout: 30_000 });
await m.waitForTimeout(1500);
const touch = (type, x, y) =>
  cdp.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: type === "touchEnd" ? [] : [{ x, y }],
  });
let touchOk = 0;
for (let i = 0; i < trials; i++) {
  await m.evaluate(() => window.__ontoMap.jumpTo({ center: [10, 24] }));
  await m.waitForTimeout(300);
  const lat0 = await m.evaluate(() => window.__ontoMap.getCenter().lat);
  await touch("touchStart", 195, 360);
  await m.waitForTimeout(120);
  for (let s = 1; s <= 12; s++) await touch("touchMove", 195, 360 + s * 12);
  await touch("touchEnd", 195, 504);
  await m.waitForTimeout(300);
  const lat1 = await m.evaluate(() => window.__ontoMap.getCenter().lat);
  if (Math.abs(lat1 - lat0) > 3) touchOk++;
}
check(touchOk === trials, "touch: press-hold-then-drag", `${touchOk}/${trials}`);
await m.getByRole("button", { name: "Menu" }).click();
await m.waitForTimeout(300);
check(
  await m.getByRole("button", { name: "Reset view" }).isVisible(),
  "touch: kebab offers Reset view after a pan",
);
await m.screenshot({ path: `${SHOTS}/mobile-moved-menu.png` });

if (errors.length) console.log(`\npage errors:\n  ${errors.join("\n  ")}`);
await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
