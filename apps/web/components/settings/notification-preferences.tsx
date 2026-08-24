"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, CheckCircle2, XCircle, MessageCircle } from "lucide-react";
import type { Profile } from "@/lib/auth/rbac";
import { createClient } from "@/lib/supabase/client";

export function NotificationPreferences() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const { data } = await supabase
        .from("profiles")
        .select("id, email, full_name, role, organization_id, customer_id, fcm_token, notify_email, notify_telegram, notify_whatsapp, telegram_chat_id, phone")
        .eq("id", user.id)
        .single();
      setProfile(data as Profile);
      setLoading(false);
    }
    load();
  }, []);

  async function toggle(field: "notify_email" | "notify_telegram" | "notify_whatsapp", value: boolean): Promise<void> {
    if (!profile) return;
    setSaving(field);
    setError(null);
    setProfile({ ...profile, [field]: value });
    const res = await fetch("/api/profile/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    if (!res.ok) {
      setError("Failed to save preference. Try again.");
      setProfile({ ...profile, [field]: !value });
    }
    setSaving(null);
  }

  async function savePhone(phone: string) {
    if (!profile) return;
    setProfile({ ...profile, phone });
    await fetch("/api/profile/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card variant="glass">
      <CardHeader>
        <CardTitle>Notification Preferences</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="notify_email">Email Notifications</Label>
            <p className="text-sm text-muted-foreground">
              Receive alerts at {profile?.email ?? "your email"}
            </p>
          </div>
          <Switch
            id="notify_email"
            checked={profile?.notify_email ?? true}
            onCheckedChange={(v) => toggle("notify_email", v)}
            disabled={saving === "notify_email"}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="notify_telegram">Telegram Notifications</Label>
            <p className="text-sm text-muted-foreground">
              {profile?.telegram_chat_id
                ? "Linked — you'll receive alerts here"
                : "Not linked — message the Sortyx bot with /start your@email.com"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {profile?.telegram_chat_id ? (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            ) : (
              <XCircle className="h-4 w-4 text-muted-foreground" />
            )}
            <Switch
              id="notify_telegram"
              checked={profile?.notify_telegram ?? false}
              onCheckedChange={(v) => toggle("notify_telegram", v)}
              disabled={saving === "notify_telegram" || !profile?.telegram_chat_id}
            />
          </div>
        </div>

        <div className="border-t pt-6">
          <div className="flex items-center gap-2 mb-4">
            <MessageCircle className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">WhatsApp Notifications</span>
          </div>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="phone" className="text-xs">Phone Number (with country code)</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="+1234567890"
                value={profile?.phone ?? ""}
                onChange={(e) => savePhone(e.target.value)}
                className="text-sm max-w-xs"
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="notify_whatsapp" className="text-xs">WhatsApp Alerts</Label>
                <p className="text-xs text-muted-foreground">
                  {profile?.phone
                    ? "Receive alerts via WhatsApp (free via CallMeBot)"
                    : "Enter your phone number above to enable"}
                </p>
              </div>
              <Switch
                id="notify_whatsapp"
                checked={profile?.notify_whatsapp ?? false}
                onCheckedChange={(v) => toggle("notify_whatsapp", v)}
                disabled={saving === "notify_whatsapp" || !profile?.phone}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              First time? Message <code className="bg-accent px-1 rounded">I allow callmebot</code> to{" "}
              <strong>+34 684 36 57 64</strong> on WhatsApp to activate free alerts.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
