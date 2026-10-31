import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * MCP App widget: product cards with a "Buy with PayPal" button, rendered inside Claude, ChatGPT,
 * and other hosts that support MCP Apps. Hosts without it get the tool's plain JSON instead.
 *
 * Runs in the host's sandboxed iframe, so: the ext-apps runtime is inlined (CDN scripts are blocked),
 * photos arrive as data URLs from the app-only get_product_photos tool, and links open via app.openLink.
 */

export const PRODUCT_WIDGET_URI = "ui://agentshelf/products.html";

let cached: string | undefined;

/** The widget page with the ext-apps browser bundle inlined as globalThis.ExtApps. */
export function productWidgetHtml() {
  if (cached) return cached;
  // Read from node_modules at runtime; next.config.ts traces this file into the server build.
  const file = path.join(process.cwd(), "node_modules/@modelcontextprotocol/ext-apps/dist/src/app-with-deps.js");
  const bundle = readFileSync(file, "utf8").replace(
    /export\{([^}]+)\};?\s*$/,
    (_, body: string) =>
      "globalThis.ExtApps={" +
      body
        .split(",")
        .map((pair) => {
          const [local, exported] = pair.split(" as ").map((s) => s.trim());
          return `${exported ?? local}:${local}`;
        })
        .join(",") +
      "};",
  );
  // Function replacer: the minified bundle is full of `$` sequences String.replace would interpret.
  cached = WIDGET.replace("/*__EXT_APPS_BUNDLE__*/", () => bundle);
  return cached;
}

