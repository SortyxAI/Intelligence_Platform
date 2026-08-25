// Waste Environmental Impact - shared calculation + material mapping.
// Pure functions reused by the web app and the MQTT bridge.

// Maps a detected classification CATEGORY to a configured material name.
// Faithful mapping: category-level detection -> the "Mixed" entry where one exists,
// otherwise a representative configured material. Materials with NULL factors/rates
// are intentionally left NULL (never invented) and surfaced as "unavailable" in the UI.
export const CATEGORY_MATERIAL_MAP: Record<string, string> = {
  plastic: "Mixed Plastic",
  paper: "Mixed Paper",
  metal: "Aluminium",
  glass: "Glass",
  organic: "Food Waste",
  ewaste: "E-waste - Mixed",
  textile: "Textile / Clothes",
  wood: "Wood",
};

// Normalize a classification key (e.g. "e-waste") to the map key ("ewaste").
export function normalizeCategory(key: string): string {
  return key.toLowerCase().replace(/[^a-z]/g, "");
}

export function resolveMaterial(category: string): string | null {
  return CATEGORY_MATERIAL_MAP[normalizeCategory(category)] ?? null;
}

export type MaterialConfigRow = {
  material: string;
  category: string;
  co2e_factor: number | null;
  rate_per_kg: number | null;
  method: string | null;
  source: string | null;
  is_proxy: boolean;
};

export type WasteImpactInput = {
  material: string;
  category: string;
  weightKg: number;
  co2eFactor: number | null;
  ratePerKg: number | null;
  method: string | null;
  source: string | null;
  isProxy: boolean;
};

export type WasteImpactResult = {
  material: string;
  category: string;
  weightKg: number;
  co2eFactorUsed: number | null;
  co2eAvoidedKg: number | null;
  ratePerKgUsed: number | null;
  estimatedValueInr: number | null;
  calculationMethod: string | null;
  source: string | null;
  isProxy: boolean;
};

// CO2e Avoided = weight (kg) x factor (kg CO2e/kg)
// Estimated Material Value = weight (kg) x rate (INR/kg)
// NULL factor/rate -> NULL result (UI shows "unavailable"); never substitutes a value.
export function computeWasteImpact(input: WasteImpactInput): WasteImpactResult {
  const co2eAvoidedKg =
    input.co2eFactor != null ? round(input.weightKg * input.co2eFactor, 4) : null;
  const estimatedValueInr =
    input.ratePerKg != null ? round(input.weightKg * input.ratePerKg, 2) : null;

  return {
    material: input.material,
    category: input.category,
    weightKg: input.weightKg,
    co2eFactorUsed: input.co2eFactor,
    co2eAvoidedKg,
    ratePerKgUsed: input.ratePerKg,
    estimatedValueInr,
    calculationMethod: input.method,
    source: input.source,
    isProxy: input.isProxy,
  };
}

// Aggregate classification counts across compartments and return the dominant category.
export function dominantClassificationCategory(
  classifications: Record<string, number>[] | undefined
): string | null {
  if (!classifications || classifications.length === 0) return null;
  const totals: Record<string, number> = {};
  for (const cls of classifications) {
    for (const [key, count] of Object.entries(cls ?? {})) {
      if (typeof count !== "number") continue;
      totals[key] = (totals[key] ?? 0) + count;
    }
  }
  let best: string | null = null;
  let bestCount = -1;
  for (const [key, count] of Object.entries(totals)) {
    if (count > bestCount) {
      bestCount = count;
      best = key;
    }
  }
  return best;
}

function round(n: number, dp: number): number {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}
