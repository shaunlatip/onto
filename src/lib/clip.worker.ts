/// <reference lib="webworker" />
// Clip worker — owns the land-mask tiers (fetch, parse, binary index) and runs
// the clip itself, so neither the multi-MB parse nor a continent-sized
// `intersect` ever lands on the main thread (the clip would otherwise run
// right under the 900 ms fitBounds animation). Spawned by src/lib/landmask.ts,
// which falls back to the same code on the main thread if workers are
// unavailable.
import { clipWithTiers, prefetchTiers, type Area } from "./masktiers";

type ClipRequest =
  | { type: "prefetch" }
  | { type: "clip"; id: number; geometry: Area };

self.addEventListener("message", (e: MessageEvent<ClipRequest>) => {
  const msg = e.data;
  if (msg.type === "prefetch") {
    prefetchTiers();
    return;
  }
  void clipWithTiers(msg.geometry).then((geometry) => {
    self.postMessage({ id: msg.id, geometry });
  });
});
