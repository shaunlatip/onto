"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Map, {
  Layer,
  Source,
  type MapLayerMouseEvent,
  type MapLayerTouchEvent,
  type MapRef,
} from "react-map-gl/maplibre";
import type { GeoJSONSource } from "maplibre-gl";
import type { Feature } from "geojson";
import {
  ACCENTS,
  FIT_PADDING,
  FIT_MAX_ZOOM,
  HOME_CENTER,
  HOME_ZOOM_TOLERANCE,
  homeZoom,
} from "@/lib/map";
import BottomBar from "@/components/BottomBar";
import MapControls from "@/components/MapControls";
import {
  clampBounds,
  clampPlacement,
  placeOverlay,
  type Bounds,
  type Readout,
} from "@/lib/geo";
import { prefetchTilesForBounds } from "@/lib/tilePrefetch";
import type { SpanColor } from "@/lib/colors";
import type { Place } from "@/lib/types";

interface SpanMapProps {
  /** Active basemap style.json URL — swapped live from the Onto menu. */
  mapStyleUrl: string;
  /** Y — the new place, drawn static at its real location. */
  targetFeature: Feature | null;
  targetColor: SpanColor;
  /** X — the familiar place, displayed overlay at true size. */
  referenceFeature: Feature | null;
  referenceColor: SpanColor;
  /** Needed to recompute the overlay imperatively during drag. */
  referencePlace: Place | null;
  /** Current centroid of X — used so a grab doesn't snap the shape to the cursor. */
  placement: [number, number] | null;
  /** Commit a new placement (centroid lng/lat) on drag release. */
  onDrag: (target: [number, number]) => void;
  /** Bounds to frame; only re-applied when `fitKey` changes (not during drag). */
  fitBounds: Bounds | null;
  fitKey: string;
  /** User-controlled. The overlay geometry is the same in both. */
  projection: "globe" | "mercator";
  onToggleProjection: () => void;
  /** Increments on reset → zoom back out + resume the cold-globe drift. */
  resetKey: number;
  /** Clears any selection and returns home; lives in the bottom-bar kebab. */
  onReset: () => void;
  /** Offer reset when there's a selection or the view has left home. */
  canReset: boolean;
  /** "Reset" (clears places) vs "Reset view" (camera only). */
  resetLabel: string;
  /** Fires when the camera leaves / returns to the home view (panned, or
   *  zoomed past HOME_ZOOM_TOLERANCE). */
  onViewMovedChange: (moved: boolean) => void;
  /** Comparison numbers; rendered fused with the kebab in the bottom bar. */
  readout: Readout | null;
}

const REFERENCE_SOURCE = "reference";
const REFERENCE_FILL = "reference-fill";
/** Very subtle lift while held. */
const GRAB_SCALE = 1.02;
/** Idle drift of the cold globe, in degrees of longitude per second. */
const DRIFT_DEG_PER_S = 3.5;
/** Seconds for the drift to ease from rest up to full speed. */
const DRIFT_RAMP_S = 1.2;
/** After a wheel/trackpad event, hold the drift this long (ms). */
const WHEEL_QUIET_MS = 300;

