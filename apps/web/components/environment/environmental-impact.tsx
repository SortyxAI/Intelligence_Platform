"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Leaf, Recycle, IndianRupee, Table2, History } from "lucide-react";
import { format } from "date-fns";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Totals = {
  totalWeightKg: number;
  totalCo2eAvoidedKg: number;
  totalEstimatedValueInr: number;
  count: number;
};

type MaterialRow = {
  material: string;
  category: string;
  weightKg: number;
  co2eAvoidedKg: number;
  estimatedValueInr: number;
  count: number;
  isProxy: boolean;
  hasCo2eFactor: boolean;
  hasRate: boolean;
};

type CategoryRow = {
  category: string;
  weightKg: number;
  co2eAvoidedKg: number;
  estimatedValueInr: number;
  count: number;
  isProxy: boolean;
};

type HistoryRow = {
  id: string;
  material: string;
  category: string;
  weightKg: number;
  co2eAvoidedKg: number | null;
  estimatedValueInr: number | null;
  isProxy: boolean;
  recordedAt: string;
  hasCo2eFactor: boolean;
  hasRate: boolean;
};

type ImpactData = {
  totals: Totals;
  materialBreakdown: MaterialRow[];
  categoryBreakdown: CategoryRow[];
  history: HistoryRow[];
};

const CATEGORY_COLORS: Record<string, string> = {
  Plastic: "#3b82f6",
  Paper: "#eab308",
  Metal: "#f97316",
  Glass: "#10b981",
  Organic: "#84cc16",
  "E-waste": "#a855f7",
  Textile: "#ec4899",
  Wood: "#92400e",
};

