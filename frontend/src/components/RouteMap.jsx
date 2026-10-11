import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { Expand, Layers, MapPin, Navigation, X } from "lucide-react";

export default function RouteMap({ trip, selectedId, onSelect, visible }) {
  const container = useRef(null);
  const mapRef = useRef(null);
  const markers = useRef(new Map());
  const selectRef = useRef(onSelect);
  const [tileError, setTileError] = useState(false);
  const [expanded, setExpanded] = useState(false);
  selectRef.current = onSelect;

  useEffect(() => {
    const map = L.map(container.current, {
      zoomControl: false,
      scrollWheelZoom: false,
    }).setView([38, -86], 5);
    mapRef.current = map;
    L.control.zoom({ position: "topright" }).addTo(map);
    const tiles = L.tileLayer(
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18,
      },
    ).addTo(map);
    const tileDeadline = setTimeout(() => setTileError(true), 10000);
    tiles.on("tileerror", () => setTileError(true));
    tiles.on("tileload", () => {
      clearTimeout(tileDeadline);
      setTileError(false);
    });
    L.polyline(trip.geometry, {
      color: "#ffffff",
      weight: 8,
      opacity: 0.95,
    }).addTo(map);
    L.polyline(trip.geometry, {
      color: "#2457d6",
      weight: 4,
      opacity: 0.95,
    }).addTo(map);
    for (const point of trip.waypoints) {
      const icon = L.divIcon({
        className: "map-marker-shell",
        html: `<span class="map-marker marker-${point.kind}">${point.letter}</span>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });
      const marker = L.marker(point.position, {
        icon,
        title: point.label,
        alt: point.label,
      }).addTo(map);
      marker.bindTooltip(point.label, { direction: "right", offset: [16, 0] });
      marker.on("click", () => selectRef.current(point.eventId));
      markers.current.set(point.eventId, marker);
    }
    map.fitBounds(trip.geometry, { padding: [48, 48] });
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(container.current);
    return () => {
      clearTimeout(tileDeadline);
      observer.disconnect();
      markers.current.clear();
      map.remove();
      mapRef.current = null;
    };
  }, [trip]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !visible) return;
    map.invalidateSize();
    const selectedEvent = trip.events.find((event) => event.id === selectedId);
    for (const [id, marker] of markers.current)
      marker.getElement()?.classList.toggle("is-selected", id === selectedId);
    if (
      selectedEvent &&
      !map.getBounds().pad(-0.12).contains(selectedEvent.position)
    ) {
      map.panTo(selectedEvent.position, {
        animate: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      });
    }
  }, [selectedId, trip, visible, expanded]);

  useEffect(() => {
    if (!expanded) return;
    function escape(event) {
      if (event.key === "Escape") setExpanded(false);
    }
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [expanded]);

  const selected = trip.events.find((event) => event.id === selectedId);
  return (
    <section
      className={`map-panel ${expanded ? "map-expanded" : ""}`}
      aria-label="Route map"
    >
      <div className="map-canvas" ref={container} />
      <div className="map-label">
        <span className="small-dot blue" /> YOUR ROUTE{" "}
        <span className="map-label-divider" /> Chicago to Atlanta
      </div>
      <div className="map-actions">
        <button
          className="map-control"
          type="button"
          aria-label="Fit entire route"
          onClick={() =>
            mapRef.current?.fitBounds(trip.geometry, { padding: [48, 48] })
          }
        >
          <Navigation size={18} />
        </button>
        <button
          className="map-control"
          type="button"
          aria-label={expanded ? "Close expanded map" : "Expand map"}
          aria-pressed={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <X size={18} /> : <Expand size={18} />}
        </button>
      </div>
      {tileError && (
        <div className="map-offline" role="status">
          Map tiles unavailable. The sample route and markers remain
          interactive.
        </div>
      )}
      {selected && (
        <div className="map-selection">
          <MapPin size={17} />
          <div>
            <strong>{selected.title}</strong>
            <span>{selected.location}</span>
          </div>
          <button
            aria-label="Clear selected stop"
            onClick={() => onSelect(null)}
          >
            <X size={15} />
          </button>
        </div>
      )}
      <div className="map-caption">
        <Layers size={14} /> Illustrative route · sample stop locations
      </div>
    </section>
  );
}