export default function SpanMap({
  mapStyleUrl,
  targetFeature,
  targetColor,
  referenceFeature,
  referenceColor,
  referencePlace,
  placement,
  onDrag,
  fitBounds,
  fitKey,
  projection,
  onToggleProjection,
  resetKey,
  onReset,
  canReset,
  resetLabel,
  onViewMovedChange,
  readout,
}: SpanMapProps) {
  const mapRef = useRef<MapRef>(null);
  const dragging = useRef(false);
  const spinRaf = useRef<number | null>(null);
  // Cold-globe drift state. `panned` latches on the first pan and clears only
  // when the camera is sent home (reset, or switching back to the globe).
  const panned = useRef(false);
  // Pointers currently pressed on the map. While any is down the drift must
  // not move the camera: each drift step is a jumpTo, which calls stop() and
  // resets MapLibre's gesture handlers — dropping a grab that hasn't yet
  // passed the click tolerance, so the globe can't be picked up.
  const pointersDown = useRef(new Set<number>());
  // Wheel/trackpad zoom has a ~40ms type-detection window with the same
  // problem, so the drift also holds briefly after each wheel event.
  const quietUntil = useRef(0);
  const viewMoved = useRef(false);
  const onViewMovedChangeRef = useRef(onViewMovedChange);
  const latestTarget = useRef<[number, number] | null>(null);
  // Offset (in lng/lat) between X's centroid and the grab point, so the shape
  // moves *with* the cursor instead of snapping its center under it.
  const grabOffset = useRef<[number, number]>([0, 0]);
  const onDragRef = useRef(onDrag);
  const referencePlaceRef = useRef(referencePlace);
  const placementRef = useRef(placement);
  useEffect(() => {
    onDragRef.current = onDrag;
    referencePlaceRef.current = referencePlace;
    placementRef.current = placement;
    onViewMovedChangeRef.current = onViewMovedChange;
  });

  const [loaded, setLoaded] = useState(false);
  const [initialViewState] = useState(() => ({
    longitude: HOME_CENTER[0],
    latitude: HOME_CENTER[1],
    zoom: homeZoom(),
  }));

  const reportViewMoved = useCallback((moved: boolean) => {
    if (moved === viewMoved.current) return;
    viewMoved.current = moved;
    onViewMovedChangeRef.current(moved);
  }, []);

  /** Re-derive "has the view left home?" from the camera + pan latch. */
  const syncViewMoved = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    reportViewMoved(
      panned.current ||
        Math.abs(map.getZoom() - homeZoom()) > HOME_ZOOM_TOLERANCE,
    );
  }, [reportViewMoved]);

  /** Ease back to the home globe and re-arm the drift. The control hides at
   *  once rather than after the ease; a grab or zoom mid-ease re-shows it. */
  const goHome = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    panned.current = false;
    reportViewMoved(false);
    map.easeTo({ center: HOME_CENTER, zoom: homeZoom(), duration: 500 });
  }, [reportViewMoved]);

  const setCursor = (c: string) => {
    const canvas = mapRef.current?.getMap().getCanvas();
    if (canvas) canvas.style.cursor = c;
  };

  const beginDrag = useCallback(
    (
      e: MapLayerMouseEvent | MapLayerTouchEvent,
      lngLat: [number, number],
      hit: boolean,
    ) => {
      const place = referencePlaceRef.current;
      if (!place || !hit) return;
      dragging.current = true;
      const cur = placementRef.current ?? place.center;
      grabOffset.current = [cur[0] - lngLat[0], cur[1] - lngLat[1]];
      latestTarget.current = cur;
      const map = e.target;
      map.dragPan.disable();
      map.getCanvas().style.cursor = "grabbing";
      // press feedback: redraw in place, a hair larger
      const lifted = placeOverlay(place, cur, GRAB_SCALE);
      (
        map.getSource(REFERENCE_SOURCE) as GeoJSONSource | undefined
      )?.setData(lifted);
      if (map.getLayer(REFERENCE_FILL)) {
        map.setPaintProperty(REFERENCE_FILL, "fill-opacity", 0.44);
        map.setPaintProperty(
          "reference-line",
          "line-width",
          ACCENTS.reference.lineWidth + 0.75,
        );
      }
    },
    [],
  );

  const moveDrag = useCallback(
    (e: MapLayerMouseEvent | MapLayerTouchEvent, lngLat: [number, number]) => {
      const place = referencePlaceRef.current;
      if (!dragging.current || !place) return;
      // Commit the clamped spot, so a drag past the map edge doesn't leave the
      // next grab's offset measured from somewhere the shape never went.
      const target = clampPlacement(place, [
        lngLat[0] + grabOffset.current[0],
        lngLat[1] + grabOffset.current[1],
      ]);
      latestTarget.current = target;
      const displayed = placeOverlay(place, target, GRAB_SCALE);
      const src = e.target.getSource(REFERENCE_SOURCE) as
        | GeoJSONSource
        | undefined;
      src?.setData(displayed);
    },
    [],
  );

  // End drag from anywhere (release outside the canvas still counts).
  useEffect(() => {
    const end = () => {
      if (!dragging.current) return;
      dragging.current = false;
      const map = mapRef.current?.getMap();
      if (map) {
        map.dragPan.enable();
        map.getCanvas().style.cursor = "";
        if (map.getLayer(REFERENCE_FILL)) {
          map.setPaintProperty(
            REFERENCE_FILL,
            "fill-opacity",
            ACCENTS.reference.fillOpacity,
          );
          map.setPaintProperty(
            "reference-line",
            "line-width",
            ACCENTS.reference.lineWidth,
          );
        }
      }
      if (latestTarget.current) onDragRef.current(latestTarget.current);
    };
    window.addEventListener("mouseup", end);
    window.addEventListener("touchend", end);
    return () => {
      window.removeEventListener("mouseup", end);
      window.removeEventListener("touchend", end);
    };
  }, []);

  // Frame the union of Y and X — but only when the *selection* changes.
  useEffect(() => {
    if (!loaded || !fitBounds) return;
    const map = mapRef.current?.getMap();
    if (!map) return;
    const b = clampBounds(fitBounds);
    // Warm the destination's tiles up front so the basemap is already there when
    // the fly lands, instead of popping in a beat after the camera settles.
    prefetchTilesForBounds(map, b, FIT_PADDING, FIT_MAX_ZOOM);
    map.fitBounds(
      [
        [b[0], b[1]],
        [b[2], b[3]],
      ],
      { padding: FIT_PADDING, duration: 900, maxZoom: FIT_MAX_ZOOM },
    );
    // fitBounds value intentionally excluded: re-fit on selection, not on drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, loaded]);

  // Switching to the globe with nothing chosen sends the camera home. (The
  // projection itself is applied by the <Map projection> prop.)
  useEffect(() => {
    if (!loaded) return;
    if (projection === "globe" && !fitBounds) goHome();
    // fitBounds read once on projection change, not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projection, loaded]);

  // Keep the home view sized to the viewport across resizes, without touching
  // the longitude the drift has reached. A view the user moved is left alone.
  useEffect(() => {
    if (!loaded) return;
    const onResize = () => {
      const map = mapRef.current?.getMap();
      if (!map) return;
      if (!fitBounds && !viewMoved.current) map.jumpTo({ zoom: homeZoom() });
      syncViewMoved();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [loaded, fitBounds, syncViewMoved]);

  useEffect(() => {
    if (!resetKey || !loaded) return;
    goHome();
  }, [resetKey, loaded, goHome]);

  // Track presses and wheel input on the map so the drift can hold for them.
  useEffect(() => {
    if (!loaded) return;
    const map = mapRef.current?.getMap();
    if (!map) return;
    const el = map.getCanvasContainer();
    const held = pointersDown.current;
    const down = (e: PointerEvent) => held.add(e.pointerId);
    const up = (e: PointerEvent) => held.delete(e.pointerId);
    // A release outside the window may never arrive; don't stay paused.
    const clear = () => held.clear();
    const wheel = () => {
      quietUntil.current = performance.now() + WHEEL_QUIET_MS;
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("wheel", wheel, { passive: true });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("blur", clear);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("wheel", wheel);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("blur", clear);
      held.clear();
    };
  }, [loaded]);

  // Idle drift of the cold globe. Runs only at home with nothing chosen, and
  // holds (without being cancelled) while the pointer is down, the camera is
  // already moving (a user zoom or any ease — stepping it would cancel that
  // animation), or the view is zoomed in past home. A pan stops it until the
  // camera goes home again. Each resume eases back up to speed.
  useEffect(() => {
    if (!loaded || projection !== "globe" || fitBounds) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let last = 0;
    let ramp = 0;
    const tick = (now: number) => {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      const map = mapRef.current?.getMap();
      const free =
        !!map &&
        !panned.current &&
        pointersDown.current.size === 0 &&
        now >= quietUntil.current &&
        !map.isMoving() &&
        map.getZoom() <= homeZoom() + HOME_ZOOM_TOLERANCE;
      if (!free) {
        ramp = 0;
      } else {
        ramp = Math.min(1, ramp + dt / DRIFT_RAMP_S);
        const speed = ramp * ramp * (3 - 2 * ramp); // smoothstep
        if (speed > 0) {
          const c = map.getCenter();
          const lon =
            ((c.lng + DRIFT_DEG_PER_S * speed * dt + 540) % 360) - 180;
          map.setCenter([lon, c.lat]);
        }
      }
      spinRaf.current = requestAnimationFrame(tick);
    };
    spinRaf.current = requestAnimationFrame(tick);
    return () => {
      if (spinRaf.current) cancelAnimationFrame(spinRaf.current);
    };
  }, [loaded, projection, fitBounds]);

  // Hide continent labels — when zoomed out the highest-level label should be
  // countries, not continents. Re-run on every style swap (e.g. picking a
  // different basemap from the Onto menu), not just the initial load.
  const hideContinentLabels = (map: ReturnType<MapRef["getMap"]>) => {
    for (const layer of map.getStyle().layers ?? []) {
      if (/continent/i.test(layer.id)) {
        try {
          map.setLayoutProperty(layer.id, "visibility", "none");
        } catch {
          /* ignore */
        }
      }
    }
  };

  const onMapLoad = () => {
    setLoaded(true);
    const map = mapRef.current?.getMap();
    if (!map) return;
    // Test/debug seam: expose the map + a render-settled flag so automated
    // review (scripts/webgl-review.mjs) can wait for the map to finish
    // painting. Note the pre-selection globe spin re-renders continuously, so
    // the flag only latches once the camera is at rest — wait on it AFTER a
    // selection, not on the cold globe.
    const w = window as unknown as {
      __ontoMap?: typeof map;
      __ontoMapIdle?: boolean;
    };
    w.__ontoMap = map;
    map.on("render", () => {
      w.__ontoMapIdle = false;
    });
    map.on("idle", () => {
      w.__ontoMapIdle = true;
    });
    hideContinentLabels(map);
    // A basemap swap (Onto menu) calls setStyle() under the hood; the <Map
    // projection> prop re-applies the projection, labels need re-hiding.
    map.on("style.load", () => hideContinentLabels(map));
  };

  // Grabbing the globe (mouse, touch, or two-finger) counts as a pan.
  const onDragStart = () => {
    panned.current = true;
    reportViewMoved(true);
  };
  // Arrow-key pans don't fire dragstart; catch them from the keyboard ease.
  const onMoveStart = (e: { originalEvent?: unknown }) => {
    const ev = e.originalEvent;
    if (ev instanceof KeyboardEvent && ev.key.startsWith("Arrow")) {
      panned.current = true;
      reportViewMoved(true);
    }
  };

  const onMouseDown = (e: MapLayerMouseEvent) =>
    beginDrag(
      e,
      [e.lngLat.lng, e.lngLat.lat],
      !!e.features?.some((f) => f.layer.id === REFERENCE_FILL),
    );
  const onMouseMove = (e: MapLayerMouseEvent) =>
    moveDrag(e, [e.lngLat.lng, e.lngLat.lat]);
  const onTouchStart = (e: MapLayerTouchEvent) =>
    beginDrag(
      e,
      [e.lngLat.lng, e.lngLat.lat],
      !!e.features?.some((f) => f.layer.id === REFERENCE_FILL),
    );
  const onTouchMove = (e: MapLayerTouchEvent) =>
    moveDrag(e, [e.lngLat.lng, e.lngLat.lat]);

  const hoverReference = (on: boolean) => {
    if (dragging.current) return;
    const map = mapRef.current?.getMap();
    if (!map?.getLayer(REFERENCE_FILL)) return;
    map.setPaintProperty(
      REFERENCE_FILL,
      "fill-opacity",
      on ? 0.4 : ACCENTS.reference.fillOpacity,
    );
  };
  const onMouseEnter = () => {
    if (dragging.current) return;
    setCursor("grab");
    hoverReference(true);
  };
  const onMouseLeave = () => {
    if (dragging.current) return;
    setCursor("");
    hoverReference(false);
  };

  return (
    <>
    <Map
      ref={mapRef}
      mapStyle={mapStyleUrl}
      initialViewState={initialViewState}
      projection={projection}
      // Tiles render the instant they arrive rather than cross-fading in over
      // ~300ms — paired with the prefetch above, textures land with the camera.
      fadeDuration={0}
      // Hold more tiles so revisits / swaps between two places don't re-download.
      maxTileCacheSize={512}
      attributionControl={false}
      interactiveLayerIds={referenceFeature ? [REFERENCE_FILL] : []}
      onLoad={onMapLoad}
      onDragStart={onDragStart}
      onMoveStart={onMoveStart}
      onMoveEnd={syncViewMoved}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      dragRotate={false}
      pitchWithRotate={false}
      touchPitch={false}
      maxPitch={0}
      style={{ position: "absolute", inset: 0 }}
    >
      {/* Attribution lives at the bottom of the Onto menu instead of on the map
          — see AttributionLine in GlassControls / SettingsSheet. */}
      {targetFeature && (
        <Source id="target" type="geojson" data={targetFeature}>
          <Layer
            id="target-fill"
            type="fill"
            paint={{
              "fill-color": targetColor.fill,
              "fill-opacity": ACCENTS.target.fillOpacity,
            }}
          />
          <Layer
            id="target-line"
            type="line"
            layout={{ "line-join": "round", "line-cap": "round" }}
            paint={{
              "line-color": targetColor.line,
              "line-width": ACCENTS.target.lineWidth,
              "line-opacity": ACCENTS.target.lineOpacity,
            }}
          />
        </Source>
      )}

      {referenceFeature && (
        <Source id="reference" type="geojson" data={referenceFeature}>
          <Layer
            id={REFERENCE_FILL}
            type="fill"
            paint={{
              "fill-color": referenceColor.fill,
              "fill-opacity": ACCENTS.reference.fillOpacity,
              "fill-opacity-transition": { duration: 130, delay: 0 },
            }}
          />
          <Layer
            id="reference-line"
            type="line"
            layout={{ "line-join": "round", "line-cap": "round" }}
            paint={{
              "line-color": referenceColor.line,
              "line-width": ACCENTS.reference.lineWidth,
              "line-opacity": ACCENTS.reference.lineOpacity,
            }}
          />
        </Source>
      )}
    </Map>
    {/* Desktop map chrome (bottom-right, hidden on mobile). */}
    <MapControls
      mapRef={mapRef}
      projection={projection}
      onToggleProjection={onToggleProjection}
    />
    {/* Mobile: readout + all actions fused into one bottom-bar kebab. */}
    <BottomBar
      mapRef={mapRef}
      projection={projection}
      onToggleProjection={onToggleProjection}
      onReset={onReset}
      canReset={canReset}
      resetLabel={resetLabel}
      readout={readout}
      referenceColor={referenceColor}
      targetColor={targetColor}
    />
    </>
  );
}
