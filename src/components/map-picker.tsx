"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Marker } from "leaflet";
import "leaflet/dist/leaflet.css";

export type Pin = { lat: number; lng: number };

/**
 * Free pin-drop map on OpenStreetMap tiles — no API key, no billing, no
 * per-request cost, which is why this is here rather than Google Maps.
 *
 * Leaflet touches `window` at import time, so it's imported dynamically inside
 * an effect rather than at module scope, which would break the server render.
 */
export function MapPicker({
  value,
  onChange,
  shop,
  height = 260,
}: {
  value: Pin | null;
  onChange: (pin: Pin) => void;
  shop: Pin;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const onChangeRef = useRef(onChange);
  const [locating, setLocating] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;

      const start = value ?? shop;
      const map = L.map(containerRef.current, {
        center: [start.lat, start.lng],
        zoom: value ? 16 : 14,
        scrollWheelZoom: false,
      });
      mapRef.current = map;

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap contributors",
      }).addTo(map);

      // Leaflet's default marker icons are referenced by a relative URL that
      // doesn't survive bundling, so the pins are plain styled divs instead.
      const pinIcon = L.divIcon({
        className: "",
        html: `<span style="display:block;width:22px;height:22px;border-radius:9999px;background:#b91313;border:3px solid #fffaf2;box-shadow:0 2px 8px rgba(0,0,0,.4)"></span>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
      const shopIcon = L.divIcon({
        className: "",
        html: `<span style="display:block;width:18px;height:18px;border-radius:9999px;background:#ffcf00;border:3px solid #120a08;box-shadow:0 2px 8px rgba(0,0,0,.4)"></span>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });

      L.marker([shop.lat, shop.lng], { icon: shopIcon, interactive: false })
        .addTo(map)
        .bindTooltip("Pepper Pan", { permanent: false });

      const marker = L.marker([start.lat, start.lng], {
        icon: pinIcon,
        draggable: true,
      }).addTo(map);
      markerRef.current = marker;

      marker.on("dragend", () => {
        const p = marker.getLatLng();
        onChangeRef.current({ lat: p.lat, lng: p.lng });
      });

      map.on("click", (e: { latlng: { lat: number; lng: number } }) => {
        marker.setLatLng(e.latlng);
        onChangeRef.current({ lat: e.latlng.lat, lng: e.latlng.lng });
      });

      // The container is often still being laid out on first paint, which
      // leaves Leaflet with a 0-height canvas and grey tiles.
      setTimeout(() => map.invalidateSize(), 200);
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // Built once; `value` changes are pushed to the marker in the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the marker in step when the pin is set from outside (saved address,
  // or the "use my location" button).
  useEffect(() => {
    if (!value || !markerRef.current || !mapRef.current) return;
    const cur = markerRef.current.getLatLng();
    if (Math.abs(cur.lat - value.lat) < 1e-7 && Math.abs(cur.lng - value.lng) < 1e-7) return;
    markerRef.current.setLatLng([value.lat, value.lng]);
    mapRef.current.setView([value.lat, value.lng], 16);
  }, [value]);

  function useMyLocation() {
    if (!navigator.geolocation) {
      setNote("Your browser can't share a location — drop the pin by hand instead.");
      return;
    }
    setLocating(true);
    setNote(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        onChangeRef.current({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        setLocating(false);
        setNote("Couldn't get your location. Drag the red pin to your house instead.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={containerRef}
        style={{ height }}
        className="w-full overflow-hidden rounded-2xl ring-2 ring-ink-950/15"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={useMyLocation}
          disabled={locating}
          className="rounded-full bg-ink-950 px-4 py-2 text-xs font-bold text-cream-50 transition-colors hover:bg-brand-600 disabled:opacity-60"
        >
          {locating ? "Finding you…" : "📍 Use my location"}
        </button>
        <span className="text-xs text-ink-800/55">
          Tap the map or drag the red pin to your exact spot.
        </span>
      </div>
      {note && <p className="text-xs font-semibold text-brand-700">{note}</p>}
    </div>
  );
}
