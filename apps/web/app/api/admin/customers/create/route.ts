import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: admin } = await supabase
    .from("profiles")
    .select("role, organization_id")
    .eq("id", user.id)
    .single();
  if (!admin || admin.role !== "admin" || !admin.organization_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { email: rawEmail, password, name, phone, address } = await request.json();
  const email = rawEmail?.trim().toLowerCase();
  if (!email || !password || !name) {
    return NextResponse.json({ error: "email, password, and name are required" }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  }

  const service = await createServiceClient();

  const { data: authData, error: authError } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (authError || !authData.user) {
    return NextResponse.json({
      error: "auth: " + (authError?.message ?? "User creation failed"),
    }, { status: 400 });
  }
  const authUserId = authData.user.id;

  const { data: customer, error: customerError } = await service
    .from("customers")
    .insert({ organization_id: admin.organization_id, name, email, phone: phone || null, address: address || null })
    .select("id")
    .single();
  if (customerError) {
    try { await service.auth.admin.deleteUser(authUserId); } catch {}
    return NextResponse.json({ error: "customer: " + customerError.message }, { status: 400 });
  }

  const { error: profileError } = await service
    .from("profiles")
    .update({
      full_name: name,
      organization_id: admin.organization_id,
      customer_id: customer.id,
    })
    .eq("id", authUserId);
  if (profileError) {
    try { await service.auth.admin.deleteUser(authUserId); } catch {}
    try { await service.from("customers").delete().eq("id", customer.id); } catch {}
    return NextResponse.json({ error: "profile: " + profileError.message }, { status: 400 });
  }

  await service.from("activity_log").insert({
    organization_id: admin.organization_id,
    user_id: user.id,
    action: "customer_created",
    details: { customer_id: customer.id, name, email },
  });

  return NextResponse.json({ success: true, customerId: customer.id });
}
