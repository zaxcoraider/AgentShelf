"use server";

import { and, count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import type { Seller } from "@/lib/db/schema";
import { publishInput } from "@/lib/listings";
import { canEditShop, requireSeller } from "@/lib/seller-session";

export type ProductState = { ok: boolean; message: string } | null;

const READ_ONLY = "The demo shop is read-only so every judge sees the same demo. Create your own shop to try editing.";

async function ownProduct(seller: Seller, id: string) {
  return db.query.products.findFirst({
    where: and(eq(schema.products.id, id), eq(schema.products.sellerId, seller.id)),
  });
}

function refresh(seller: Seller) {
  revalidatePath("/seller/products");
  revalidatePath(`/shop/${seller.slug}`);
}

export async function updateProduct(_prev: ProductState, form: FormData): Promise<ProductState> {
  const seller = await requireSeller();
  if (!canEditShop(seller)) return { ok: false, message: READ_ONLY };
  const product = await ownProduct(seller, String(form.get("id")));
  if (!product) return { ok: false, message: "That product no longer exists." };

  const parsed = publishInput.safeParse({
    title: form.get("title"),
    description: form.get("description"),
    scent: form.get("scent") ?? "",
    size: form.get("size") ?? "",
    priceUsd: Number(form.get("priceUsd")),
    stock: Number(form.get("stock")),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = String(issue?.path[0] ?? "product");
    const name =
      { title: "Title", description: "Description", scent: "Key details", size: "Size", priceUsd: "Price", stock: "Stock" }[field] ?? field;
    return { ok: false, message: `${name} needs a look (${issue?.message.toLowerCase()}).` };
  }
  const p = parsed.data;
  await db
    .update(schema.products)
    .set({
      title: p.title,
      description: p.description,
      // Keep other attributes (e.g. a candle's burn time); replace the two the form edits.
      attributes: { ...product.attributes, scent: p.scent, size: p.size },
      priceCents: Math.round(p.priceUsd * 100),
      stock: p.stock,
      active: form.get("active") === "on",
    })
    .where(eq(schema.products.id, product.id));
  refresh(seller);
  return { ok: true, message: "Saved. Your storefront and AI assistants see the change now." };
}

export async function setProductActive(_prev: ProductState, form: FormData): Promise<ProductState> {
  const seller = await requireSeller();
  if (!canEditShop(seller)) return { ok: false, message: READ_ONLY };
  const product = await ownProduct(seller, String(form.get("id")));
  if (!product) return { ok: false, message: "That product no longer exists." };
  const active = form.get("active") === "true";
  await db.update(schema.products).set({ active }).where(eq(schema.products.id, product.id));
  refresh(seller);
  return { ok: true, message: active ? "Back on sale." : "Hidden from your storefront and AI assistants." };
}

export async function deleteProduct(_prev: ProductState, form: FormData): Promise<ProductState> {
  const seller = await requireSeller();
  if (!canEditShop(seller)) return { ok: false, message: READ_ONLY };
  const product = await ownProduct(seller, String(form.get("id")));
  if (!product) return { ok: false, message: "That product no longer exists." };
  const [{ n }] = await db.select({ n: count() }).from(schema.orders).where(eq(schema.orders.productId, product.id));
  if (n > 0) {
    return { ok: false, message: `It has ${n} order${n === 1 ? "" : "s"}, so it can't be deleted. Hide it instead.` };
  }
  await db.delete(schema.products).where(eq(schema.products.id, product.id));
  refresh(seller);
  return { ok: true, message: "Deleted." };
}
