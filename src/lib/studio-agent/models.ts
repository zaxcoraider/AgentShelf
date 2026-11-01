import type { Provider } from "./chat-completions";

/**
 * The models the dashboard's chat panel offers. The browser only ever sees the slot ids
 * ("primary", "fallback") and a label; the real gateway, model id and key stay on the server.
 */

export type StudioModelSlot = "primary" | "fallback";

/** "deepseek-ai/DeepSeek-V4.1-Flash-1017" → "DeepSeek V4.1 Flash 1017" */
const label = (model: string) => model.split("/").pop()!.replace(/-/g, " ");

export function studioProviders(): Partial<Record<StudioModelSlot, Provider>> {
  const providers: Partial<Record<StudioModelSlot, Provider>> = {};
  const { AI_BASE_URL, AI_API_KEY, AI_MODEL_AGENT, AI_FALLBACK_BASE_URL, AI_FALLBACK_API_KEY } = process.env;
  if (AI_BASE_URL && AI_API_KEY && AI_MODEL_AGENT) {
    providers.primary = { baseURL: AI_BASE_URL, apiKey: AI_API_KEY, model: AI_MODEL_AGENT };
  }
  const fallbackModel = process.env.AI_FALLBACK_AI_MODEL_AGENT ?? process.env.AI_FALLBACK_MODEL;
  if (AI_FALLBACK_BASE_URL && AI_FALLBACK_API_KEY && fallbackModel) {
    providers.fallback = { baseURL: AI_FALLBACK_BASE_URL, apiKey: AI_FALLBACK_API_KEY, model: fallbackModel };
  }
  return providers;
}

/** What the chat panel's model picker lists; empty means the assistant is off. */
export function studioModels(): { id: StudioModelSlot; label: string }[] {
  return Object.entries(studioProviders()).map(([id, p]) => ({ id: id as StudioModelSlot, label: label(p.model) }));
}
