// Live check of true-size placement in both views. Drives the real UI: picks
// "Greenland on United States", drags Greenland to several latitudes, and at
// each stop checks, in the globe AND the flat map:
//   • same geometry — the overlay data is identical in both projections
//     (MapLibre does the projecting, for the overlay exactly as for the basemap)
//   • proportions — the overlay's on-screen height/width, camera centered on
//     it, vs. its true ground height/width (tangent-plane extents). On the
//     globe these should agree everywhere; on the flat map they agree near the
//     equator and drift apart toward the poles only as much as Mercator
//     stretches the real land there (north part scaled more than south part).
//
// Usage: node scripts/qa-true-size.mjs [url] [--headed]
//        url defaults to http://localhost:3000. Screenshots: /tmp/onto-true-size
// Software WebGL (SwiftShader), same as webgl-review.mjs.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith("--")) ?? "http://localhost:3000";
const headed = args.includes("--headed");
const OUT = "/tmp/onto-true-size";
mkdirSync(OUT, { recursive: true });

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

async function selectPlace(input, query, match) {
  await input.click();
  await input.pressSequentially(query, { delay: 40 });
  await page
    .locator('[role="listbox"] button:not([disabled])')
    .filter({ hasText: match })
    .first()
    .click({ timeout: 20_000 });
  await page
    .locator('[role="listbox"]')
    .waitFor({ state: "detached", timeout: 60_000 });
}

async function settle() {
  await page.waitForTimeout(300);
  await page.waitForFunction(() => window.__ontoMapIdle === true, null, {
    timeout: 30_000,
    polling: 100,
  });
  await page.waitForTimeout(200);
}

/** The overlay as MapLibre has it, plus its vertex-mean center on the sphere
 *  and its ground extents in the tangent plane at that center. */
const overlay = () =>
  page.evaluate(() => {
    const src = window.__ontoMap.getSource("reference");
    const geom = src.serialize().data.geometry;
    const pts = geom.coordinates.flat(2);
    const D = Math.PI / 180;
    const v = pts.map(([lon, lat]) => [
      Math.cos(lat * D) * Math.cos(lon * D),
      Math.cos(lat * D) * Math.sin(lon * D),
      Math.sin(lat * D),
    ]);
    const m = v.reduce((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]], [0, 0, 0]);
    const n = Math.hypot(...m);
    const c = m.map((x) => x / n);
    const lat = Math.asin(c[2]) / D;
    const lon = Math.atan2(c[1], c[0]) / D;
    // tangent basis at the center: east, north
    const e = [-Math.sin(lon * D), Math.cos(lon * D), 0];
    const no = [
      -Math.sin(lat * D) * Math.cos(lon * D),
      -Math.sin(lat * D) * Math.sin(lon * D),
      Math.cos(lat * D),
    ];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const es = v.map((p) => dot(p, e));
    const ns = v.map((p) => dot(p, no));
    const groundAspect =
      (Math.max(...ns) - Math.min(...ns)) / (Math.max(...es) - Math.min(...es));
    return { json: JSON.stringify(geom), pts, center: [lon, lat], groundAspect };
  });

/** Screen height/width of the overlay's projected vertices. */
const screenAspect = (pts) =>
  page.evaluate((pts) => {
    const map = window.__ontoMap;
    const xy = pts.map((p) => map.project(p));
    const xs = xy.map((q) => q.x);
    const ys = xy.map((q) => q.y);
    return (
      (Math.max(...ys) - Math.min(...ys)) / (Math.max(...xs) - Math.min(...xs))
    );
  }, pts);

/** Drag the overlay so its center lands near `to` (lon/lat). */
async function dragTo(to) {
  const o = await overlay();
  // frame the overlay and the destination together
  await page.evaluate(
    ([a, b]) =>
      window.__ontoMap.jumpTo({
        center: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
        zoom: 1.3,
      }),
    [o.center, to],
  );
  await settle();
  // grab at the overlay's center — confirm the fill is actually under it
  const grab = await page.evaluate((c) => {
    const map = window.__ontoMap;
    const p = map.project(c);
    const hit = map
      .queryRenderedFeatures([p.x, p.y], { layers: ["reference-fill"] })
      .length;
    return { x: p.x, y: p.y, hit };
  }, o.center);
  if (!grab.hit) throw new Error(`nothing to grab at ${o.center}`);
  const drop = await page.evaluate((t) => window.__ontoMap.project(t), to);
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  await page.mouse.move(drop.x, drop.y, { steps: 20 });
  await page.mouse.up();
  await page.waitForTimeout(300);
}

async function setProjection(p) {
  const current = await page.evaluate(
    () => window.__ontoMap.getProjection()?.type ?? "mercator",
  );
  if (current === p) return;
  await page
    .getByRole("button", { name: p === "globe" ? "Globe" : "Flat map" })
    .first()
    .click();
  await page.waitForTimeout(500);
}

/** Center the camera on the overlay, measure, screenshot. */
async function look(label) {
  const o = await overlay();
  await page.evaluate((c) => window.__ontoMap.jumpTo({ center: c, zoom: 2.2 }), o.center);
  await settle();
  const aspect = await screenAspect(o.pts);
  await page.screenshot({ path: `${OUT}/${label}.png` });
  return { ...o, aspect };
}

console.log(`→ ${url}\n`);
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
await page.waitForFunction(() => !!window.__ontoMap, { timeout: 30_000 });
await selectPlace(page.locator('input[role="combobox"]').first(), "Greenland", /Greenland/);
await selectPlace(page.getByPlaceholder("somewhere new"), "United States", /United States/);
await settle();

const STOPS = [
  { name: "equator", to: [-40, 0] },
  { name: "40N", to: [-40, 40] },
  { name: "50S", to: [-20, -50] },
  { name: "home", to: [-41, 73] },
];

for (const stop of STOPS) {
  await setProjection("globe");
  await dragTo(stop.to);
  const g = await look(`${stop.name}-globe`);
  await setProjection("mercator");
  const m = await look(`${stop.name}-flat`);
  const lat = g.center[1].toFixed(1);
  check(g.json === m.json, `${stop.name} (lat ${lat}°): same geometry in both views`);
  const gErr = Math.abs(g.aspect / g.groundAspect - 1);
  check(
    gErr < 0.05,
    `${stop.name}: globe proportions match the ground`,
    `screen h/w ${g.aspect.toFixed(2)} vs ground ${g.groundAspect.toFixed(2)}`,
  );
  const mErr = Math.abs(m.aspect / m.groundAspect - 1);
  if (Math.abs(g.center[1]) < 15)
    check(
      mErr < 0.05,
      `${stop.name}: flat-map proportions match the ground near the equator`,
      `screen h/w ${m.aspect.toFixed(2)} vs ground ${m.groundAspect.toFixed(2)}`,
    );
  else
    console.log(
      `  ${stop.name}: flat-map h/w ${m.aspect.toFixed(2)} vs ground ${m.groundAspect.toFixed(2)} (Mercator stretch toward the pole, same as the basemap)`,
    );
}

if (errors.length) console.log(`\npage errors:\n  ${errors.join("\n  ")}`);
await browser.close();
console.log(
  failures ? `\n${failures} check(s) failed` : `\nall checks passed — screenshots in ${OUT}`,
);
process.exit(failures ? 1 : 0);
