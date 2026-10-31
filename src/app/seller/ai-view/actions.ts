"use server";

import { aiConfigured } from "@/lib/ai";
import { requireSeller } from "@/lib/seller-session";
import { askSeller } from "@/lib/shop";

export type AskState = { question: string; answer: string } | { error: string } | null;

/** Ask the shop a question exactly the way an assistant does through the MCP tool ask_seller. */
export async function askAsShopper(_prev: AskState, form: FormData): Promise<AskState> {
  const seller = await requireSeller();
  const question = String(form.get("question") ?? "").trim().slice(0, 300);
  if (question.length < 3) return { error: "Type a question first." };
  if (!aiConfigured("fast")) return { error: "No AI model is configured, so assistants get your raw facts instead." };
  try {
    const { answer } = await askSeller(seller, question);
    return { question, answer: answer ?? "No answer." };
  } catch (err) {
    console.error("[ai-view] ask failed:", err);
    return { error: "The model didn't answer. Try again in a moment." };
  }
}
