"use client";

import {
  type AgAiModel,
  type AgDataSourcesDefinition,
  type AgStudioApi,
  type AgStudioMode,
  AgStudioAiModule,
  enableStudioDevValidations,
  studioTheme,
} from "ag-studio";
import { AgStudio, AgStudioProvider, createWidgets } from "ag-studio-react";
import { useCallback, useMemo, useRef, useState } from "react";
import type { DashboardData } from "@/lib/dashboard-data";
import { initialReport } from "./report";
import { aiSetup, aiToolDisplay } from "./studio-ai";
import { CUSTOM_WIDGETS } from "./widgets";

const AI_MODULES = [AgStudioAiModule];
// Studio's catalogue plus our two widgets, under their own menu heading.
const WIDGETS = (defaults: { menu: unknown[] }) =>
  createWidgets({
    additionalTypes: CUSTOM_WIDGETS,
    menu: [...defaults.menu, { label: "AgentShelf", widgetIds: CUSTOM_WIDGETS.map((w) => w.id) }],
  } as never);

const LOCALE_TEXT = {
  panelTitleAi: "Shop assistant",
  aiMessageInputPlaceholder: "Ask about your shop, or ask for a chart…",
};

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

export default function StudioCanvas({
  data,
  licenseKey,
  models,
}: {
  data: DashboardData;
  licenseKey?: string;
  models: AgAiModel[];
}) {
  const [mode, setMode] = useState<AgStudioMode>("view");
  const [asking, setAsking] = useState(false);
  // Studio treats a new object as new data, so keep the reference stable across renders.
  const sources = useMemo(() => data as unknown as AgDataSourcesDefinition, [data]);
  const style = useMemo(() => ({ height: "100%", width: "100%" }), []);
  // No models configured → no assistant (the chat panel only appears when `ai` is set).
  // `ai` is read once at creation; build it once even if a live refresh hands us a new models array.
  const [ai] = useState(() => (models.length ? aiSetup(models) : undefined));
  const studio = useRef<AgStudioApi | null>(null);

  // Studio's chat panel lives in edit mode; "Ask AI" opens it with the building panels tucked away.
  const askAi = useCallback(() => {
    setAsking(true);
    setMode("edit");
    requestAnimationFrame(() => {
      const api = studio.current;
      if (!api) return;
      const state = api.getState();
      api.setState({
        ...state,
        panels: { ...state.panels, ai: { collapsed: false }, edit: { collapsed: true }, data: { collapsed: true } },
      });
    });
  }, []);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 pb-3">
        <p className="text-sm text-smoke">
          {mode === "view"
            ? "Live from your shop and PayPal."
            : asking
              ? "Ask what needs you, why a refund was blocked, or for a new chart. Your PayPal seller agent and AG Studio's agents work together."
              : "Drag widgets, add charts, or change what each one shows."}
        </p>
        <div className="flex items-center gap-2">
          {ai && mode === "view" && (
            <button
              type="button"
              onClick={askAi}
              className="inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-4 py-1.5 text-sm font-medium text-soot transition hover:bg-amber-400"
            >
              <svg aria-hidden viewBox="0 0 20 20" className="size-4" fill="currentColor">
                <path d="M10 2l1.6 4.4L16 8l-4.4 1.6L10 14l-1.6-4.4L4 8l4.4-1.6L10 2zm5.5 9l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z" />
              </svg>
              Ask AI
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setAsking(false);
              setMode((m) => (m === "view" ? "edit" : "view"));
            }}
            className="rounded-full border border-white/10 px-4 py-1.5 text-sm text-cream transition hover:border-white/20 hover:bg-white/[0.06]"
          >
            {mode === "view" ? "Edit layout" : "Done"}
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/[0.07]">
        <AgStudioProvider licenseKey={licenseKey} modules={AI_MODULES}>
          <AgStudio
            onApiReady={(e) => (studio.current = e.api)}
            style={style}
            data={sources}
            initialState={initialReport}
            mode={mode}
            theme={theme}
            ai={ai}
            aiToolDisplay={aiToolDisplay}
            localeText={LOCALE_TEXT}
            widgets={WIDGETS as never}
          />
        </AgStudioProvider>
      </div>
    </div>
  );
}
