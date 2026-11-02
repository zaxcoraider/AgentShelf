import type { AgLlmRequest, AgLlmResponse } from "ag-studio";
import { sessionSeller } from "@/lib/seller-session";
import { failedResponse, toChatBody, translateStream, type Provider } from "@/lib/studio-agent/chat-completions";
import { studioProviders, type StudioModelSlot } from "@/lib/studio-agent/models";
import { takeAiCall } from "@/lib/rate-limit";

/**
 * LLM proxy for the AG Studio dashboard's agents. The browser adapter posts one AgLlmRequest;
 * we call the gateway server-side (key never leaves the server) and stream back NDJSON:
 * one AG-UI event per line, then a final {"type":"COMPLETE","response":AgLlmResponse}.
 * If the chosen model fails before answering, the other configured model takes the turn.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_BODY_BYTES = 600_000;

async function open(provider: Provider, request: AgLlmRequest, signal: AbortSignal) {
  const res = await fetch(new URL("chat/completions", provider.baseURL.replace(/\/?$/, "/")), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${provider.apiKey}` },
    body: JSON.stringify(toChatBody(request, provider.model)),
    signal,
  });
  if (!res.ok || !res.body) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    throw new Error(`${provider.model} answered ${res.status}: ${detail}`);
  }
  return res.body;
}

export async function POST(req: Request) {
  const seller = await sessionSeller();
  if (!seller) return Response.json({ error: "Sign in first." }, { status: 401 });
  const allowed = takeAiCall("studio", seller.id);
  if (!allowed.ok) {
    return Response.json({ error: allowed.message }, { status: 429, headers: { "Retry-After": String(allowed.retryAfterSec) } });
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return Response.json({ error: "Conversation too long. Start a new chat." }, { status: 413 });
  let request: AgLlmRequest;
  try {
    request = JSON.parse(raw);
    if (!Array.isArray(request.input)) throw new Error("no input");
  } catch {
    return Response.json({ error: "Expected an AgLlmRequest." }, { status: 400 });
  }

  const providers = studioProviders();
  const chosen = (request.model?.id as StudioModelSlot | undefined) ?? "primary";
  const order = [chosen, chosen === "primary" ? "fallback" : "primary"]
    .map((slot) => providers[slot as StudioModelSlot])
    .filter((p): p is Provider => Boolean(p));
  if (!order.length) return Response.json({ error: "The dashboard assistant has no AI model configured." }, { status: 503 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let sent = false;
      const send = (obj: unknown) => {
        sent = true;
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      };
      let response: AgLlmResponse | undefined;
      let lastError = "";
      for (const provider of order) {
        try {
          const body = await open(provider, request, req.signal);
          const events = translateStream(body, provider.model);
          for (;;) {
            const next = await events.next();
            if (next.done) {
              response = next.value;
              break;
            }
            send(next.value);
          }
          break;
        } catch (err) {
          if (req.signal.aborted) break;
          lastError = err instanceof Error ? err.message : String(err);
          console.warn("[studio llm]", lastError);
          // Once events reached the browser the turn can't be replayed on another model.
          if (sent) break;
        }
      }
      send({
        type: "COMPLETE",
        response: response ?? failedResponse(req.signal.aborted ? "cancelled" : "provider_error", req.signal.aborted ? "Cancelled." : "The AI model didn't answer. Try again in a moment."),
      });
      if (!response && lastError) console.error("[studio llm] all models failed:", lastError);
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
