import type { AgReportState } from "ag-studio";

/**
 * The dashboard's starting layout. The seller can rearrange it in Studio's edit mode, and the
 * Studio agents can add to it. Widget types and data mappings follow the AG Studio 3 widget catalogue;
 * the 24-column grid puts four KPI tiles across the top.
 */

const title = (text: string) => ({ title: { enabled: true, text } });
const withLegend = (text: string) => ({
  ...title(text),
  style: { theme: { common: { legend: { enabled: true, position: "bottom" as const } } } },
});
const newestFirst = (id: string) => [{ field: { id }, direction: "desc" as const }];

export const initialReport: AgReportState = {
  pages: [
    {
      id: "overview",
      widgets: {
        "kpi-net": {
          type: "value",
          dataMapping: { value: [{ id: "orders.net", aggregation: "sum" }] },
          format: title("Net sales"),
        },
        "kpi-orders": {
          type: "value",
          dataMapping: { value: [{ id: "orders.orderCount", aggregation: "sum" }] },
          format: title("Orders"),
        },
        "kpi-ai-share": {
          type: "value",
          dataMapping: { value: [{ id: "orders.aiOrder", aggregation: "avg" }] },
          format: title("Bought by AI assistants"),
        },
        "kpi-disputes": {
          type: "value",
          dataMapping: { value: [{ id: "disputes.openDispute", aggregation: "sum" }] },
          format: title("Open disputes"),
        },
        "sales-by-day": {
          type: "column-chart-stacked",
          dataMapping: {
            categoryKey: [{ id: "orders.orderDate" }],
            valueKey: [{ id: "orders.net", aggregation: "sum" }],
            legendKey: [{ id: "orders.channel" }],
            tooltipKey: [],
          },
          format: withLegend("Sales by day: AI assistants vs storefront"),
        },
        "by-assistant": {
          type: "donut-chart",
          dataMapping: {
            categoryKey: [{ id: "orders.assistant" }],
            valueKey: [{ id: "orders.net", aggregation: "sum" }],
            tooltipKey: [],
          },
          format: title("Where sales come from"),
        },
        "by-product": {
          type: "bar-chart-grouped",
          dataMapping: {
            categoryKey: [{ id: "products.product" }],
            valueKey: [{ id: "orders.net", aggregation: "sum" }],
            tooltipKey: [],
          },
          format: title("Net sales by product"),
        },
        "agent-actions": {
          type: "grid",
          dataMapping: {
            cols: [
              { id: "agentActions.at" },
              { id: "agentActions.action" },
              { id: "agentActions.outcome" },
              { id: "agentActions.amount" },
              { id: "agentActions.reason" },
            ],
          },
          sort: newestFirst("agentActions.at"),
          format: title("What your agent did"),
        },
        orders: {
          type: "grid",
          dataMapping: {
            cols: [
              { id: "orders.placedAt" },
              { id: "products.product" },
              { id: "orders.assistant" },
              { id: "orders.buyer" },
              { id: "orders.status" },
              { id: "orders.net" },
              { id: "orders.origin" },
            ],
          },
          sort: newestFirst("orders.placedAt"),
          format: title("Orders"),
        },
      },
      widgetLayout: {
        "kpi-net": { xTrack: 0, yTrack: 0, xSpan: 6, ySpan: 7 },
        "kpi-orders": { xTrack: 6, yTrack: 0, xSpan: 6, ySpan: 7 },
        "kpi-ai-share": { xTrack: 12, yTrack: 0, xSpan: 6, ySpan: 7 },
        "kpi-disputes": { xTrack: 18, yTrack: 0, xSpan: 6, ySpan: 7 },
        "sales-by-day": { xTrack: 0, yTrack: 7, xSpan: 16, ySpan: 16 },
        "by-assistant": { xTrack: 16, yTrack: 7, xSpan: 8, ySpan: 16 },
        "by-product": { xTrack: 0, yTrack: 23, xSpan: 10, ySpan: 16 },
        "agent-actions": { xTrack: 10, yTrack: 23, xSpan: 14, ySpan: 16 },
        orders: { xTrack: 0, yTrack: 39, xSpan: 24, ySpan: 16 },
      },
    },
  ],
  selectedPageId: "overview",
  panels: { filters: { collapsed: true }, edit: { collapsed: true } },
};
