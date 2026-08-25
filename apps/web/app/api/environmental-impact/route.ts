import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";
import { subDays, subWeeks, subMonths, parseISO } from "date-fns";

function getDateRange(period: string, startDate?: string, endDate?: string) {
  if (startDate && endDate) {
    return { start: parseISO(startDate), end: parseISO(endDate) };
  }
  const end = new Date();
  let start: Date;
  switch (period) {
    case "daily":
      start = subDays(end, 1);
      break;
    case "monthly":
      start = subMonths(end, 1);
      break;
    default:
      start = subWeeks(end, 1);
  }
  return { start, end };
}

type Agg = {
  weight: number;
  co2e: number;
  value: number;
  count: number;
  isProxy: boolean;
};

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const period = request.nextUrl.searchParams.get("period") ?? "weekly";
  const startDateParam = request.nextUrl.searchParams.get("start_date") ?? undefined;
  const endDateParam = request.nextUrl.searchParams.get("end_date") ?? undefined;
  const { start, end } = getDateRange(period, startDateParam, endDateParam);

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();
  if (!profile?.organization_id)
    return NextResponse.json({ error: "No organization" }, { status: 400 });

  const service = await createServiceClient();
  const { data: rows, error } = await service
    .from("waste_records")
    .select(
      "material, category, weight_kg, co2e_avoided_kg, estimated_value_inr, is_proxy, recorded_at"
    )
    .eq("organization_id", profile.organization_id)
    .gte("recorded_at", start.toISOString())
    .lte("recorded_at", end.toISOString())
    .order("recorded_at", { ascending: false });

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  const total: Agg = { weight: 0, co2e: 0, value: 0, count: 0, isProxy: false };
  const byMaterial = new Map<string, Agg & { category: string }>();
  const byCategory = new Map<string, Agg>();
  const list = rows ?? [];

  for (const r of list) {
    const w = Number(r.weight_kg) || 0;
    const co2e = r.co2e_avoided_kg != null ? Number(r.co2e_avoided_kg) : null;
    const val = r.estimated_value_inr != null ? Number(r.estimated_value_inr) : null;

    total.weight += w;
    if (co2e != null) total.co2e += co2e;
    if (val != null) total.value += val;
    total.count++;

    const m = byMaterial.get(r.material) ?? {
      weight: 0,
      co2e: 0,
      value: 0,
      count: 0,
      isProxy: false,
      category: r.category,
    };
    m.weight += w;
    if (co2e != null) m.co2e += co2e;
    if (val != null) m.value += val;
    m.count++;
    m.isProxy = m.isProxy || r.is_proxy;
    byMaterial.set(r.material, m);

    const c = byCategory.get(r.category) ?? {
      weight: 0,
      co2e: 0,
      value: 0,
      count: 0,
      isProxy: false,
    };
    c.weight += w;
    if (co2e != null) c.co2e += co2e;
    if (val != null) c.value += val;
    c.count++;
    c.isProxy = c.isProxy || r.is_proxy;
    byCategory.set(r.category, c);
  }

  const materialBreakdown = Array.from(byMaterial.entries())
    .map(([material, a]) => ({
      material,
      category: a.category,
      weightKg: round(a.weight),
      co2eAvoidedKg: round(a.co2e),
      estimatedValueInr: round(a.value),
      count: a.count,
      isProxy: a.isProxy,
      hasCo2eFactor: a.co2e > 0 || list.some((x) => x.material === material && x.co2e_avoided_kg != null),
      hasRate: a.value > 0 || list.some((x) => x.material === material && x.estimated_value_inr != null),
    }))
    .sort((a, b) => b.co2eAvoidedKg - a.co2eAvoidedKg);

  const categoryBreakdown = Array.from(byCategory.entries())
    .map(([category, a]) => ({
      category,
      weightKg: round(a.weight),
      co2eAvoidedKg: round(a.co2e),
      estimatedValueInr: round(a.value),
      count: a.count,
      isProxy: a.isProxy,
    }))
    .sort((a, b) => b.co2eAvoidedKg - a.co2eAvoidedKg);

  const history = list.slice(0, 50).map((r) => ({
    id: r.recorded_at,
    material: r.material,
    category: r.category,
    weightKg: round(Number(r.weight_kg) || 0),
    co2eAvoidedKg: r.co2e_avoided_kg != null ? round(Number(r.co2e_avoided_kg)) : null,
    estimatedValueInr: r.estimated_value_inr != null ? round(Number(r.estimated_value_inr)) : null,
    isProxy: r.is_proxy,
    recordedAt: r.recorded_at,
    hasCo2eFactor: r.co2e_avoided_kg != null,
    hasRate: r.estimated_value_inr != null,
  }));

  return NextResponse.json({
    totals: {
      totalWeightKg: round(total.weight),
      totalCo2eAvoidedKg: round(total.co2e),
      totalEstimatedValueInr: round(total.value),
      count: total.count,
    },
    materialBreakdown,
    categoryBreakdown,
    history,
  });
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
