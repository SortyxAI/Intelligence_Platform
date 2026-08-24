import { createServiceClient } from "@/lib/supabase/server";

export type ToolResponse = {
  result: unknown;
  summary: string;
};

export async function execGetDashboardStats(): Promise<ToolResponse> {
  const supabase = await createServiceClient();
  const [binsRes, alertsRes, customersRes] = await Promise.all([
    supabase.from("bins").select("status"),
    supabase.from("alerts").select("severity, resolved_at").is("resolved_at", null),
    supabase.from("customers").select("id, name"),
  ]);
  const bins = binsRes.data ?? [];
  const activeAlerts = alertsRes.data ?? [];
  const customers = customersRes.data ?? [];

  const totalBins = bins.length;
  const activeBins = bins.filter((b) => b.status === "active").length;
  const offlineBins = bins.filter((b) => b.status === "offline").length;
  const maintenanceBins = bins.filter((b) => b.status === "maintenance").length;

  return {
    result: { totalBins, activeBins, offlineBins, maintenanceBins, activeAlerts, customers },
    summary: `${totalBins} total bins, ${activeBins} active, ${offlineBins} offline, ${maintenanceBins} in maintenance. ${activeAlerts.length} unresolved alerts. ${customers.length} customers.`,
  };
}

export async function execGetBins(filters: {
  status?: string;
  customer_name?: string;
  fill_min?: number;
  fill_max?: number;
  location?: string;
  device_id?: string;
}): Promise<ToolResponse> {
  const supabase = await createServiceClient();
  let query = supabase
    .from("bins")
    .select("id, device_id, status, bin_type, latitude, longitude, location_name, latest_fill_level, latest_battery, last_seen_at, customers(name)");

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.device_id) query = query.ilike("device_id", `%${filters.device_id}%`);
  if (filters.fill_min != null) query = query.gte("latest_fill_level", filters.fill_min);
  if (filters.fill_max != null) query = query.lte("latest_fill_level", filters.fill_max);
  if (filters.location) query = query.ilike("location_name", `%${filters.location}%`);
  if (filters.customer_name) {
    const { data: matching } = await supabase
      .from("customers")
      .select("id")
      .ilike("name", `%${filters.customer_name}%`);
    const ids = matching?.map((c) => c.id) ?? [];
    if (ids.length > 0) query = query.in("customer_id", ids);
  }

  const { data } = await query.order("latest_fill_level", { ascending: false });
  const bins = data ?? [];

  return {
    result: bins,
    summary: `Found ${bins.length} bin${bins.length !== 1 ? "s" : ""}.`,
  };
}

export async function execGetAlerts(filters: {
  severity?: string;
  bin_device_id?: string;
  from_date?: string;
  to_date?: string;
  resolved?: boolean;
  limit?: number;
}): Promise<ToolResponse> {
  const supabase = await createServiceClient();
  let query = supabase
    .from("alerts")
    .select("id, alert_type, severity, message, created_at, resolved_at, bins(device_id)");

  if (filters.severity) query = query.eq("severity", filters.severity);
  if (filters.bin_device_id) {
    const { data: bin } = await supabase
      .from("bins")
      .select("id")
      .ilike("device_id", `%${filters.bin_device_id}%`)
      .maybeSingle();
    if (bin) query = query.eq("bin_id", bin.id);
  }
  if (filters.from_date) query = query.gte("created_at", filters.from_date);
  if (filters.to_date) query = query.lte("created_at", filters.to_date);
  if (filters.resolved === true) query = query.not("resolved_at", "is", null);
  if (filters.resolved === false) query = query.is("resolved_at", null);

  query = query.order("created_at", { ascending: false });

  if (filters.limit) query = query.limit(filters.limit);

  const { data } = await query;
  const alerts = data ?? [];

  return {
    result: alerts,
    summary: `Found ${alerts.length} alert${alerts.length !== 1 ? "s" : ""}.`,
  };
}

export async function execGetTelemetry(filters: {
  bin_device_id?: string;
  from_date?: string;
  to_date?: string;
  limit?: number;
}): Promise<ToolResponse> {
  const supabase = await createServiceClient();
  if (!filters.bin_device_id) {
    return { result: [], summary: "Please specify a bin device ID to query telemetry." };
  }

  const { data: bin } = await supabase
    .from("bins")
    .select("id, device_id")
    .ilike("device_id", `%${filters.bin_device_id}%`)
    .maybeSingle();

  if (!bin) return { result: [], summary: `No bin found matching "${filters.bin_device_id}".` };

  let query = supabase
    .from("telemetry_events")
    .select("recorded_at, fill_level, weight_kg, waste_count, battery_percent, camera_status, sensor_health, internet_status")
    .eq("bin_id", bin.id);

  if (filters.from_date) query = query.gte("recorded_at", filters.from_date);
  if (filters.to_date) query = query.lte("recorded_at", filters.to_date);

  query = query.order("recorded_at", { ascending: false });

  if (filters.limit) query = query.limit(filters.limit);

  const { data } = await query;
  const telemetry = data ?? [];

  return {
    result: telemetry,
    summary: `Found ${telemetry.length} telemetry record${telemetry.length !== 1 ? "s" : ""} for ${bin.device_id}.`,
  };
}

export async function execGetCustomers(): Promise<ToolResponse> {
  const supabase = await createServiceClient();
  const { data } = await supabase
    .from("customers")
    .select("id, name, email, phone, bins(device_id, status)");

  const customers = (data ?? []).map((c) => {
    const binList = c.bins as { device_id: string; status: string }[] | null;
    return {
      ...c,
      bin_count: binList?.length ?? 0,
      active_bins: binList?.filter((b) => b.status === "active").length ?? 0,
    };
  });

  return {
    result: customers,
    summary: `Found ${customers.length} customer${customers.length !== 1 ? "s" : ""}.`,
  };
}

export async function execGetCompartments(filters: {
  bin_device_id?: string;
}): Promise<ToolResponse> {
  const supabase = await createServiceClient();
  if (!filters.bin_device_id) {
    return { result: [], summary: "Please specify a bin device ID to query compartments." };
  }

  const { data: bin } = await supabase
    .from("bins")
    .select("id, device_id, bin_type")
    .ilike("device_id", `%${filters.bin_device_id}%`)
    .maybeSingle();

  if (!bin) return { result: [], summary: `No bin found matching "${filters.bin_device_id}".` };

  const { data: compartments } = await supabase
    .from("bin_compartments")
    .select("compartment_index, label, current_fill_level, current_weight_kg, waste_count")
    .eq("bin_id", bin.id)
    .order("compartment_index");

  return {
    result: { bin: bin.device_id, bin_type: bin.bin_type, compartments: compartments ?? [] },
    summary: compartments?.length
      ? `${bin.device_id} has ${compartments.length} compartment${compartments.length !== 1 ? "s" : ""}.`
      : `No compartments found for ${bin.device_id}.`,
  };
}
