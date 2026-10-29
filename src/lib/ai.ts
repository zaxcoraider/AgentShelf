import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

/**
 * Every AI call in AgentShelf goes through this module.
 * Primary provider: DGrid AI gateway (OpenAI-compatible).
 * Fallback: any other OpenAI-compatible endpoint (e.g. Anthropic's).
 * Swapping gateway or models is a config change, never a code change.
 */

export type AiTask = "agent" | "vision" | "fast";

const TASK_ENV: Record<AiTask, string> = {
  agent: "AI_MODEL_AGENT",
  vision: "AI_MODEL_VISION",
  fast: "AI_MODEL_FAST",
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var ${name}`);
  return value;
}

const primary = () =>
  createOpenAICompatible({
    name: "dgrid",
    baseURL: required("AI_BASE_URL"),
    apiKey: required("AI_API_KEY"),
  });

const fallback = () =>
  process.env.AI_FALLBACK_BASE_URL && process.env.AI_FALLBACK_API_KEY
    ? createOpenAICompatible({
        name: "fallback",
        baseURL: process.env.AI_FALLBACK_BASE_URL,
        apiKey: process.env.AI_FALLBACK_API_KEY,
      })
    : null;

/** True when a model for this task is configured, so features can degrade gracefully without AI keys. */
export function aiConfigured(task: AiTask): boolean {
  return Boolean(process.env.AI_BASE_URL && process.env.AI_API_KEY && process.env[TASK_ENV[task]]);
}

export function getModel(task: AiTask): LanguageModel {
  return primary()(required(TASK_ENV[task]));
}

export function getFallbackModel(task: AiTask): LanguageModel | null {
  const provider = fallback();
  const modelId =
    process.env[`AI_FALLBACK_${TASK_ENV[task]}`] ?? process.env.AI_FALLBACK_MODEL;
  return provider && modelId ? provider(modelId) : null;
}

/** Run an AI call on the primary model; retry once on the fallback if it fails. */
export async function withFallback<T>(
  task: AiTask,
  run: (model: LanguageModel) => Promise<T>,
): Promise<T> {
  try {
    return await run(getModel(task));
  } catch (err) {
    const backup = getFallbackModel(task);
    if (!backup) throw err;
    console.warn(`[ai] primary ${task} model failed, using fallback:`, err);
    return run(backup);
  }
}
