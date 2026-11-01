import { and, eq, notInArray } from "drizzle-orm";
import { db, schema } from "./db";
import { disputeDueAt } from "./disputes";
import type { Seller } from "./db/schema";
import { ACTION_STATUS_LABEL, DISPUTE_REASON, ORDER_STATUS_LABEL, TOOL_LABEL } from "./labels";

/**
 * The seller dashboard's data, shaped for AG Studio: one table per thing the seller cares about,
 * plain rows with readable labels, and relationships so a filter on one table (say, "Claude")
 * narrows every widget. Field ids are stable; names are what the seller sees.
 */

const DAY = 24 * 60 * 60 * 1000;
const dollars = (cents: number) => Math.round(cents) / 100;
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

const currency = { format: "currencyFormat", formatOptions: { format: "$#,##0.00" } } as const;
const text = { format: "textFormat" } as const;
const hidden = { format: "textFormat", hide: true } as const;

// Orders that never became a payment (abandoned or cancelled checkouts) aren't sales.
const NOT_SALES = ["created", "approved", "cancelled"] as const;

export type DashboardData = Awaited<ReturnType<typeof dashboardData>>;

export async function dashboardData(seller: Seller, now = Date.now()) {
  const [orders, products, actions, disputes] = await Promise.all([
    db.query.orders.findMany({
      where: and(eq(schema.orders.sellerId, seller.id), notInArray(schema.orders.status, [...NOT_SALES])),
    }),
    db.query.products.findMany({ where: eq(schema.products.sellerId, seller.id) }),
    db.query.agentActions.findMany({ where: eq(schema.agentActions.sellerId, seller.id) }),
    db
      .select({ dispute: schema.disputes, demo: schema.orders.demo })
      .from(schema.disputes)
      .innerJoin(schema.orders, eq(schema.disputes.orderId, schema.orders.id))
      .where(eq(schema.orders.sellerId, seller.id)),
  ]);
  const orderIds = new Set(orders.map((o) => o.id));

  return {
    sources: [
      {
        id: "orders",
        name: "Orders",
        description:
          "One row per paid order (abandoned checkouts excluded). Status: Paid = paid and waiting to ship; Shipped = sent with tracking; Refunded / Partly refunded; Disputed = buyer opened a PayPal dispute.",
        data: orders.map((o) => ({
          orderId: o.id,
          productId: o.productId,
          placedAt: o.createdAt.toISOString(),
          orderDate: isoDate(o.createdAt),
          channel: o.channel === "ai_agent" ? "AI assistant" : "Storefront",
          assistant: o.channel === "ai_agent" ? (o.agentName ?? "AI assistant") : "Storefront",
          buyer: o.buyerName ?? "Unknown",
          status: ORDER_STATUS_LABEL[o.status],
          quantity: o.quantity,
          gross: dollars(o.amountCents),
          refunded: dollars(o.refundedCents),
          net: dollars(o.amountCents - o.refundedCents),
          // For KPI tiles: avg(aiOrder) is the share of orders placed by AI, sum(orderCount) the order count.
          aiOrder: o.channel === "ai_agent" ? 1 : 0,
          orderCount: 1,
          origin: o.demo ? "Seeded history" : "Live PayPal sandbox",
        })),
        fields: [
          { id: "orderId", ...hidden },
          { id: "productId", ...hidden },
          { id: "placedAt", name: "Placed at", format: "dateTimeFormat" },
          { id: "orderDate", name: "Order date", format: "dateFormat" },
          { id: "channel", name: "Channel", description: "Who placed the order: AI assistant or Storefront (a person on the website).", ...text },
          { id: "assistant", name: "Bought via", ...text },
          { id: "buyer", name: "Buyer", ...text },
          {
            id: "status",
            name: "Status",
            description: "Paid (waiting to ship), Shipped, Refunded, Partly refunded, or Disputed. Orders still to ship are exactly status = Paid.",
            ...text,
          },
          { id: "quantity", name: "Quantity", format: "integerFormat" },
          { id: "gross", name: "Gross sales", ...currency },
          { id: "refunded", name: "Refunded", description: "Total refunded on this order so far, whenever it happened (not by refund date).", ...currency },
          { id: "net", name: "Net sales", ...currency },
          { id: "aiOrder", name: "AI share", format: "percentageFormat" },
          { id: "orderCount", name: "Orders", format: "integerFormat" },
          { id: "origin", name: "Data origin", ...text },
        ],
      },
      {
        id: "products",
        name: "Products",
        data: products.map((p) => ({
          productId: p.id,
          product: p.title,
          scent: p.attributes.scent ?? null,
          price: dollars(p.priceCents),
          stock: p.stock,
          active: p.active,
          inPayPalCatalog: Boolean(p.paypalProductId),
        })),
        fields: [
          { id: "productId", ...hidden },
          { id: "product", name: "Product", ...text },
          { id: "scent", name: "Scent", ...text },
          { id: "price", name: "Price", ...currency },
          { id: "stock", name: "Stock", format: "integerFormat" },
          { id: "active", name: "On sale", format: "booleanFormat" },
          { id: "inPayPalCatalog", name: "In PayPal catalog", format: "booleanFormat" },
        ],
      },
      {
        id: "agentActions",
        name: "Agent actions",
        description:
          "Everything the PayPal seller agent did or tried: refunds, shipment tracking, dispute reviews, each with an outcome and the agent's reason. A refund's amount is in Amount; its date is When.",
        data: actions.map((a) => {
          const input = (a.input ?? {}) as { amountCents?: number };
          return {
            actionId: a.id,
            // Only link to orders the dashboard shows, so the join never points nowhere.
            orderId: a.orderId && orderIds.has(a.orderId) ? a.orderId : null,
            at: a.createdAt.toISOString(),
            actionDate: isoDate(a.createdAt),
            action: TOOL_LABEL[a.tool] ?? a.tool,
            outcome: ACTION_STATUS_LABEL[a.status],
            amount: typeof input.amountCents === "number" ? dollars(input.amountCents) : null,
            reason: a.reason ?? "",
          };
        }),
        fields: [
          { id: "actionId", ...hidden },
          { id: "orderId", ...hidden },
          { id: "at", name: "When", format: "dateTimeFormat" },
          { id: "actionDate", name: "Action date", format: "dateFormat" },
          { id: "action", name: "Action", ...text },
          {
            id: "outcome",
            name: "Outcome",
            description: "Done by agent (within the seller's rules), Needs you (waiting for approval in the Inbox), Approved, Rejected, Blocked by rule, or Failed.",
            ...text,
          },
          { id: "amount", name: "Amount", ...currency },
          { id: "reason", name: "Agent's reason", ...text },
        ],
      },
      {
        id: "disputes",
        name: "Disputes",
        description: "PayPal disputes buyers opened. Open ones have a seller-response deadline (Respond by); missing it loses the dispute.",
        data: disputes.map(({ dispute: d, demo }) => {
          const dueAt = disputeDueAt(d.responseDueAt, demo, now);
          return {
          disputeId: d.id,
          orderId: orderIds.has(d.orderId) ? d.orderId : null,
          reason: DISPUTE_REASON[d.reason ?? ""] ?? "Buyer opened a dispute",
          status: d.status === "RESOLVED" ? "Resolved" : "Open",
          openDispute: d.status === "RESOLVED" ? 0 : 1,
          amount: d.amountCents != null ? dollars(d.amountCents) : null,
          dueAt: dueAt?.toISOString() ?? null,
          dueDate: dueAt ? isoDate(dueAt) : null,
          daysLeft: dueAt ? Math.ceil((dueAt.getTime() - now) / DAY) : null,
          recommendation: d.aiRecommendation ?? "",
          };
        }),
        fields: [
          { id: "disputeId", ...hidden },
          { id: "orderId", ...hidden },
          { id: "reason", name: "Reason", ...text },
          { id: "status", name: "Status", ...text },
          { id: "openDispute", name: "Open disputes", format: "integerFormat" },
          { id: "amount", name: "Amount", ...currency },
          { id: "dueAt", name: "Respond by (time)", format: "dateTimeFormat" },
          { id: "dueDate", name: "Respond by", format: "dateFormat" },
          { id: "daysLeft", name: "Days left", format: "integerFormat" },
          { id: "recommendation", name: "Agent's recommendation", ...text },
        ],
      },
    ],
    relationships: [
      rel("orders", "productId", "products", "productId"),
      rel("agentActions", "orderId", "orders", "orderId"),
      rel("disputes", "orderId", "orders", "orderId"),
    ],
  };
}

function rel(sourceTable: string, sourceField: string, targetTable: string, targetField: string) {
  return {
    id: `${sourceTable}-${targetTable}`,
    source: { tableId: sourceTable, fieldId: sourceField },
    target: { tableId: targetTable, fieldId: targetField },
    type: "many-to-one" as const,
  };
}
