"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Map, {
  AttributionControl,
  Layer,
  Source,
  type MapLayerMouseEvent,
  type MapLayerTouchEvent,
  type MapRef,
} from "react-map-gl/maplibre";
import type { GeoJSONSource } from "maplibre-gl";
import type { Feature } from "geojson";
import { ACCENTS, FIT_PADDING, INITIAL_VIEW } from "@/lib/map";
import MapControls from "@/components/MapControls";
import { clampBounds, placeOverlay, type Bounds } from "@/lib/geo";
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
  /** User-controlled; defaults to mercator (exact true-size math). */
  projection: "globe" | "mercator";
  onToggleProjection: () => void;
  /** Increments on reset → zoom back out + resume the cold-globe spin. */
  resetKey: number;
}

const REFERENCE_SOURCE = "reference";
const REFERENCE_FILL = "reference-fill";
/** Very subtle lift while held. */
const GRAB_SCALE = 1.02;

/** Zoom that sizes the globe to ~fill the smaller viewport dimension, with a
 *  little margin — works across portrait/landscape and varying heights. */
function globeFitZoom() {
  const min = Math.min(window.innerWidth, window.innerHeight);
  return Math.max(1.3, Math.log2(min / 185));
}

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
}: SpanMapProps) {
  const mapRef = useRef<MapRef>(null);
  const dragging = useRef(false);
  // The cold globe drifts until the first user action, then stops for good.
  const userActed = useRef(false);
  const spinRaf = useRef<number | null>(null);
  const latestTarget = useRef<[number, number] | null>(null);
  // Offset (in lng/lat) between X's centroid and the grab point, so the shape
  // moves *with* the cursor instead of snapping its center under it.
  const grabOffset = useRef<[number, number]>([0, 0]);
  const onDragRef = useRef(onDrag);
  const referencePlaceRef = useRef(referencePlace);
  const placementRef = useRef(placement);
  const mercatorRef = useRef(projection === "mercator");
  useEffect(() => {
    onDragRef.current = onDrag;
    referencePlaceRef.current = referencePlace;
    placementRef.current = placement;
    mercatorRef.current = projection === "mercator";
  });

  const [loaded, setLoaded] = useState(false);

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
      const lifted = placeOverlay(place, cur, mercatorRef.current, GRAB_SCALE);
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
      const target: [number, number] = [
        lngLat[0] + grabOffset.current[0],
        lngLat[1] + grabOffset.current[1],
      ];
      latestTarget.current = target;
      const displayed = placeOverlay(
        place,
        target,
        mercatorRef.current,
        GRAB_SCALE,
      );
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
    map.fitBounds(
      [
        [b[0], b[1]],
        [b[2], b[3]],
      ],
      { padding: FIT_PADDING, duration: 900, maxZoom: 12 },
    );
    // fitBounds value intentionally excluded: re-fit on selection, not on drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, loaded]);

  // Globe ↔ mercator (user toggle). On switching to globe with nothing chosen,
  // size the sphere to roughly fill the viewport height.
  useEffect(() => {
    if (!loaded) return;
    const map = mapRef.current?.getMap();
    if (!map) return;
    try {
      map.setProjection({ type: projection });
    } catch {
      /* older engines: stay mercator */
    }
    if (projection === "globe" && !fitBounds) {
      map.easeTo({ center: [10, 24], zoom: globeFitZoom(), duration: 500 });
    }
    // fitBounds read once on projection change, not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projection, loaded]);

  // Keep the cold globe sized to the viewport across resizes.
  useEffect(() => {
    if (!loaded) return;
    const onResize = () => {
      const map = mapRef.current?.getMap();
      if (!map || projection !== "globe" || fitBounds) return;
      map.easeTo({ center: [10, 24], zoom: globeFitZoom(), duration: 0 });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [loaded, projection, fitBounds]);

  // Reset: clear the manual-pan flag and zoom back out so the spin resumes
  // (declared before the spin effect so userActed is false when it re-runs).
  useEffect(() => {
    if (!resetKey || !loaded) return;
    userActed.current = false;
    const map = mapRef.current?.getMap();
    if (!map) return;
    try {
      map.setProjection({ type: "globe" });
    } catch {
      /* ignore */
    }
    map.easeTo({ center: [10, 24], zoom: globeFitZoom(), duration: 500 });
  }, [resetKey, loaded]);

  // Mild idle rotation of the cold globe. Stops when a value is set (fitBounds
  // becomes non-null) or when the user grabs the globe to pan it — but NOT on
  // zoom, fullscreen, or typing.
  useEffect(() => {
    if (!loaded || projection !== "globe" || fitBounds || userActed.current) {
      return;
    }
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let last = 0;
    const tick = (now: number) => {
      if (userActed.current) return;
      if (!last) last = now;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const map = mapRef.current?.getMap();
      // Pause the drift whenever the camera is already moving — a user zoom
      // (wheel/pinch/buttons) or any programmatic ease. setCenter is a jumpTo,
      // which calls stop() and would cancel that animation every frame, making
      // zoom-in impossible. Resume once the camera settles.
      if (map && !map.isMoving()) {
        const c = map.getCenter();
        const lon = ((c.lng + 3.5 * dt + 540) % 360) - 180;
        map.setCenter([lon, c.lat]);
      }
      spinRaf.current = requestAnimationFrame(tick);
    };
    // start after the fit settles so we don't fight its camera ease
    const startId = window.setTimeout(() => {
      spinRaf.current = requestAnimationFrame(tick);
    }, 650);
    return () => {
      clearTimeout(startId);
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
    hideContinentLabels(map);
    // A basemap swap (Onto menu) calls setStyle() under the hood, which resets
    // the map to the new style's own default projection (mercator) — restore
    // whatever the user had chosen so switching styles doesn't flip the globe
    // back to flat.
    map.on("style.load", () => {
      hideContinentLabels(map);
      try {
        map.setProjection({ type: mercatorRef.current ? "mercator" : "globe" });
      } catch {
        /* older engines: stay mercator */
      }
    });
    // Grabbing the globe to pan stops the idle spin for good (zoom fires
    // 'zoomstart' instead, so wheel/buttons/pinch leave the spin running).
    map.on("dragstart", () => {
      userActed.current = true;
      if (spinRaf.current) cancelAnimationFrame(spinRaf.current);
    });
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
      initialViewState={INITIAL_VIEW}
      attributionControl={false}
      interactiveLayerIds={referenceFeature ? [REFERENCE_FILL] : []}
      onLoad={onMapLoad}
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
      <AttributionControl
        position="bottom-left"
        compact
        customAttribution="Metro areas: GHS-FUA, European Commission JRC (R2019A)"
      />
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
    <MapControls
      mapRef={mapRef}
      projection={projection}
      onToggleProjection={onToggleProjection}
    />
    </>
  );
}
