import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth/get-profile";
import { canManageBins } from "@/lib/auth/rbac";
import { redirect, notFound } from "next/navigation";
import { BinForm } from "@/components/bins/bin-form";

export default async function EditBinPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getProfile();
  if (!profile || !canManageBins(profile.role)) redirect("/bins");

  const supabase = await createClient();
  const [
    { data: bin },
    { data: customers },
    { data: compartments },
    { data: compartmentLabelRows },
  ] = await Promise.all([
    supabase.from("bins").select("*").eq("id", id).single(),
    supabase.from("customers").select("id, name").order("name"),
    supabase.from("bin_compartments").select("compartment_index, label").eq("bin_id", id).order("compartment_index"),
    supabase.from("bin_compartments").select("label").order("label"),
  ]);
  if (!bin) notFound();
  const compartmentLabelOptions = [...new Set((compartmentLabelRows ?? []).map(({ label }) => label.trim()).filter(Boolean))];

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold">Edit bin</h1>
        <p className="text-muted-foreground">{bin.device_id}</p>
      </div>
      <BinForm
        customers={customers ?? []}
        organizationId={profile.organization_id!}
        initial={bin as Record<string, unknown>}
        initialCompartments={compartments ?? []}
        compartmentLabelOptions={compartmentLabelOptions}
      />
    </div>
  );
}
