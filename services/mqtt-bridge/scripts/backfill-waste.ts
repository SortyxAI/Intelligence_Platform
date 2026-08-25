// One-time backfill: generate waste_records from existing telemetry_events.
// Run from services/mqtt-bridge: npx tsx scripts/backfill-waste.ts
// Uses SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from the bridge .env.
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import {
  resolveMaterial,
  computeWasteImpact,
  dominantClassificationCategory,
  type MaterialConfigRow,
} from "@sortyx/shared";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { realtime: { transport: WebSocket as never } }
);

async function loadMaterialConfig(): Promise<Map<string, MaterialConfigRow>> {
  const { data } = await supabase
    .from("material_config")
    .select("material, category, co2e_factor, rate_per_kg, method, source, is_proxy");
  const map = new Map<string, MaterialConfigRow>();
  for (const r of data ?? []) {
    map.set(r.material, {
      material: r.material,
      category: r.category,
      co2e_factor: r.co2e_factor != null ? Number(r.co2e_factor) : null,
      rate_per_kg: r.rate_per_kg != null ? Number(r.rate_per_kg) : null,
      method: r.method,
      source: r.source,
      is_proxy: r.is_proxy,
    });
  }
  return map;
}

async function main() {
  const config = await loadMaterialConfig();
  console.log(`Loaded ${config.size} material config rows`);

  let processed = 0;
  let inserted = 0;
  let skipped = 0;
  let cursor = "00000000-0000-0000-0000-000000000000";

  while (true) {
    const { data: events, error } = await supabase
      .from("telemetry_events")
      .select("id, organization_id, bin_id, weight_kg, compartments, recorded_at")
      .gt("weight_kg", 0)
      .order("id")
      .gt("id", cursor)
      .limit(500);

    if (error) {
      console.error("Query error:", error);
      process.exit(1);
    }
    if (!events || events.length === 0) break;

    for (const ev of events) {
      cursor = ev.id;
      processed++;
      const weight = Number(ev.weight_kg);
      const classifications: Record<string, number>[] = (ev.compartments ?? [])
        .map((c: { classification?: Record<string, number> }) => c?.classification ?? {});
      const dominantCat = dominantClassificationCategory(classifications);
      if (!dominantCat) {
        skipped++;
        continue;
      }
      const material = resolveMaterial(dominantCat);
      if (!material) {
        skipped++;
        continue;
      }
      const cfg = config.get(material);
      if (!cfg) {
        skipped++;
        continue;
      }
      const impact = computeWasteImpact({
        material: cfg.material,
        category: cfg.category,
        weightKg: weight,
        co2eFactor: cfg.co2e_factor,
        ratePerKg: cfg.rate_per_kg,
        method: cfg.method,
        source: cfg.source,
        isProxy: cfg.is_proxy,
      });

      const { error: insertErr } = await supabase.from("waste_records").insert({
        organization_id: ev.organization_id,
        bin_id: ev.bin_id,
        telemetry_event_id: ev.id,
        material: impact.material,
        category: impact.category,
        weight_kg: impact.weightKg,
        co2e_factor_used: impact.co2eFactorUsed,
        co2e_avoided_kg: impact.co2eAvoidedKg,
        rate_per_kg_used: impact.ratePerKgUsed,
        estimated_value_inr: impact.estimatedValueInr,
        calculation_method: impact.calculationMethod,
        source: impact.source,
        is_proxy: impact.isProxy,
        recorded_at: ev.recorded_at,
      });

      if (insertErr) {
        console.error(`Insert error for ${ev.id}:`, insertErr.message);
      } else {
        inserted++;
      }
    }

    if (events.length < 500) break;
  }

  console.log(`Backfill complete. processed=${processed} inserted=${inserted} skipped=${skipped}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