const WIDGET = /* html */ `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light dark" />
<style>
  :root {
    --ink: var(--color-text-primary, #1c1917);
    --sub: var(--color-text-secondary, #78716c);
    --line: var(--color-border-default, rgba(28, 25, 23, 0.12));
    --card: rgba(28, 25, 23, 0.03);
    --ember: #d97706;
    --ok: #047857;
    --ok-bg: rgba(16, 185, 129, 0.12);
    --font: var(--font-sans, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif);
  }
  :root.dark {
    --ink: var(--color-text-primary, #faf7f2);
    --sub: var(--color-text-secondary, #a8a29e);
    --line: var(--color-border-default, rgba(250, 247, 242, 0.12));
    --card: rgba(250, 247, 242, 0.04);
    --ember: #f59e0b;
    --ok: #6ee7b7;
    --ok-bg: rgba(52, 211, 153, 0.12);
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: transparent; color: var(--ink); font: 14px/1.45 var(--font); }
  .shop { display: flex; align-items: center; gap: 8px; padding: 4px 2px 10px; color: var(--sub); font-size: 12px; }
  .shop b { color: var(--ink); font-weight: 600; }
  .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--ember); }
  .row { display: flex; gap: 12px; overflow-x: auto; scroll-snap-type: x mandatory; padding-bottom: 6px; scrollbar-width: thin; }
  .card { flex: 0 0 232px; scroll-snap-align: start; display: flex; flex-direction: column; border: 1px solid var(--line); border-radius: 16px; background: var(--card); overflow: hidden; }
  .single .card { flex-basis: 100%; flex-direction: row; }
  .single .photo { width: 42%; aspect-ratio: auto; min-height: 220px; }
  .photo { position: relative; aspect-ratio: 4 / 3; background: linear-gradient(160deg, #2a231e, #17130f); overflow: hidden; }
  .photo img { width: 100%; height: 100%; object-fit: cover; display: block; opacity: 0; transition: opacity .35s; }
  .photo img.on { opacity: 1; }
  .photo svg { position: absolute; inset: 0; margin: auto; width: 44px; height: 44px; }
  .body { display: flex; flex: 1; flex-direction: column; gap: 6px; padding: 12px 14px 14px; min-width: 0; }
  .title { font-weight: 600; font-size: 14px; line-height: 1.3; }
  .meta { color: var(--sub); font-size: 12px; }
  .desc { color: var(--sub); font-size: 13px; display: none; }
  .single .desc { display: -webkit-box; -webkit-line-clamp: 5; -webkit-box-orient: vertical; overflow: hidden; }
  .price { display: flex; align-items: baseline; justify-content: space-between; margin-top: auto; padding-top: 6px; }
  .price strong { font-size: 18px; letter-spacing: -0.02em; }
  .stock { font-size: 11px; color: var(--sub); }
  .stock.low { color: var(--ember); }
  button.pay { margin-top: 8px; width: 100%; border: 0; border-radius: 999px; padding: 9px 12px; background: #ffc439; color: #142c8e; font: 600 13px var(--font); cursor: pointer; transition: filter .15s, transform .15s; }
  button.pay:hover { filter: brightness(0.96); }
  button.pay:active { transform: scale(0.98); }
  button.pay:disabled { cursor: default; opacity: .7; }
  .status { margin-top: 8px; font-size: 12px; color: var(--sub); display: none; }
  .status.show { display: block; }
  .status a { color: var(--ink); cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
  .paid { display: none; margin-top: 8px; padding: 8px 10px; border-radius: 10px; background: var(--ok-bg); color: var(--ok); font-size: 12px; font-weight: 600; }
  .paid.show { display: block; }
  .spin { display: inline-block; width: 10px; height: 10px; margin-right: 6px; border: 2px solid var(--ember); border-top-color: transparent; border-radius: 50%; animation: spin .8s linear infinite; vertical-align: -1px; }
  .empty, .error { color: var(--sub); padding: 12px 2px; }
  .fine { color: var(--sub); font-size: 11px; padding: 8px 2px 0; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .spin { animation: none; } .photo img { transition: none; } }
  @media (max-width: 460px) { .single .card { flex-direction: column; } .single .photo { width: 100%; min-height: 0; aspect-ratio: 4 / 3; } }
</style>
</head>
<body>
<div id="root"><div class="empty">Loading products…</div></div>
<script type="module">
/*__EXT_APPS_BUNDLE__*/
// Everything below lives in its own scope: the minified bundle above declares short top-level names too.
(async () => {
const { App, applyHostStyleVariables } = globalThis.ExtApps;

const CANDLE = '<svg viewBox="0 0 56 56" aria-hidden="true"><path d="M28 8c5 7 6 11 0 17-6-6-5-10 0-17Z" fill="#fcd34d"/><rect x="18" y="27" width="20" height="23" rx="4" fill="#faf7f2"/></svg>';
const root = document.getElementById("root");

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

function parse(result) {
  const text = result?.content?.find((c) => c.type === "text")?.text;
  if (!text) return undefined;
  try { return JSON.parse(text); } catch { return { error: text }; }
}

{
  const app = new App({ name: "AgentShelf products", version: "1.0.0" }, {}, { autoResize: true });

  function applyHost(ctx) {
    document.documentElement.classList.toggle("dark", ctx?.theme === "dark");
    if (ctx?.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
  }
  app.onhostcontextchanged = applyHost;

  app.ontoolresult = (result) => {
    const data = parse(result);
    if (!data || result.isError || data.error) {
      root.replaceChildren(el("div", "error", data?.error ?? "Couldn't load products."));
      return;
    }
    // Photographed products lead the row; the assistant still sees the shop's own order.
    const products = (data.products ?? [data]).slice().sort((a, b) => Number(!!b.imageUrl) - Number(!!a.imageUrl));
    render(products, data.shop);
  };

  function render(products, shop) {
    root.replaceChildren();
    if (shop) {
      const head = el("div", "shop");
      head.append(el("span", "dot"), el("b", null, shop), el("span", null, products.length + (products.length === 1 ? " product" : " products")));
      root.append(head);
    }
    if (!products.length) {
      root.append(el("div", "empty", "No products match that search."));
      return;
    }
    const row = el("div", "row" + (products.length === 1 ? " single" : ""));
    for (const p of products) row.append(card(p));
    root.append(row, el("div", "fine", "You approve every payment on PayPal. Nothing is charged until you do."));
    loadPhotos(products.filter((p) => p.imageUrl).map((p) => p.id));
  }

  function card(p) {
    const c = el("article", "card");
    const photo = el("div", "photo");
    photo.dataset.id = p.id;
    photo.innerHTML = CANDLE;
    const body = el("div", "body");
    const a = p.attributes ?? {};
    const meta = [a.size, a.burnTime && a.burnTime + " burn", a.scent].filter(Boolean).join(" · ");
    body.append(el("div", "title", p.title));
    if (meta) body.append(el("div", "meta", meta));
    if (p.description) body.append(el("div", "desc", p.description));
    const price = el("div", "price");
    const low = p.stock > 0 && p.stock <= 5;
    price.append(el("strong", null, p.price), el("span", "stock" + (low ? " low" : ""), !p.inStock ? "Sold out" : low ? "Only " + p.stock + " left" : "In stock"));
    body.append(price);

    const pay = el("button", "pay", p.inStock ? "Buy with PayPal" : "Sold out");
    pay.disabled = !p.inStock;
    const status = el("div", "status");
    const paid = el("div", "paid");
    // After checkout starts, the same button reopens PayPal instead of creating another order.
    pay.addEventListener("click", () => (pay.reopen ? pay.reopen() : buy(p, pay, status, paid)));
    body.append(pay, status, paid);
    c.append(photo, body);
    return c;
  }

  async function loadPhotos(ids) {
    if (!ids.length) return;
    try {
      const data = parse(await app.callServerTool({ name: "get_product_photos", arguments: { product_ids: ids } }));
      for (const [id, src] of Object.entries(data?.photos ?? {})) {
        const box = root.querySelector('.photo[data-id="' + CSS.escape(id) + '"]');
        if (!box) continue;
        const img = new Image();
        img.alt = "";
        img.onload = () => { box.replaceChildren(img); requestAnimationFrame(() => img.classList.add("on")); };
        img.src = src;
      }
    } catch {
      // Photos are decoration; the candle placeholder stays.
    }
  }

  async function buy(p, pay, status, paid) {
    pay.disabled = true;
    pay.innerHTML = '<span class="spin"></span>Creating PayPal order…';
    try {
      const result = await app.callServerTool({ name: "create_checkout", arguments: { product_id: p.id, quantity: 1 } });
      const checkout = parse(result);
      if (result.isError || !checkout?.approveUrl) throw new Error(checkout?.error ?? "Checkout failed.");
      const open = () => app.openLink({ url: checkout.approveUrl });
      await open();
      pay.textContent = "Approve " + checkout.total + " in PayPal";
      pay.disabled = false;
      pay.reopen = open;
      status.innerHTML = '<span class="spin"></span>Waiting for your approval in PayPal. ';
      const again = el("a", null, "Reopen PayPal");
      again.addEventListener("click", open);
      status.append(again);
      status.classList.add("show");
      watch(checkout, p, pay, status, paid);
    } catch (err) {
      pay.disabled = false;
      pay.textContent = "Buy with PayPal";
      status.textContent = err?.message || "Checkout failed. Please try again.";
      status.classList.add("show");
    }
  }

  // Poll until the shop has captured the payment (return page or webhook), for up to 15 minutes.
  function watch(checkout, p, pay, status, paid) {
    const started = Date.now();
    const tick = async () => {
      try {
        const order = parse(await app.callServerTool({ name: "get_order_status", arguments: { order_id: checkout.orderId } }));
        if (order && ["paid", "shipped"].includes(order.status)) {
          pay.remove();
          status.classList.remove("show");
          paid.textContent = "✓ Paid " + order.total + " with PayPal. The seller will add tracking when it ships.";
          paid.classList.add("show");
          app.updateModelContext?.({
            content: [{ type: "text", text: "The user paid " + order.total + " with PayPal for " + p.title + " (order " + order.orderId + ", status " + order.status + ")." }],
          })?.catch?.(() => {});
          return;
        }
        if (order?.status === "cancelled") {
          status.textContent = "The PayPal payment was cancelled.";
          return;
        }
      } catch {
        // Keep polling through a blip.
      }
      if (Date.now() - started < 15 * 60 * 1000) setTimeout(tick, 3000);
    };
    setTimeout(tick, 3000);
  }

  await app.connect();
  applyHost(app.getHostContext());
}
})();
</script>
</body>
</html>`;
