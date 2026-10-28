/**
 * Day-1 check that the AI gateway supports everything AgentShelf needs.
 * Run: npm run smoke:ai
 */
import { generateText, Output, stepCountIs, streamText, tool } from "ai";
import { z } from "zod";
import { getModel, type AiTask } from "../src/lib/ai";

const IMAGE_URL =
  process.argv[2] ??
  "https://upload.wikimedia.org/wikipedia/commons/thumb/4/45/Candle_flame_%281%29.jpg/480px-Candle_flame_%281%29.jpg";

async function check(name: string, task: AiTask, fn: () => Promise<string>) {
  const started = Date.now();
  try {
    const detail = await fn();
    console.log(`✅ ${name} [${task}] ${Date.now() - started}ms — ${detail}`);
    return true;
  } catch (err) {
    console.log(`❌ ${name} [${task}] — ${err instanceof Error ? err.message : err}`);
    return false;
  }
}

const results = [
  await check("text", "fast", async () => {
    const { text } = await generateText({ model: getModel("fast"), prompt: "Reply with exactly: pong" });
    return text.trim();
  }),

  await check("streaming", "agent", async () => {
    const result = streamText({ model: getModel("agent"), prompt: "Count from 1 to 5, comma separated." });
    let chunks = 0;
    for await (const chunk of result.textStream) if (chunk) chunks++;
    return `${chunks} chunks: ${(await result.text).trim()}`;
  }),

  await check("structured output", "fast", async () => {
    const { output } = await generateText({
      model: getModel("fast"),
      output: Output.object({
        schema: z.object({ channel: z.enum(["ai_agent", "human", "any"]), minAmount: z.number().nullable() }),
      }),
      prompt: "Turn this into a filter: orders from AI shoppers over $20",
    });
    return JSON.stringify(output);
  }),

  await check("tool calling", "agent", async () => {
    let called = false;
    const { text } = await generateText({
      model: getModel("agent"),
      tools: {
        get_refund_limit: tool({
          description: "Get the seller's automatic refund limit in USD",
          inputSchema: z.object({ sellerId: z.string() }),
          execute: async () => {
            called = true;
            return { limitUsd: 30 };
          },
        }),
      },
      stopWhen: stepCountIs(3),
      prompt: "Seller 'maya' got a refund request for $24. Can it be refunded automatically? Check the limit first.",
    });
    if (!called) throw new Error("model never called the tool");
    return text.trim().slice(0, 120);
  }),

  await check("vision", "vision", async () => {
    const { text } = await generateText({
      model: getModel("vision"),
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Describe this product photo in one short sentence." },
            { type: "image", image: new URL(IMAGE_URL) },
          ],
        },
      ],
    });
    return text.trim().slice(0, 120);
  }),
];

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
