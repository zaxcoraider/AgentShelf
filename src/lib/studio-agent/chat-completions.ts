import type { AgAiConversationItem, AgAiEvent, AgAiOutputItem, AgLlmRequest, AgLlmResponse } from "ag-studio";

/**
 * Translates AG Studio's LLM turn (AgLlmRequest, Responses-style items) into an OpenAI-compatible
 * chat completions call, and the streamed reply back into AG-UI events + a final AgLlmResponse.
 * Server-only: the provider key never reaches the browser. Works with any OpenAI-compatible gateway
 * (Nebius Token Factory today, the fallback gateway when configured).
 */

type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ChatToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };
type ChatToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };

export type Provider = { baseURL: string; apiKey: string; model: string };

const textOf = (parts: { type: string; text?: string }[]) =>
  parts
    .map((p) => (p.type === "text" ? (p.text ?? "") : ""))
    .filter(Boolean)
    .join("\n");

export function toChatMessages(request: AgLlmRequest): ChatMessage[] {
  const messages: ChatMessage[] = [];
  if (request.instructions) messages.push({ role: "system", content: request.instructions });

  const answered = new Set(
    request.input.filter((i) => i.type === "function_call_output").map((i) => (i as { callId: string }).callId),
  );
  const lastAssistant = () => {
    const last = messages[messages.length - 1];
    return last?.role === "assistant" ? last : null;
  };

  for (const item of request.input as AgAiConversationItem[]) {
    switch (item.type) {
      case "message":
        if (item.role === "assistant") {
          messages.push({ role: "assistant", content: textOf(item.content as { type: string; text?: string }[]) });
        } else {
          messages.push({ role: item.role, content: textOf(item.content) });
        }
        break;
      case "function_call": {
        const call: ChatToolCall = {
          id: item.callId,
          type: "function",
          function: { name: item.name, arguments: item.arguments || "{}" },
        };
        const prev = lastAssistant();
        if (prev) prev.tool_calls = [...(prev.tool_calls ?? []), call];
        else messages.push({ role: "assistant", content: null, tool_calls: [call] });
        // A call carrying its own result (no separate output item) still needs a tool message.
        if (!answered.has(item.callId) && item.result != null) {
          messages.push({ role: "tool", tool_call_id: item.callId, content: item.result });
        }
        break;
      }
      case "function_call_output":
        messages.push({ role: "tool", tool_call_id: item.callId, content: item.output });
        break;
      case "reasoning":
        break; // Reasoning stays on screen; providers don't take it back as input.
    }
  }

  // Chat completions rejects an assistant tool call with no answer; close any the run abandoned.
  const replied = new Set(messages.flatMap((m) => (m.role === "tool" ? [m.tool_call_id] : [])));
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role !== "assistant" || !m.tool_calls) continue;
    const missing = m.tool_calls.filter((c) => !replied.has(c.id));
    let at = i + 1;
    while (messages[at]?.role === "tool") at++;
    messages.splice(at, 0, ...missing.map((c) => ({ role: "tool" as const, tool_call_id: c.id, content: "No result." })));
  }
  return messages;
}

export function toChatBody(request: AgLlmRequest, model: string) {
  const tools = request.tools
    ?.filter((t) => t.kind !== "provided")
    .map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } }));
  const choice = request.toolChoice;
  return {
    model,
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: 4096,
    messages: toChatMessages(request),
    ...(tools?.length
      ? {
          tools,
          tool_choice:
            typeof choice === "object" ? { type: "function", function: { name: choice.name } } : (choice ?? "auto"),
        }
      : {}),
    ...(request.responseFormat?.type === "json"
      ? {
          response_format: {
            type: "json_schema",
            json_schema: { name: request.responseFormat.name, schema: request.responseFormat.schema },
          },
        }
      : {}),
  };
}

type Delta = {
  content?: string | null;
  reasoning_content?: string | null;
  reasoning?: string | null;
  tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[];
};
type Chunk = {
  id?: string;
  model?: string;
  choices?: { delta?: Delta; finish_reason?: string | null }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null;
};

