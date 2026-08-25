// Validation for Waste Environmental Impact calculations.
// Run: npx tsx packages/shared/scripts/validate-impact.ts
import {
  resolveMaterial,
  computeWasteImpact,
  dominantClassificationCategory,
} from "../src/material-impact.js";

let failures = 0;
function check(name: string, actual: number | null, expected: number) {
  if (actual === null) {
    console.error(`FAIL ${name}: got null, expected ${expected}`);
    failures++;
    return;
  }
  if (Math.abs(actual - expected) > 1e-6) {
    console.error(`FAIL ${name}: got ${actual}, expected ${expected}`);
    failures++;
  } else {
    console.log(`PASS ${name}: ${actual}`);
  }
}

// Spec validation cases (1 kg each).
check("PET CO2e", computeWasteImpact({ material: "PET", category: "Plastic", weightKg: 1, co2eFactor: 1.04, ratePerKg: 14, method: "Recycling", source: "x", isProxy: false }).co2eAvoidedKg, 1.04);
check("PET Value", computeWasteImpact({ material: "PET", category: "Plastic", weightKg: 1, co2eFactor: 1.04, ratePerKg: 14, method: "Recycling", source: "x", isProxy: false }).estimatedValueInr, 14);

check("Cardboard CO2e", computeWasteImpact({ material: "Cardboard / OCC", category: "Paper", weightKg: 1, co2eFactor: 3.46, ratePerKg: 8, method: "Recycling", source: "x", isProxy: false }).co2eAvoidedKg, 3.46);
check("Cardboard Value", computeWasteImpact({ material: "Cardboard / OCC", category: "Paper", weightKg: 1, co2eFactor: 3.46, ratePerKg: 8, method: "Recycling", source: "x", isProxy: false }).estimatedValueInr, 8);

check("Aluminium CO2e", computeWasteImpact({ material: "Aluminium", category: "Metal", weightKg: 1, co2eFactor: 10.06, ratePerKg: 159.03, method: "Recycling", source: "x", isProxy: false }).co2eAvoidedKg, 10.06);
check("Aluminium Value", computeWasteImpact({ material: "Aluminium", category: "Metal", weightKg: 1, co2eFactor: 10.06, ratePerKg: 159.03, method: "Recycling", source: "x", isProxy: false }).estimatedValueInr, 159.03);

check("Steel CO2e", computeWasteImpact({ material: "Steel / Iron", category: "Metal", weightKg: 1, co2eFactor: 2.02, ratePerKg: 32.25, method: "Recycling", source: "x", isProxy: false }).co2eAvoidedKg, 2.02);
check("Steel Value", computeWasteImpact({ material: "Steel / Iron", category: "Metal", weightKg: 1, co2eFactor: 2.02, ratePerKg: 32.25, method: "Recycling", source: "x", isProxy: false }).estimatedValueInr, 32.25);

check("Glass CO2e", computeWasteImpact({ material: "Glass", category: "Glass", weightKg: 1, co2eFactor: 0.31, ratePerKg: 2, method: "Recycling", source: "x", isProxy: false }).co2eAvoidedKg, 0.31);
check("Glass Value", computeWasteImpact({ material: "Glass", category: "Glass", weightKg: 1, co2eFactor: 0.31, ratePerKg: 2, method: "Recycling", source: "x", isProxy: false }).estimatedValueInr, 2);

// Category mapping.
console.log("Mapping plastic ->", resolveMaterial("plastic"));
console.log("Mapping e-waste ->", resolveMaterial("e-waste"));
console.log("Dominant ->", dominantClassificationCategory([{ plastic: 3, metal: 5 }, { plastic: 1 }]));

// NULL handling (Mixed Plastic has null factor).
const mixed = computeWasteImpact({ material: "Mixed Plastic", category: "Plastic", weightKg: 1, co2eFactor: null, ratePerKg: 15.07, method: "Proxy", source: "x", isProxy: true });
console.log("Mixed Plastic co2e (should be null):", mixed.co2eAvoidedKg, "| value (should be 15.07):", mixed.estimatedValueInr);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll validation checks passed.");
