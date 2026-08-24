import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Suspense } from "react";
import { PortalClientExtras } from "./layout-client";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardShell>
      <Suspense fallback={null}>
        <PortalClientExtras />
      </Suspense>
      {children}
    </DashboardShell>
  );
}
