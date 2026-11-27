-- Sortyx Intelligence Platform - Waste records (Environmental Impact snapshots)
-- One row per waste event. Factor/rate are snapshotted at creation time so that
-- later edits to material_config never change historical calculations.

CREATE TABLE IF NOT EXISTS waste_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  bin_id UUID REFERENCES bins(id) ON DELETE SET NULL,
  telemetry_event_id UUID REFERENCES telemetry_events(id) ON DELETE SET NULL,
  material TEXT NOT NULL,
  category TEXT NOT NULL,
  weight_kg NUMERIC(10,3) NOT NULL,
  co2e_factor_used NUMERIC(10,4),
  co2e_avoided_kg NUMERIC(12,4),
  rate_per_kg_used NUMERIC(10,2),
  estimated_value_inr NUMERIC(12,2),
  calculation_method TEXT,
  source TEXT,
  is_proxy BOOLEAN NOT NULL DEFAULT FALSE,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_waste_org_recorded ON waste_records (organization_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_waste_telemetry ON waste_records (telemetry_event_id);

ALTER TABLE waste_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY waste_records_select ON waste_records FOR SELECT USING (
  organization_id = public.get_user_org_id()
  OR EXISTS (
    SELECT 1 FROM bins b WHERE b.id = waste_records.bin_id
    AND public.get_user_role() = 'customer' AND b.customer_id = public.get_user_customer_id()
  )
);

ALTER PUBLICATION supabase_realtime ADD TABLE waste_records;

-- Aggregate totals for a given organization (NULL factors/rates are ignored by SUM).
CREATE OR REPLACE FUNCTION get_env_impact_totals(p_org_id UUID)
RETURNS TABLE (
  total_weight NUMERIC,
  total_co2e NUMERIC,
  total_value NUMERIC
) AS $$
  SELECT
    COALESCE(SUM(weight_kg), 0),
    COALESCE(SUM(co2e_avoided_kg), 0),
    COALESCE(SUM(estimated_value_inr), 0)
  FROM waste_records
  WHERE organization_id = p_org_id;
$$ LANGUAGE sql STABLE;
