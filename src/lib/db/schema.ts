import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/** AgentShelf data model. Money is always integer cents (USD). */

export const channel = pgEnum("channel", ["ai_agent", "human"]);

export const orderStatus = pgEnum("order_status", [
  "created", // PayPal order exists, buyer hasn't approved
  "approved", // buyer approved, not captured yet
  "paid", // captured
  "shipped",
  "refunded",
  "partially_refunded",
  "disputed",
  "cancelled",
]);

export const actionStatus = pgEnum("action_status", [
  "auto", // agent did it within the seller's rules
  "pending_approval", // waiting for the seller
  "approved", // seller approved, then executed
  "rejected", // seller said no
  "blocked", // a guardrail refused it outright
  "failed", // PayPal or the model returned an error
]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
};

export const sellers = pgTable("sellers", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  tagline: text("tagline"),
  ownerName: text("owner_name"),
  /** Refunds at or under this amount run automatically; above it they wait for approval. */
  refundAutoLimitCents: integer("refund_auto_limit_cents").notNull().default(3000),
  /** Free-text policy the agent and `ask_seller` read (shipping times, returns, materials). */
  policy: text("policy"),
  ...timestamps,
});

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => sellers.id, { onDelete: "cascade" }),
    /** Set once the product is created in the seller's PayPal catalog. */
    paypalProductId: text("paypal_product_id"),
    title: text("title").notNull(),
    description: text("description").notNull(),
    attributes: jsonb("attributes").$type<Record<string, string>>().notNull().default({}),
    priceCents: integer("price_cents").notNull(),
    imageUrl: text("image_url"),
    stock: integer("stock").notNull().default(0),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [index("products_seller_idx").on(t.sellerId)],
);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => sellers.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    quantity: integer("quantity").notNull().default(1),
    paypalOrderId: text("paypal_order_id").unique(),
    captureId: text("capture_id"),
    channel: channel("channel").notNull(),
    /** Which assistant placed it ("Claude", "ChatGPT"), for AI-channel orders. */
    agentName: text("agent_name"),
    buyerName: text("buyer_name"),
    buyerEmail: text("buyer_email"),
    amountCents: integer("amount_cents").notNull(),
    refundedCents: integer("refunded_cents").notNull().default(0),
    status: orderStatus("status").notNull().default("created"),
    carrier: text("carrier"),
    trackingNumber: text("tracking_number"),
    /** Seeded history with no real PayPal records behind it. The agent must never act on these. */
    demo: boolean("demo").notNull().default(false),
    ...timestamps,
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("orders_seller_created_idx").on(t.sellerId, t.createdAt)],
);

export const agentActions = pgTable(
  "agent_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => sellers.id, { onDelete: "cascade" }),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    tool: text("tool").notNull(),
    input: jsonb("input").$type<unknown>(),
    output: jsonb("output").$type<unknown>(),
    status: actionStatus("status").notNull(),
    /** The agent's one-line explanation, shown in the action log and approval queue. */
    reason: text("reason"),
    ...timestamps,
  },
  (t) => [index("agent_actions_seller_created_idx").on(t.sellerId, t.createdAt)],
);

export const disputes = pgTable("disputes", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  paypalDisputeId: text("paypal_dispute_id").unique(),
  reason: text("reason"),
  status: text("status").notNull(),
  amountCents: integer("amount_cents"),
  /** When the seller must respond in PayPal; drives the "disputes due soon" countdown. */
  responseDueAt: timestamp("response_due_at", { withTimezone: true }),
  aiRecommendation: text("ai_recommendation"),
  ...timestamps,
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Every PayPal webhook we accepted, keyed by PayPal's event id so redeliveries are skipped. */
export const webhookEvents = pgTable("webhook_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  resourceId: text("resource_id"),
  /** What the handler did, in a few words ("order paid", "ignored: unknown order"). */
  outcome: text("outcome"),
  payload: jsonb("payload").$type<unknown>().notNull(),
  ...timestamps,
});

export type Seller = typeof sellers.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type AgentAction = typeof agentActions.$inferSelect;
export type Dispute = typeof disputes.$inferSelect;
export type WebhookEvent = typeof webhookEvents.$inferSelect;
