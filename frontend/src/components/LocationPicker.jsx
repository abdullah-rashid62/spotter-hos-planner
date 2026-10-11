import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import L from "leaflet";
import { X } from "lucide-react";

export default function LocationPicker({ initial, title, onConfirm, onClose }) {
  const dialog = useRef(null);
  const canvas = useRef(null);
  const [point, setPoint] = useState(initial);
  const [tileError, setTileError] = useState(false);
  useEffect(() => {
    dialog.current.showModal();
    const map = L.map(canvas.current, {
      scrollWheelZoom: false,
      worldCopyJump: true,
    }).setView(
      initial ? [initial.latitude, initial.longitude] : [39, -98],
      initial ? 16 : 4,
    );
    const tiles = L.tileLayer(
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      },
    ).addTo(map);
    const deadline = setTimeout(() => setTileError(true), 10000);
    tiles.on("tileerror", () => setTileError(true));
    tiles.on("tileload", () => {
      clearTimeout(deadline);
      setTileError(false);
    });
    // The fixed center target works with touch dragging and keyboard panning.
    map.on("moveend", () => {
      const center = map.getCenter().wrap();
      const latitude = Math.max(-90, Math.min(90, center.lat));
      const longitude = center.lng;
      const unchanged =
        initial &&
        Math.abs(latitude - initial.latitude) < 0.000001 &&
        Math.abs(longitude - initial.longitude) < 0.000001;
      setPoint(
        unchanged
          ? initial
          : {
              label: `Map point: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
              latitude,
              longitude,
            },
      );
    });
    map.on("click", (event) => map.panTo(event.latlng, { animate: false }));
    const observer = new ResizeObserver(() =>
      map.invalidateSize({ pan: false }),
    );
    observer.observe(canvas.current);
    return () => {
      clearTimeout(deadline);
      observer.disconnect();
      map.remove();
    };
  }, [initial]);

  return createPortal(
    <dialog
      className="location-dialog"
      ref={dialog}
      aria-labelledby="location-picker-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="location-dialog-heading">
        <h2 id="location-picker-title">{title}</h2>
        <button
          type="button"
          className="map-control"
          aria-label="Close location map"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      <p>
        Verify the address and truck entrance. Click the map or move it beneath
        the target. Keyboard: focus the map, use arrow keys to pan and + / - to
        zoom.
      </p>
      <div className="location-picker-map">
        <div
          ref={canvas}
          className="location-picker-canvas"
          aria-label="Location picker map"
        />
        <span className="location-target" aria-hidden="true">
          +
        </span>
      </div>
      {tileError && (
        <p role="status" className="field-error">
          Map tiles unavailable. Close this map and enter coordinates if you
          cannot verify the point.
        </p>
      )}
      <div className="location-confirmation" aria-live="polite">
        {point ? (
          <>
            <strong>{point.label}</strong>
            <span>
              {point.latitude.toFixed(6)}, {point.longitude.toFixed(6)}
            </span>
          </>
        ) : (
          <span>
            Move the map to choose a location. No point is selected yet.
          </span>
        )}
      </div>
      <div className="location-dialog-actions">
        <button type="button" className="button secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="button primary"
          disabled={!point}
          onClick={() => onConfirm(point)}
        >
          Use this location
        </button>
      </div>
    </dialog>,
    document.body,
  );
}
