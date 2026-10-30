"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { ActionError, approveAction, markShipped, rejectAction } from "@/lib/agent/actions";
import { runSellerAgent } from "@/lib/agent/seller-agent";
import { aiConfigured } from "@/lib/ai";
import { db, schema } from "@/lib/db";
import { CARRIERS, type Carrier } from "@/lib/paypal/client";
import { currentSeller } from "@/lib/seller";

export type FormState = { ok: boolean; message: string } | null;

/** Run a seller action, turning expected failures into a message for the form. */
async function respond(run: () => Promise<{ message: string; action: { status: string } }>): Promise<FormState> {
  try {
    const result = await run();
    revalidatePath("/seller/inbox");
    return { ok: result.action.status !== "failed" && result.action.status !== "blocked", message: result.message };
  } catch (err) {
    if (err instanceof ActionError) return { ok: false, message: err.message };
    console.error("[inbox] action failed:", err);
    return { ok: false, message: "Something went wrong. Nothing was changed." };
  }
}

async function ownAction(actionId: string) {
  const seller = await currentSeller();
  const action = await db.query.agentActions.findFirst({
    where: and(eq(schema.agentActions.id, actionId), eq(schema.agentActions.sellerId, seller.id)),
  });
  if (!action) throw new ActionError("That request no longer exists.");
  return action;
}

export async function approve(_prev: FormState, form: FormData): Promise<FormState> {
  return respond(async () => approveAction((await ownAction(String(form.get("actionId")))).id));
}

export async function reject(_prev: FormState, form: FormData): Promise<FormState> {
  return respond(async () => rejectAction((await ownAction(String(form.get("actionId")))).id, "Seller declined"));
}

export async function ship(_prev: FormState, form: FormData): Promise<FormState> {
  const orderId = String(form.get("orderId"));
  const carrier = String(form.get("carrier")) as Carrier;
  const trackingNumber = String(form.get("trackingNumber") ?? "").trim();
  if (!(carrier in CARRIERS)) return { ok: false, message: "Pick a carrier." };
  if (!/^[A-Za-z0-9]{8,40}$/.test(trackingNumber)) return { ok: false, message: "Enter a valid tracking number." };

  return respond(async () => {
    const seller = await currentSeller();
    const order = await db.query.orders.findFirst({
      where: and(eq(schema.orders.id, orderId), eq(schema.orders.sellerId, seller.id)),
    });
    if (!order) throw new ActionError("That order no longer exists.");
    return markShipped(order.id, { carrier, trackingNumber }, `${seller.ownerName ?? "Seller"} marked the order shipped.`);
  });
}

export type AgentState = { ok: boolean; text: string; tools: string[] } | null;

/** The seller gives the agent an instruction in plain English. */
export async function askAgent(_prev: AgentState, form: FormData): Promise<AgentState> {
  const task = String(form.get("task") ?? "").trim().slice(0, 1000);
  if (task.length < 3) return { ok: false, text: "Tell the agent what to do.", tools: [] };
  if (!aiConfigured("agent")) return { ok: false, text: "No AI model is configured yet (AI_MODEL_AGENT).", tools: [] };
  try {
    const run = await runSellerAgent(await currentSeller(), task);
    revalidatePath("/seller/inbox");
    return { ok: true, text: run.text || "Done.", tools: run.steps.map((s) => s.tool) };
  } catch (err) {
    console.error("[inbox] agent run failed:", err);
    return { ok: false, text: "The agent couldn't finish. Nothing past the last logged action was done.", tools: [] };
  }
}
