import { clipWithTiers, prefetchTiers, type Area } from "./masktiers";

/** Client land-clipping entry points (used by GeocodeInput). The work runs in
 *  a dedicated worker (src/lib/clip.worker.ts) so mask parsing and the clip
 *  itself stay off the main thread; if workers are unavailable or the worker
 *  dies, the identical code runs on the main thread instead. Either way a
 *  selection never fails on this — the ladder ends at the raw geometry. */

type ClipReply = { id: number; geometry: Area };

let worker: Worker | null = null;
let workerDead = false;
let nextId = 1;
const pending = new Map<number, (g: Area | null) => void>();

/** Fail over: resolve everything in flight with null so callers rerun the
 *  clip on the main thread, and stop using the worker for this session. */
function failWorker() {
  workerDead = true;
  worker?.terminate();
  worker = null;
  for (const resolve of pending.values()) resolve(null);
  pending.clear();
}

function getWorker(): Worker | null {
  if (workerDead) return null;
  if (!worker) {
    try {
      worker = new Worker(new URL("./clip.worker.ts", import.meta.url), {
        type: "module",
      });
      worker.addEventListener("message", (e: MessageEvent<ClipReply>) => {
        const resolve = pending.get(e.data.id);
        if (!resolve) return;
        pending.delete(e.data.id);
        resolve(e.data.geometry);
      });
      worker.addEventListener("error", failWorker);
      worker.addEventListener("messageerror", failWorker);
    } catch {
      workerDead = true;
      worker = null;
    }
  }
  return worker;
}

/**
 * Kick off (once) the background download of both mask tiers so they're warm
 * before the user selects a place. Called on search-field focus; idempotent.
 */
export function prefetchLandMask(): void {
  const w = getWorker();
  if (w) w.postMessage({ type: "prefetch" });
  else prefetchTiers();
}

/** 20 s guard so a wedged worker can't pin the UI in "Loading boundary…" —
 *  on expiry we fail over to the main thread rather than hang. */
const WORKER_TIMEOUT_MS = 20_000;

function clipInWorker(w: Worker, geometry: Area): Promise<Area | null> {
  return new Promise<Area | null>((resolve) => {
    const id = nextId++;
    const timer = setTimeout(() => {
      if (!pending.has(id)) return;
      pending.delete(id);
      failWorker();
      resolve(null);
    }, WORKER_TIMEOUT_MS);
    pending.set(id, (g) => {
      clearTimeout(timer);
      resolve(g);
    });
    w.postMessage({ type: "clip", id, geometry });
  });
}

/**
 * Clip a selected OSM boundary to land, entirely in the browser — no server
 * round-trip, so selection is instant once the masks are warm. City-scale
 * places clip against the full-detail binary mask; country-scale against the
 * coarse one (see masktiers.ts).
 */
export async function clipSelectedGeometry(geometry: Area): Promise<Area> {
  const w = getWorker();
  if (w) {
    const clipped = await clipInWorker(w, geometry);
    if (clipped) return clipped;
  }
  return clipWithTiers(geometry);
}