/** Reads an OpenAI-style SSE body, yields AG-UI events, and returns the consolidated response. */
export async function* translateStream(
  body: ReadableStream<Uint8Array>,
  model: string,
): AsyncGenerator<AgAiEvent, AgLlmResponse> {
  const id = crypto.randomUUID();
  const createdAt = Date.now();
  let text: { id: string; value: string } | null = null;
  let reasoning: { id: string; value: string; open: boolean } | null = null;
  const calls = new Map<number, { id: string; callId: string; name: string; args: string }>();
  let usage: AgLlmResponse["usage"];
  let finish: string | null | undefined;
  let reportedModel = model;

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const data = line.trim();
      if (!data.startsWith("data:")) continue;
      const payload = data.slice(5).trim();
      if (payload === "[DONE]") continue;
      let chunk: Chunk;
      try {
        chunk = JSON.parse(payload);
      } catch {
        continue;
      }
      if (chunk.model) reportedModel = chunk.model;
      if (chunk.usage) {
        usage = {
          inputTokens: chunk.usage.prompt_tokens ?? 0,
          outputTokens: chunk.usage.completion_tokens ?? 0,
          totalTokens: chunk.usage.total_tokens,
        };
      }
      const choice = chunk.choices?.[0];
      if (!choice) continue;
      if (choice.finish_reason) finish = choice.finish_reason;
      const delta = choice.delta ?? {};

      const think = delta.reasoning_content ?? delta.reasoning;
      if (think) {
        if (!reasoning) {
          reasoning = { id: crypto.randomUUID(), value: "", open: true };
          yield { type: "REASONING_MESSAGE_START", messageId: reasoning.id, role: "reasoning" };
        }
        reasoning.value += think;
        yield { type: "REASONING_MESSAGE_CONTENT", messageId: reasoning.id, delta: think };
      }
      if (delta.content) {
        if (reasoning?.open) {
          reasoning.open = false;
          yield { type: "REASONING_MESSAGE_END", messageId: reasoning.id };
        }
        if (!text) {
          text = { id: crypto.randomUUID(), value: "" };
          yield { type: "TEXT_MESSAGE_START", messageId: text.id, role: "assistant" };
        }
        text.value += delta.content;
        yield { type: "TEXT_MESSAGE_CONTENT", messageId: text.id, delta: delta.content };
      }
      for (const tc of delta.tool_calls ?? []) {
        let call = calls.get(tc.index);
        if (!call) {
          if (reasoning?.open) {
            reasoning.open = false;
            yield { type: "REASONING_MESSAGE_END", messageId: reasoning.id };
          }
          call = { id: crypto.randomUUID(), callId: tc.id ?? crypto.randomUUID(), name: tc.function?.name ?? "", args: "" };
          calls.set(tc.index, call);
          yield { type: "TOOL_CALL_START", toolCallId: call.callId, toolCallName: call.name, parentMessageId: text?.id };
        } else if (tc.function?.name && !call.name) {
          call.name = tc.function.name;
        }
        if (tc.function?.arguments) {
          call.args += tc.function.arguments;
          yield { type: "TOOL_CALL_ARGS", toolCallId: call.callId, delta: tc.function.arguments };
        }
      }
    }
  }

  if (reasoning?.open) yield { type: "REASONING_MESSAGE_END", messageId: reasoning.id };
  if (text) yield { type: "TEXT_MESSAGE_END", messageId: text.id };
  for (const call of calls.values()) yield { type: "TOOL_CALL_END", toolCallId: call.callId };

  const output: AgAiOutputItem[] = [];
  if (reasoning) {
    output.push({ id: reasoning.id, kind: "output", type: "reasoning", summary: [], content: [{ type: "text", text: reasoning.value }] });
  }
  if (text) {
    output.push({
      id: text.id,
      kind: "output",
      type: "message",
      role: "assistant",
      status: "completed",
      content: [{ type: "text", text: text.value, annotations: [] }],
    });
  }
  for (const call of calls.values()) {
    output.push({
      id: call.id,
      kind: "output",
      type: "function_call",
      callId: call.callId,
      name: call.name,
      arguments: call.args || "{}",
      status: "completed",
    });
  }
  return {
    id,
    createdAt,
    output,
    status: finish === "length" ? "incomplete" : "completed",
    incompleteDetails: finish === "length" ? { reason: "max_output_tokens" } : undefined,
    usage,
    model: reportedModel,
  };
}

export function failedResponse(code: string, message: string): AgLlmResponse {
  return { id: crypto.randomUUID(), createdAt: Date.now(), output: [], status: "failed", error: { code, message } };
}
