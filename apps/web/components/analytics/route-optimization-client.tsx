"use client";

import { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Route, Navigation, Download, Loader2, Trash2, MapPin, ArrowRight, Clock } from "lucide-react";

type Bin = {
  id: string;
  device_id: string;
  latitude: number | null;
  longitude: number | null;
  status: string;
  latest_fill_level: number | null;
  location_name: string | null;
};

type RouteData = {
  geometry: [number, number][];
  orderedBins: Bin[];
  distance: number;
  duration: number;
  legs: LegData[];
};

type LegData = {
  distance: number;
  duration: number;
  steps: StepData[];
};

type StepData = {
  instruction: string;
  name: string;
  distance: number;
  duration: number;
};

const RouteMap = dynamic(() => import("./route-optimization-map"), {
  ssr: false,
  loading: () => (
    <div className="h-[500px] w-full rounded-lg border bg-muted animate-pulse flex items-center justify-center text-muted-foreground">
      Loading map...
    </div>
  ),
});

function formatDistance(meters: number) {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m} min`;
}

function generateInstruction(step: { maneuver: { type: string; modifier?: string }; name: string; distance: number; duration: number }): string {
  const { maneuver, name } = step;
  const road = name || "unnamed road";

  switch (maneuver.type) {
    case "depart": return `Head ${maneuver.modifier ?? ""} on ${road}`;
    case "arrive": return `Arrive at ${road}`;
    case "turn": return `Turn ${maneuver.modifier ?? ""} onto ${road}`;
    case "straight": return `Continue straight on ${road}`;
    case "roundabout": return `Enter the roundabout and take the ${maneuver.modifier ?? ""} exit onto ${road}`;
    case "fork": return `Keep ${maneuver.modifier ?? ""} at the fork onto ${road}`;
    case "end of road": return `Turn ${maneuver.modifier ?? ""} at the end of the road onto ${road}`;
    case "merge": return `Merge ${maneuver.modifier ?? ""} onto ${road}`;
    case "ramp": return `Take the ramp ${maneuver.modifier ?? ""} onto ${road}`;
    case "rotary": return `Enter the rotary and take the ${maneuver.modifier ?? ""} exit onto ${road}`;
    default: return `Continue onto ${road}`;
  }
}

export function RouteOptimizationClient({ bins }: { bins: Bin[] }) {
  const validBins = useMemo(() => bins.filter((b) => b.latitude != null && b.longitude != null), [bins]);
  const [routeData, setRouteData] = useState<RouteData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedLeg, setExpandedLeg] = useState<number | null>(null);

  async function handleOptimize() {
    if (validBins.length < 2) return;
    setLoading(true);
    setError(null);
    setRouteData(null);

    try {
      const coords = validBins
        .map((b) => `${b.longitude},${b.latitude}`)
        .join(";");

      const res = await fetch(
        `https://router.project-osrm.org/trip/v1/driving/${coords}?geometries=geojson&overview=full&steps=true&source=first&destination=last&roundtrip=false`,
      );

      if (!res.ok) throw new Error(`Routing API error (${res.status})`);

      const data = await res.json();

      if (data.code !== "Ok") throw new Error(`OSRM error: ${data.code}`);

      const trip = data.trips[0];
      const waypointOrder = data.waypoints.map((w: { waypoint_index: number }) => w.waypoint_index);
      const orderedBins = waypointOrder.map((idx: number) => validBins[idx]);

      const legs: LegData[] = trip.legs.map((leg: { distance: number; duration: number; steps: Array<{ maneuver: { type: string; modifier?: string }; name: string; distance: number; duration: number }> }) => ({
        distance: leg.distance,
        duration: leg.duration,
        steps: leg.steps.map((s) => ({
          instruction: generateInstruction(s),
          name: s.name,
          distance: s.distance,
          duration: s.duration,
        })),
      }));

      setRouteData({
        geometry: trip.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]] as [number, number]),
        orderedBins,
        distance: trip.distance,
        duration: trip.duration,
        legs,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to optimize route");
    } finally {
      setLoading(false);
    }
  }

  function resetRoute() {
    setRouteData(null);
    setError(null);
    setExpandedLeg(null);
  }

  function exportRoute() {
    if (!routeData) return;
    const header = "Stop,Device ID,Location,Latitude,Longitude,Fill %,Status";
    const rows = routeData.orderedBins.map((b, i) =>
      `${i + 1},${b.device_id},${b.location_name ?? ""},${b.latitude},${b.longitude},${b.latest_fill_level ?? 0},${b.status}`
    ).join("\n");
    const csv = `${header}\n${rows}\n\nTotal Distance,${formatDistance(routeData.distance)}\nTotal Duration,${formatDuration(routeData.duration)}`;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `optimized-route-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <Card variant="glass">
          <CardContent className="p-0 overflow-hidden rounded-lg">
            <RouteMap
              bins={validBins}
              routeGeometry={routeData?.geometry ?? []}
              orderedStops={routeData?.orderedBins ?? []}
            />
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card variant="glass">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Route className="h-4 w-4" />
              Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button
              className="w-full"
              size="sm"
              onClick={handleOptimize}
              disabled={loading || validBins.length < 2}
            >
              {loading ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Navigation className="mr-1.5 h-4 w-4" />
              )}
              {loading ? "Routing..." : "Optimize Route"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={resetRoute}
              disabled={!routeData && !error}
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              Reset
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={exportRoute}
              disabled={!routeData}
            >
              <Download className="mr-1.5 h-4 w-4" />
              Export CSV
            </Button>
          </CardContent>
        </Card>

        {error && (
          <Card variant="glass" className="border-destructive/50">
            <CardContent className="p-3 text-xs text-destructive">
              {error}
            </CardContent>
          </Card>
        )}

        <Card variant="glass">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">
              Stops ({routeData ? routeData.orderedBins.length : validBins.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-[400px] overflow-y-auto space-y-1">
            {routeData === null && validBins.length < 2 && (
              <p className="text-xs text-muted-foreground">No bins with GPS coordinates</p>
            )}
            {routeData === null && validBins.length >= 2 && (
              <p className="text-xs text-muted-foreground">
                Click Optimize Route to calculate the optimal driving route
              </p>
            )}
            {(routeData?.orderedBins ?? validBins).map((b, i) => (
              <div
                key={b.id}
                className="flex items-center gap-2 rounded-md border p-2 text-xs"
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{b.device_id}</p>
                  <p className="text-muted-foreground truncate">
                    {b.location_name ?? `${b.latitude?.toFixed(4)}, ${b.longitude?.toFixed(4)}`}
                  </p>
                </div>
                <Badge variant={b.latest_fill_level != null && b.latest_fill_level >= 85 ? "destructive" : "default"} className="text-[10px]">
                  {b.latest_fill_level ?? 0}%
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        {routeData && (
          <>
            <Card variant="glass">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Route Summary</CardTitle>
              </CardHeader>
              <CardContent className="text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total stops</span>
                  <span className="font-medium">{routeData.orderedBins.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Distance</span>
                  <span className="font-medium">{formatDistance(routeData.distance)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Est. duration</span>
                  <span className="font-medium">{formatDuration(routeData.duration)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">High fill bins</span>
                  <span className="font-medium text-destructive">
                    {routeData.orderedBins.filter((b) => (b.latest_fill_level ?? 0) >= 85).length}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card variant="glass">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ArrowRight className="h-4 w-4" />
                  Directions ({routeData.legs.length} legs)
                </CardTitle>
              </CardHeader>
              <CardContent className="max-h-[500px] overflow-y-auto space-y-1">
                {routeData.legs.map((leg, legIdx) => (
                  <div key={legIdx} className="border rounded-md overflow-hidden">
                    <button
                      onClick={() => setExpandedLeg(expandedLeg === legIdx ? null : legIdx)}
                      className="w-full flex items-center gap-2 p-2 text-xs hover:bg-accent/50 transition-colors text-left"
                    >
                      <MapPin className="h-3 w-3 shrink-0 text-primary" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">
                          Stop {legIdx + 1} → Stop {legIdx + 2}
                        </p>
                        <p className="text-muted-foreground">
                          {formatDistance(leg.distance)} · {formatDuration(leg.duration)}
                        </p>
                      </div>
                      <Clock className="h-3 w-3 shrink-0 text-muted-foreground" />
                    </button>
                    {expandedLeg === legIdx && (
                      <div className="border-t divide-y">
                        {leg.steps.map((step, stepIdx) => (
                          <div key={stepIdx} className="flex items-start gap-2 p-1.5 text-[10px]">
                            <span className="text-muted-foreground mt-0.5 shrink-0">
                              {stepIdx + 1}.
                            </span>
                            <p className="flex-1 text-muted-foreground">{step.instruction}</p>
                            <span className="text-muted-foreground shrink-0">
                              {formatDistance(step.distance)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
