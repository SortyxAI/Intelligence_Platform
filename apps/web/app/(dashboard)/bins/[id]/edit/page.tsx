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
  const { data: bin } = await supabase.from("bins").select("*").eq("id", id).single();
  if (!bin) notFound();

  const { data: customers } = await supabase.from("customers").select("id, name").order("name");

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold">Edit bin</h1>
        <p className="text-muted-foreground">{bin.device_id}</p>
      </div>
      <BinForm customers={customers ?? []} organizationId={profile.organization_id!} initial={bin as Record<string, unknown>} />
    </div>
  );
}
