# Onto

> See what any place looks like on top of anywhere else.

Onto is a small, focused tool for comparing the **true size** of two places. Type a
sentence — _"See **San Francisco** on **Manhattan**"_ — and Onto lays one place's
real outline over the other, at correct ground scale, so you can actually feel the
difference. Pick anything with a boundary: a city, a county, a metro area, a country.

It comes from the everyday habit of thinking about places in analogy ("SF is about
the size of Boston", "Cambridge is smaller than Oakland") and tries to make that
instinct visual and exact.

<!-- Add a screenshot here (capture from a real browser — the map needs WebGL): -->
<!-- ![Onto](docs/screenshot.png) -->

## What it does

- **Compare two places at true size.** The familiar place (X) is drawn as a movable
  overlay; the new place (Y) stays put. Drag X around to line it up.
- **Globe or flat map.** Mercator distorts size toward the poles, so the overlay math
  corrects for latitude — a country dragged north keeps its real ground area.
- **A readout** with area, width, and height for both, and the size multiple.
- **Search anything.** Live OpenStreetMap geocoding, plus bundled metro areas and a few
  curated multi-unit regions (Bay Area, New England, EU) that OSM doesn't return as one
  polygon.

## The parts worth a look

- **Land-accurate boundaries.** Administrative boundaries legally extend over water —
  San Francisco's city-county line runs out into the bay and the Pacific, so the raw
  shape is mostly water and unrecognizable. Onto clips every boundary to land
  (`src/lib/landclip.mjs`): oceans and bays are removed, **inland water is kept** (the
  Great Lakes stay part of a country). SF becomes the peninsula again; Canada loses
  Hudson Bay and the ocean between its Arctic islands.
- **High-resolution coastline.** Clipping is done against OpenStreetMap-derived land
  polygons, so coastlines are crisp (Manhattan keeps its rivers and Roosevelt Island)
  and aligned with the OSM boundaries being clipped. A coarse mask is used for
  country-scale shapes to keep it fast.
- **Legible outlines.** Boundaries are simplified size-adaptively and softened with a
  Chaikin pass, so a jagged municipal line (e.g. Dallas) reads cleanly without losing
  its real shape (`src/lib/shape.mjs`, `src/lib/smooth.mjs`).
- **Glass Lab** (`/glass`). A side project within the project: an interactive playground
  to compare approaches to "liquid glass" on the web (frosted blur → turbulence warp →
  edge-concentrated lens refraction → chromatic aberration), with live sliders.

## Run it locally

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

The bundled data (land masks, metros, regions) is committed, so it runs out of the box.
There are no secrets or API keys — the basemap is keyless CARTO Positron and geocoding
uses the public OSM Nominatim endpoint.

## Regenerating the bundled data

The data under `data/` and `public/data/` is pre-built; you only need this to refresh it.

```bash
# Land masks (OSM simplified land polygons → clip masks)
node scripts/download.mjs https://osmdata.openstreetmap.de/download/simplified-land-polygons-complete-3857.zip /tmp/land.zip
unzip /tmp/land.zip -d /tmp/simplified-3857
node scripts/build-landmask-osm.mjs            # → data/land-mask*.json

# Curated regions (fetched from Nominatim, ~1 req/s)
node scripts/build-regions.mjs                 # → public/data/regions.geojson
```

Metros come from GHS-FUA (JRC R2019A); `scripts/build-metros.mjs` rebuilds
`public/data/metros.geojson` from that ingest (not included in the repo).

## Tech

[Next.js](https://nextjs.org) · [MapLibre GL](https://maplibre.org) via
[react-map-gl](https://visgl.github.io/react-map-gl/) · [Turf.js](https://turfjs.org)
for geometry · Tailwind CSS.

## Data sources & licenses

Onto's code is MIT (see [LICENSE](LICENSE)). The data it uses is under these licenses —
attribution is required and is shown in the app:

- **OpenStreetMap** — boundary geocoding (Nominatim) and the land-polygon clip masks.
  © OpenStreetMap contributors, [ODbL](https://opendatacommons.org/licenses/odbl/).
  Land polygons via [osmdata.openstreetmap.de](https://osmdata.openstreetmap.de/).
- **Basemap** — CARTO Positron, built on OpenStreetMap / OpenMapTiles.
- **Metro areas** — GHS Functional Urban Areas, European Commission JRC (R2019A).

If you deploy this publicly, respect the
[Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/)
(valid User-Agent, ≤1 req/s, no heavy use) — for real traffic, switch to a hosted
geocoder.
