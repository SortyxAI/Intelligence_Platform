"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, CircleMarker, Polyline, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "@/lib/leaflet-setup";

type Bin = {
  id: string;
  device_id: string;
  latitude: number | null;
  longitude: number | null;
  status: string;
  latest_fill_level: number | null;
  location_name: string | null;
};

const defaultCenter: [number, number] = [27.4728, 89.6390];

function MapInvalidateSize() {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 200);
    return () => clearTimeout(t);
  }, [map]);
  return null;
}

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    map.fitBounds(points, { padding: [50, 50], maxZoom: 15 });
  }, [map, points]);
  return null;
}

function FillColor(b: Bin) {
  if (b.status === "offline" || b.status === "unregistered") return "#ef4444";
  if ((b.latest_fill_level ?? 0) >= 85) return "#f59e0b";
  if (b.status === "maintenance") return "#8b5cf6";
  return "#22c55e";
}

export default function RouteOptimizationMap({
  bins,
  routeGeometry,
  orderedStops,
}: {
  bins: Bin[];
  routeGeometry: [number, number][];
  orderedStops: Bin[];
}) {
  const allPoints = orderedStops.length > 0
    ? orderedStops
    : bins;

  const points: [number, number][] = allPoints
    .filter((b) => b.latitude != null && b.longitude != null)
    .map((b) => [b.latitude!, b.longitude!]);

  const center: [number, number] = points.length > 0 ? points[0] : defaultCenter;

  return (
    <div className="relative z-0 h-[500px] w-full">
      <MapContainer center={center} zoom={13} className="h-full w-full" scrollWheelZoom zoomControl={false}>
        <MapInvalidateSize />
        <FitBounds points={routeGeometry.length > 0 ? routeGeometry : points} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {routeGeometry.length > 1 && (
          <Polyline
            positions={routeGeometry}
            pathOptions={{ color: "#7c3aed", weight: 4, opacity: 0.85 }}
          />
        )}
        {orderedStops.length > 0
          ? orderedStops.map((b, i) => {
              if (b.latitude == null || b.longitude == null) return null;
              return (
                <CircleMarker
                  key={b.id}
                  center={[b.latitude, b.longitude]}
                  radius={i === 0 || i === orderedStops.length - 1 ? 10 : 8}
                  pathOptions={{
                    color: i === 0 ? "#22c55e" : i === orderedStops.length - 1 ? "#ef4444" : FillColor(b),
                    fillColor: i === 0 ? "#22c55e" : i === orderedStops.length - 1 ? "#ef4444" : FillColor(b),
                    fillOpacity: 0.9,
                    weight: 3,
                  }}
                >
                  <Popup>
                    <div className="text-xs space-y-1 font-sans min-w-[160px]">
                      <p className="font-semibold text-sm flex items-center gap-1">
                        {i === 0 ? <span className="text-green-600">Start</span> : i === orderedStops.length - 1 ? <span className="text-red-600">End</span> : <span>Stop {i + 1}</span>}
                      </p>
                      <p className="font-medium">{b.device_id}</p>
                      {b.location_name && <p className="text-muted-foreground">{b.location_name}</p>}
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">Fill:</span>
                        <span className="font-medium">{b.latest_fill_level ?? 0}%</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">Status:</span>
                        <span className="capitalize">{b.status}</span>
                      </div>
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })
          : bins.map((b) => {
              if (b.latitude == null || b.longitude == null) return null;
              return (
                <CircleMarker
                  key={b.id}
                  center={[b.latitude, b.longitude]}
                  radius={6}
                  pathOptions={{
                    color: FillColor(b),
                    fillColor: FillColor(b),
                    fillOpacity: 0.7,
                    weight: 2,
                  }}
                >
                  <Popup>
                    <div className="text-xs space-y-1 font-sans min-w-[140px]">
                      <p className="font-semibold text-sm">{b.device_id}</p>
                      {b.location_name && <p className="text-muted-foreground">{b.location_name}</p>}
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">Fill:</span>
                        <span className="font-medium">{b.latest_fill_level ?? 0}%</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">Status:</span>
                        <span className="capitalize">{b.status}</span>
                      </div>
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}
      </MapContainer>
    </div>
  );
}