function fmtKg(n: number): string {
  return `${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })} kg`;
}
function fmtCo2e(n: number): string {
  return `${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })} kg CO₂e`;
}
function fmtInr(n: number): string {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function EnvironmentalImpact() {
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ImpactData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ period });
      if (startDate) params.set("start_date", startDate);
      if (endDate) params.set("end_date", endDate);
      const res = await fetch(`/api/environmental-impact?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load environmental impact data");
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [period, startDate, endDate]);

  useEffect(() => {
    load();
  }, [load]);

  function defaultStart(p: string) {
    const end = new Date();
    if (p === "daily") return format(new Date(end.getTime() - 86400000), "yyyy-MM-dd");
    if (p === "monthly") return format(new Date(end.getFullYear(), end.getMonth() - 1, end.getDate()), "yyyy-MM-dd");
    return format(new Date(end.getTime() - 7 * 86400000), "yyyy-MM-dd");
  }

  return (
    <div className="space-y-6">
      <Card variant="glass">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Leaf className="h-4 w-4 text-emerald-500" /> Environmental Impact
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label className="text-xs">Quick Period</Label>
              <Select
                value={period}
                onValueChange={(v) => {
                  setPeriod(v as typeof period);
                  setStartDate("");
                  setEndDate("");
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Start Date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setPeriod("daily");
                }}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">End Date</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setPeriod("daily");
                }}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={load} disabled={loading} className="w-full">
                {loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Table2 className="mr-1.5 h-4 w-4" />}
                Update
              </Button>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          {data && (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <SummaryStat
                  icon={Recycle}
                  title="Total Waste"
                  value={fmtKg(data.totals.totalWeightKg)}
                  tone="text-foreground"
                />
                <SummaryStat
                  icon={Leaf}
                  title="CO₂e Avoided"
                  value={fmtCo2e(data.totals.totalCo2eAvoidedKg)}
                  tone="text-emerald-600 dark:text-emerald-400"
                />
                <SummaryStat
                  icon={IndianRupee}
                  title="Estimated Material Value"
                  value={fmtInr(data.totals.totalEstimatedValueInr)}
                  tone="text-primary"
                />
              </div>

              {/* Material breakdown */}
              <div>
                <h3 className="mb-2 text-sm font-medium">Material Breakdown</h3>
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left">Material</th>
                        <th className="px-3 py-2 text-right">Weight</th>
                        <th className="px-3 py-2 text-right">CO₂e Avoided</th>
                        <th className="px-3 py-2 text-right">Est. Value</th>
                        <th className="px-3 py-2 text-center">Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.materialBreakdown.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">
                            No waste records in this period.
                          </td>
                        </tr>
                      )}
                      {data.materialBreakdown.map((m) => (
                        <tr key={m.material} className="border-t">
                          <td className="px-3 py-2">{m.material}</td>
                          <td className="px-3 py-2 text-right">{fmtKg(m.weightKg)}</td>
                          <td className="px-3 py-2 text-right">
                            {m.hasCo2eFactor ? fmtCo2e(m.co2eAvoidedKg) : "CO₂e factor unavailable"}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {m.hasRate ? fmtInr(m.estimatedValueInr) : "Material value unavailable"}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {m.isProxy ? (
                              <Badge variant="secondary" title="This value uses a configured proxy factor and is an estimate.">
                                Proxy
                              </Badge>
                            ) : (
                              <Badge variant="outline">Verified</Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Category breakdown */}
              <div>
                <h3 className="mb-2 text-sm font-medium">Category Breakdown</h3>
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left">Category</th>
                        <th className="px-3 py-2 text-right">Weight</th>
                        <th className="px-3 py-2 text-right">CO₂e Avoided</th>
                        <th className="px-3 py-2 text-right">Est. Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.categoryBreakdown.map((c) => (
                        <tr key={c.category} className="border-t">
                          <td className="px-3 py-2">{c.category}</td>
                          <td className="px-3 py-2 text-right">{fmtKg(c.weightKg)}</td>
                          <td className="px-3 py-2 text-right">{fmtCo2e(c.co2eAvoidedKg)}</td>
                          <td className="px-3 py-2 text-right">{fmtInr(c.estimatedValueInr)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {data.categoryBreakdown.length > 0 && (
                  <div className="mt-4 h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.categoryBreakdown}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="category" fontSize={11} />
                        <YAxis fontSize={11} />
                        <RTooltip
                          formatter={(v: number) => [`${v} kg CO₂e`, "CO₂e Avoided"]}
                          contentStyle={{ fontSize: 12 }}
                        />
                        <Bar dataKey="co2eAvoidedKg" radius={[4, 4, 0, 0]}>
                          {data.categoryBreakdown.map((c) => (
                            <Cell key={c.category} fill={CATEGORY_COLORS[c.category] ?? "#64748b"} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* History */}
              <div>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <History className="h-3.5 w-3.5" /> Recent Waste Events
                </h3>
                <div className="space-y-2">
                  {data.history.length === 0 && (
                    <p className="text-sm text-muted-foreground">No waste events in this period.</p>
                  )}
                  {data.history.map((h) => (
                    <div
                      key={h.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{h.material}</span>
                        {h.isProxy && (
                          <Badge variant="secondary" title="This value uses a configured proxy factor and is an estimate.">
                            Proxy
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">{fmtKg(h.weightKg)}</span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>
                          CO₂e Avoided:
                          <span className="ml-1 font-medium text-foreground">
                            {h.hasCo2eFactor ? fmtCo2e(h.co2eAvoidedKg!) : "unavailable"}
                          </span>
                        </span>
                        <span>
                          Est. Value:
                          <span className="ml-1 font-medium text-foreground">
                            {h.hasRate ? fmtInr(h.estimatedValueInr!) : "unavailable"}
                          </span>
                        </span>
                        <span>{format(new Date(h.recordedAt), "MMM d, HH:mm")}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryStat({
  icon: Icon,
  title,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  value: string;
  tone: string;
}) {
  return (
    <Card variant="glass" className="relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
      <div className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">{title}</span>
          <Icon className="h-4 w-4 text-muted-foreground/30" />
        </div>
        <div className={`mt-2 text-2xl font-semibold tracking-tight ${tone}`}>{value}</div>
      </div>
    </Card>
  );
}
