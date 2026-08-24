import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth/get-profile";
import { RouteOptimizationClient } from "@/components/analytics/route-optimization-client";

export default async function PortalRouteOptimizationPage() {
  const supabase = await createClient();
  const profile = await getProfile();

  const query = supabase
    .from("bins")
    .select("id, device_id, latitude, longitude, status, latest_fill_level, location_name")
    .not("latitude", "is", null)
    .not("longitude", "is", null);

  if (profile?.customer_id) {
    query.eq("customer_id", profile.customer_id);
  }

  const { data: bins } = await query;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1>Route Optimization</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Plan the most efficient collection route for your bins
        </p>
      </div>
      <RouteOptimizationClient bins={(bins ?? []) as any[]} />
    </div>
  );
}
