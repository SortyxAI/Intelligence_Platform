"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

export function FcmRegister() {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_FCM_ENABLED !== "true") return;

    async function setup() {
      try {
        const { registerFcmToken } = await import("@/lib/firebase/client");
        const token = await registerFcmToken();
        if (!token) return;
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        await supabase.from("profiles").update({ fcm_token: token }).eq("id", user.id);
        await fetch("/api/notifications/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
      } catch (e) {
        console.warn("FCM registration skipped:", e);
      }
    }
    setup();
  }, []);

  return null;
}
