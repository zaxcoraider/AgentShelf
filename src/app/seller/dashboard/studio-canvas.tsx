"use client";

import {
  type AgAiModel,
  type AgDataSourcesDefinition,
  type AgReportState,
  type AgStudioApi,
  type AgStudioMode,
  AgStudioAiModule,
  enableStudioDevValidations,
  studioTheme,
} from "ag-studio";
import { AgStudio, AgStudioProvider, createWidgets } from "ag-studio-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DashboardData } from "@/lib/dashboard-data";
import { initialReport } from "./report";
import { aiSetup } from "./studio-ai";
import { aiToolDisplay } from "./tool-details";
import { CUSTOM_WIDGETS } from "./widgets";

const AI_MODULES = [AgStudioAiModule];
const PAGES = [
  { id: "overview", label: "Overview" },
  { id: "watch", label: "Watch" },
] as const;
type PageId = (typeof PAGES)[number]["id"];
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

/** Where this shop's dashboard is saved: the database, or (for the read-only demo shop) this browser. */
export type DashboardSave = { to: "server" } | { to: "browser"; key: string };

const SAVE_DELAY_MS = 1500;

/**
 * The saved dashboard if it looks like one, with our pages always present and the side panels
 * reset (so a dashboard saved mid-chat doesn't reopen with the chat panel out).
 */
function restore(saved: unknown): AgReportState {
  const s = saved as AgReportState | null | undefined;
  if (!s || !Array.isArray(s.pages) || typeof s.selectedPageId !== "string") return initialReport;
  const missing = initialReport.pages.filter((p) => !s.pages.some((q) => q.id === p.id));
  const pages = [...s.pages, ...missing];
  const selectedPageId = pages.some((p) => p.id === s.selectedPageId) ? s.selectedPageId : initialReport.selectedPageId;
  return { ...s, pages, selectedPageId, panels: initialReport.panels };
}

function readBrowser(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function StudioCanvas({
  data,
  licenseKey,
  models,
  savedState,
  save,
}: {
  data: DashboardData;
  licenseKey?: string;
  models: AgAiModel[];
  savedState?: unknown;
  save: DashboardSave;
}) {
  // Read once: Studio takes initialState at creation only.
  const [startState] = useState(() => restore(save.to === "browser" ? readBrowser(save.key) : savedState));
  const [mode, setMode] = useState<AgStudioMode>("view");
  const [asking, setAsking] = useState(false);
  const [page, setPage] = useState<PageId>(() =>
    PAGES.some((p) => p.id === startState.selectedPageId) ? (startState.selectedPageId as PageId) : "overview",
  );
  const [saved, setSaved] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const pending = useRef<{ timer: ReturnType<typeof setTimeout>; state: AgReportState } | null>(null);
  // Studio echoes state as it loads (and after a reset); those aren't the seller's changes, so don't
  // save them: a shop on the default layout keeps getting our latest default.
  const quietUntil = useRef(0);

  // Save a moment after the last change, so a burst of edits (or an agent placing widgets) is one write.
  const persist = useCallback(
    async (state: AgReportState) => {
      if (save.to === "browser") {
        try {
          localStorage.setItem(save.key, JSON.stringify(state));
          setSaved("saved");
        } catch {
          setSaved("error");
        }
        return;
      }
      setSaved("saving");
      const res = await fetch("/api/seller/dashboard/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state),
        keepalive: true,
      }).catch(() => null);
      setSaved(res?.ok ? "saved" : "error");
    },
    [save],
  );
  const onStateUpdated = useCallback(
    (state: AgReportState) => {
      if (Date.now() < quietUntil.current) return;
      if (pending.current) clearTimeout(pending.current.timer);
      const timer = setTimeout(() => {
        pending.current = null;
        void persist(state);
      }, SAVE_DELAY_MS);
      pending.current = { timer, state };
    },
    [persist],
  );
  // Leaving the page with a change still waiting: save it now.
  useEffect(() => {
    const flush = () => {
      if (!pending.current) return;
      clearTimeout(pending.current.timer);
      void persist(pending.current.state);
      pending.current = null;
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [persist]);
  // Studio treats a new object as new data, so keep the reference stable across renders.
  const sources = useMemo(() => data as unknown as AgDataSourcesDefinition, [data]);
  const style = useMemo(() => ({ height: "100%", width: "100%" }), []);
  // No models configured → no assistant (the chat panel only appears when `ai` is set).
  // `ai` is read once at creation; build it once even if a live refresh hands us a new models array.
  const [ai] = useState(() => (models.length ? aiSetup(models) : undefined));
  const studio = useRef<AgStudioApi | null>(null);

  // Studio has pages but no page tabs of its own; switch with setState, as its docs do.
  const showPage = useCallback((id: PageId) => {
    const api = studio.current;
    if (!api) return;
    api.setState({ ...api.getState(), selectedPageId: id });
    setPage(id);
  }, []);

  const resetLayout = useCallback(async () => {
    if (!confirm("Go back to the default dashboard? Widgets and charts you or the AI added will be removed.")) return;
    if (pending.current) clearTimeout(pending.current.timer);
    pending.current = null;
    if (save.to === "browser") {
      try {
        localStorage.removeItem(save.key);
      } catch {}
    } else {
      await fetch("/api/seller/dashboard/state", { method: "DELETE" }).catch(() => null);
    }
    quietUntil.current = Date.now() + 1500;
    studio.current?.setState(initialReport);
    setPage("overview");
    setSaved("idle");
  }, [save]);

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
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
        <div role="tablist" aria-label="Dashboard pages" className="flex items-center gap-1 rounded-full border border-white/[0.07] bg-white/[0.02] p-1">
          {PAGES.map((p) => (
            <button
              key={p.id}
              role="tab"
              type="button"
              aria-selected={page === p.id}
              onClick={() => showPage(p.id)}
              className={`rounded-full px-3.5 py-1 text-sm transition-colors ${
                page === p.id ? "bg-white/[0.09] text-cream" : "text-smoke hover:text-cream"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className="mr-auto text-sm text-smoke">
          {mode === "view"
            ? page === "watch"
              ? "A page you build with Ask AI, e.g. “add the dispute countdown and the agent feed here”."
              : "Live from your shop and PayPal."
            : asking
              ? "Ask what needs you, why a refund was blocked, or for a new chart. Your PayPal seller agent and AG Studio's agents work together."
              : "Drag widgets, add charts, or change what each one shows."}
        </p>
        <div className="flex items-center gap-2">
          {saved !== "idle" && (
            <span className={`text-xs ${saved === "error" ? "text-red-300" : "text-smoke"}`} role="status">
              {saved === "saving" ? "Saving…" : saved === "saved" ? (save.to === "browser" ? "Saved in this browser" : "Saved") : "Couldn't save"}
            </span>
          )}
          {mode === "edit" && (
            <button type="button" onClick={resetLayout} className="rounded-full px-3 py-1.5 text-sm text-smoke transition hover:text-cream">
              Reset layout
            </button>
          )}
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
            onApiReady={(e) => {
              studio.current = e.api;
              quietUntil.current = Date.now() + 1500;
            }}
            style={style}
            data={sources}
            initialState={startState}
            onStateUpdated={(e) => onStateUpdated(e.state)}
            mode={mode}
            theme={theme}
            ai={ai}
            // React detail components (per the docs); the default registry type only names TS classes.
            aiToolDisplay={aiToolDisplay as never}
            localeText={LOCALE_TEXT}
            widgets={WIDGETS as never}
          />
        </AgStudioProvider>
      </div>
    </div>
  );
}
