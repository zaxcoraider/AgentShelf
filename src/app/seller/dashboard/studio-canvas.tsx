"use client";

import { type AgDataSourcesDefinition, type AgStudioMode, enableStudioDevValidations, studioTheme } from "ag-studio";
import { AgStudio, AgStudioProvider } from "ag-studio-react";
import { useMemo, useState } from "react";
import type { DashboardData } from "@/lib/dashboard-data";
import { initialReport } from "./report";

if (process.env.NODE_ENV !== "production") enableStudioDevValidations();

// Candlelit, to match the rest of the seller app: warm charcoal, cream text, amber first in the palette.
const theme = studioTheme.withParams({
  browserColorScheme: "dark",
  backgroundColor: "#17130f",
  foregroundColor: "#faf7f2",
  accentColor: "#f59e0b",
  borderColor: "#2a231e",
  chartPaletteFills1Color: "#f59e0b",
  chartPaletteFills2Color: "#a8a29e",
  chartPaletteFills3Color: "#fcd34d",
  chartPaletteFills4Color: "#b45309",
  chartPaletteFills5Color: "#78716c",
});

export default function StudioCanvas({ data, licenseKey }: { data: DashboardData; licenseKey?: string }) {
  const [mode, setMode] = useState<AgStudioMode>("view");
  // Studio treats a new object as new data, so keep the reference stable across renders.
  const sources = useMemo(() => data as unknown as AgDataSourcesDefinition, [data]);
  const style = useMemo(() => ({ height: "100%", width: "100%" }), []);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 pb-3">
        <p className="text-sm text-smoke">
          {mode === "view" ? "Live from your shop and PayPal." : "Drag widgets, add charts, or change what each one shows."}
        </p>
        <button
          type="button"
          onClick={() => setMode((m) => (m === "view" ? "edit" : "view"))}
          className="rounded-full border border-white/10 px-4 py-1.5 text-sm text-cream transition hover:border-white/20 hover:bg-white/[0.06]"
        >
          {mode === "view" ? "Edit layout" : "Done editing"}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/[0.07]">
        <AgStudioProvider licenseKey={licenseKey}>
          <AgStudio style={style} data={sources} initialState={initialReport} mode={mode} theme={theme} />
        </AgStudioProvider>
      </div>
    </div>
  );
}
