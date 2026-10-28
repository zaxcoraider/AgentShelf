/**
 * AI agent + PayPal Agent Toolkit: the model creates a catalog product in the sandbox.
 * Run: npm run smoke:agent
 */
import { generateText, stepCountIs } from "ai";
import { getModel } from "../src/lib/ai";
import { paypalTools } from "../src/lib/paypal/toolkit";

const { text, steps } = await generateText({
  model: getModel("agent"),
  tools: paypalTools(),
  stopWhen: stepCountIs(5),
  system: "You are the seller agent for Maya's Candles. Use PayPal tools to act; be brief.",
  prompt:
    "Create a PayPal catalog product: 'Lavender Soy Candle', type PHYSICAL, category HOME_GOODS, " +
    "description 'Hand-poured 8oz soy candle with lavender essential oil.' Then tell me its product ID.",
});

for (const step of steps) {
  for (const call of step.toolCalls) console.log("→ tool:", call.toolName, JSON.stringify(call.input));
  for (const res of step.toolResults) console.log("← result:", JSON.stringify(res.output).slice(0, 300));
}
console.log("\nAgent:", text);
