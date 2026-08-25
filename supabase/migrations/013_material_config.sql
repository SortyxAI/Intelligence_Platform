-- Sortyx Intelligence Platform - Material configuration for Environmental Impact
-- CO2e Avoided Factor (kg CO2e/kg) and Rate (INR/kg) per material.
-- Values marked as [VERIFY/PROXY] or [CONFIGURE] in the source spec are stored as NULL
-- and surfaced in the UI as "unavailable" rather than being invented.

CREATE TABLE IF NOT EXISTS material_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  material TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  co2e_factor NUMERIC(10,4),
  rate_per_kg NUMERIC(10,2),
  method TEXT,
  source TEXT,
  is_proxy BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_material_config_category ON material_config (category);

-- Readable by any authenticated user; manageable by admins.
ALTER TABLE material_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY material_config_select ON material_config FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY material_config_admin ON material_config FOR ALL
  USING (public.get_user_role() = 'admin')
  WITH CHECK (public.get_user_role() = 'admin');

-- Seed material database. NULL = not configured (do not invent).
INSERT INTO material_config (material, category, co2e_factor, rate_per_kg, method, source, is_proxy) VALUES
  ('PET', 'Plastic', 1.04, 14.00, 'Recycling', 'EPA WARM v16', FALSE),
  ('HDPE', 'Plastic', 0.76, 15.00, 'Recycling', 'EPA WARM v16', FALSE),
  ('PP', 'Plastic', 0.79, 12.00, 'Recycling', 'EPA WARM v16', FALSE),
  ('LDPE', 'Plastic', NULL, 12.00, 'Proxy', 'Configured proxy', TRUE),
  ('PS', 'Plastic', NULL, 8.00, 'Proxy', 'Configured proxy', TRUE),
  ('PVC', 'Plastic', NULL, 8.00, 'Proxy', 'Configured proxy', TRUE),
  ('Mixed Plastic', 'Plastic', NULL, 15.07, 'Proxy', 'Mixed plastic proxy', TRUE),
  ('Cardboard / OCC', 'Paper', 3.46, 8.00, 'Recycling', 'EPA WARM v16', FALSE),
  ('Newspaper', 'Paper', 2.99, 13.46, 'Recycling', 'EPA WARM v16', FALSE),
  ('Office Paper', 'Paper', 3.15, 12.00, 'Recycling', 'EPA WARM v16', FALSE),
  ('Magazines', 'Paper', NULL, 10.00, 'Proxy', 'Configured proxy', TRUE),
  ('Books / Textbooks', 'Paper', NULL, 10.00, 'Proxy', 'Configured proxy', TRUE),
  ('Mixed Paper', 'Paper', 3.91, 10.00, 'Recycling', 'EPA WARM v16', FALSE),
  ('Aluminium Cans', 'Metal', 10.06, 159.03, 'Recycling', 'EPA WARM v16', FALSE),
  ('Aluminium', 'Metal', 10.06, 159.03, 'Recycling', 'EPA WARM v16', FALSE),
  ('Steel / Iron', 'Metal', 2.02, 32.25, 'Recycling', 'EPA WARM v16', FALSE),
  ('Copper Wire', 'Metal', 4.95, 634.00, 'Recycling', 'EPA WARM v16', FALSE),
  ('Copper', 'Metal', 4.95, 634.00, 'Recycling', 'EPA WARM v16', FALSE),
  ('Stainless Steel', 'Metal', NULL, 141.74, 'Proxy', 'Configured proxy', TRUE),
  ('Brass', 'Metal', NULL, NULL, 'Proxy', 'Configured proxy', TRUE),
  ('Glass', 'Glass', 0.31, 2.00, 'Recycling', 'EPA WARM v16', FALSE),
  ('Food Waste', 'Organic', NULL, 0, 'Composting vs landfill', 'EPA WARM v16', FALSE),
  ('Food Waste (non-meat)', 'Organic', NULL, 0, 'Composting vs landfill', 'EPA WARM v16', FALSE),
  ('Food Waste (meat)', 'Organic', NULL, 0, 'Composting vs landfill', 'EPA WARM v16', FALSE),
  ('Yard Waste', 'Organic', NULL, 0, 'Composting vs landfill', 'EPA WARM v16', FALSE),
  ('E-waste - Mixed', 'E-waste', NULL, 43.99, 'E-waste recovery', 'EPA WARM v16', FALSE),
  ('Desktop CPU', 'E-waste', NULL, NULL, 'E-waste recovery', 'EPA WARM v16', FALSE),
  ('Laptop', 'E-waste', NULL, NULL, 'E-waste recovery', 'EPA WARM v16', FALSE),
  ('Mobile Phone', 'E-waste', NULL, NULL, 'E-waste recovery', 'EPA WARM v16', FALSE),
  ('Textile / Clothes', 'Textile', NULL, NULL, 'Proxy', 'Configured proxy', TRUE),
  ('Wood', 'Wood', NULL, NULL, 'Proxy', 'Configured proxy', TRUE)
ON CONFLICT (material) DO NOTHING;
