"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { FileText, Download, Loader2, Table2, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ReportRow = {
  device_id: string;
  location: string;
  status: string;
  avg_fill_percent: number;
  telemetry_points: number;
};

type SummaryData = {
  rows: ReportRow[];
  alert_count: number;
  start_date: string;
  end_date: string;
};

export default function ReportsPage() {
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [summary, setSummary] = useState<SummaryData | null>(null);

  function getDefaultEnd() {
    return format(new Date(), "yyyy-MM-dd");
  }

  function getDefaultStart(p: string) {
    const end = new Date();
    switch (p) {
      case "daily": return format(new Date(end.getTime() - 86400000), "yyyy-MM-dd");
      case "monthly": return format(new Date(end.getFullYear(), end.getMonth() - 1, end.getDate()), "yyyy-MM-dd");
      default: return format(new Date(end.getTime() - 7 * 86400000), "yyyy-MM-dd");
    }
  }

  function buildParams() {
    const sd = startDate || getDefaultStart(period);
    const ed = endDate || getDefaultEnd();
    return new URLSearchParams({ start_date: sd, end_date: ed });
  }

  async function loadSummary() {
    setLoading(true);
    try {
      const params = buildParams();
      const res = await fetch(`/api/reports/export?format=json&${params}`);
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setSummary(data);
    } catch {
      alert("Failed to load report data.");
    }
    setLoading(false);
  }

  async function exportReport(format: "csv" | "pdf") {
    setExporting(true);
    try {
      const params = buildParams();
      const res = await fetch(`/api/reports/export?format=${format}&${params}`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sortyx-report-${format === "csv" ? "csv" : "pdf"}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Export failed. Ensure you are logged in and Supabase is configured.");
    }
    setExporting(false);
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1>Reports</h1>
        <p className="mt-1 text-sm text-muted-foreground">View and export bin performance data</p>
      </div>

      <Card variant="glass">
        <CardHeader>
          <CardTitle>Date Range</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label className="text-xs">Quick Period</Label>
              <Select value={period} onValueChange={(v) => { setPeriod(v as typeof period); setStartDate(""); setEndDate(""); }}>
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
              <Input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPeriod("daily"); }} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">End Date</Label>
              <Input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPeriod("daily"); }} />
            </div>
            <div className="flex items-end gap-2">
              <Button onClick={loadSummary} disabled={loading}>
                {loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Table2 className="mr-1.5 h-4 w-4" />}
                Load Data
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {summary && (
          <Card variant="glass" className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Summary</CardTitle>
              <div className="flex gap-2">
                <Button size="sm" disabled={exporting} onClick={() => exportReport("csv")}>
                  {exporting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
                  CSV
                </Button>
                <Button size="sm" variant="outline" disabled={exporting} onClick={() => exportReport("pdf")}>
                  <Download className="mr-1.5 h-4 w-4" />
                  PDF
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-4">
                {summary.start_date} — {summary.end_date} · {summary.rows.length} bins · {summary.alert_count} alerts
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left py-2 px-1 font-medium">Device</th>
                      <th className="text-left py-2 px-1 font-medium">Location</th>
                      <th className="text-left py-2 px-1 font-medium">Status</th>
                      <th className="text-right py-2 px-1 font-medium">Avg Fill %</th>
                      <th className="text-right py-2 px-1 font-medium">Data Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.rows.map((r) => (
                      <tr key={r.device_id} className="border-b last:border-0 hover:bg-accent/30">
                        <td className="py-2 px-1 font-mono">{r.device_id}</td>
                        <td className="py-2 px-1">{r.location}</td>
                        <td className="py-2 px-1 capitalize">{r.status}</td>
                        <td className="py-2 px-1 text-right">
                          <span className={r.avg_fill_percent >= 85 ? "text-destructive font-medium" : ""}>
                            {r.avg_fill_percent}%
                          </span>
                        </td>
                        <td className="py-2 px-1 text-right">{r.telemetry_points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        <Card variant="glass">
          <CardHeader>
            <CardTitle>Info</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-3">
            <p>Reports include data for all bins in your organization.</p>
            <ul className="list-disc list-inside text-xs space-y-1">
              <li><strong>Daily</strong>: Last 24 hours</li>
              <li><strong>Weekly</strong>: Last 7 days</li>
              <li><strong>Monthly</strong>: Last 30 days</li>
              <li><strong>Custom</strong>: Use date inputs for any range</li>
            </ul>
            <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t">
              <AlertTriangle className="h-3 w-3" />
              <span>Click <strong>Load Data</strong> to view summary before exporting</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
