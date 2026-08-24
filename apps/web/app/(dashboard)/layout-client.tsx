"use client";

import { Toaster } from "sonner";
import { FcmRegister } from "@/components/notifications/fcm-register";
import { ChatBubble } from "@/components/chat/chat-bubble";

export function DashboardClientExtras() {
  return (
    <>
      <Toaster
        position="top-right"
        richColors
        closeButton
        toastOptions={{
          style: { borderRadius: "var(--radius)" },
        }}
      />
      <FcmRegister />
      <ChatBubble />
    </>
  );
}
