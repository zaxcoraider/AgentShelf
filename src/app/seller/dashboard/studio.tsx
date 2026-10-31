"use client";

import dynamic from "next/dynamic";
import type { DashboardData } from "@/lib/dashboard-data";

// AG Studio draws charts and grids with browser APIs, so it renders on the client only.
const StudioCanvas = dynamic(() => import("./studio-canvas"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-smoke">Loading your dashboard…</div>,
});

export function SellerStudio(props: { data: DashboardData; licenseKey?: string }) {
  return <StudioCanvas {...props} />;
}
