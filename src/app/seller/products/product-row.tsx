"use client";

import { useActionState, useEffect, useState } from "react";
import { LIMITS } from "@/lib/listing-limits";
import { deleteProduct, setProductActive, updateProduct } from "./actions";

export type EditableProduct = {
  id: string;
  title: string;
  description: string;
  scent: string;
  size: string;
  priceCents: number;
  stock: number;
  active: boolean;
  imageUrl: string | null;
  orders: number;
};

const input =
  "w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-cream outline-none transition placeholder:text-smoke/60 focus:border-ember/70 focus:ring-2 focus:ring-ember/20";
const ghost =
  "rounded-full border border-white/10 px-3 py-1.5 text-xs text-cream transition hover:border-white/25 hover:bg-white/[0.04] disabled:opacity-50";

const usd = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

export function ProductRow({ product: p, editable }: { product: EditableProduct; editable: boolean }) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saved, save, saving] = useActionState(updateProduct, null);
  const [toggled, toggle, toggling] = useActionState(setProductActive, null);
  const [deleted, remove, removing] = useActionState(deleteProduct, null);
  const message = [saved, toggled, deleted].find(Boolean);

  // Close the editor once a save succeeds.
  useEffect(() => {
    if (saved?.ok) setEditing(false);
  }, [saved]);

  const status = !p.active
    ? { text: "Hidden", cls: "bg-white/10 text-smoke" }
    : p.stock <= 0
      ? { text: "Sold out", cls: "bg-red-500/15 text-red-300" }
      : { text: "On sale", cls: "bg-emerald-500/15 text-emerald-300" };

  return (
    <li className={`rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 ${p.active ? "" : "opacity-80"}`}>
      <div className="flex gap-4">
        <div className="size-20 shrink-0 overflow-hidden rounded-xl bg-white/[0.04]">
          {p.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.imageUrl} alt="" className="size-full object-cover" />
          ) : (
            <div className="grid size-full place-items-center text-xs text-smoke">No photo</div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <p className="font-medium text-cream">{p.title}</p>
            <p className="text-cream tabular-nums">{usd(p.priceCents)}</p>
          </div>
          <p className="mt-0.5 truncate text-sm text-smoke">{[p.scent, p.size].filter(Boolean).join(" · ") || "No details yet"}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className={`rounded-full px-2 py-0.5 ${status.cls}`}>{status.text}</span>
            <span className="text-smoke">{p.stock} in stock</span>
            {p.orders > 0 && <span className="text-smoke">· {p.orders} order{p.orders === 1 ? "" : "s"}</span>}
          </div>
        </div>
      </div>

      {editable && !editing && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/[0.05] pt-3">
          <button type="button" onClick={() => setEditing(true)} className={ghost}>
            Edit
          </button>
          <form action={toggle}>
            <input type="hidden" name="id" value={p.id} />
            <input type="hidden" name="active" value={String(!p.active)} />
            <button disabled={toggling} className={ghost}>
              {p.active ? "Hide from sale" : "Put on sale"}
            </button>
          </form>
          {p.orders === 0 &&
            (confirmDelete ? (
              <form action={remove} className="flex items-center gap-2">
                <input type="hidden" name="id" value={p.id} />
                <span className="text-xs text-smoke">Delete for good?</span>
                <button disabled={removing} className="rounded-full bg-red-500/80 px-3 py-1.5 text-xs text-white transition hover:bg-red-500 disabled:opacity-50">
                  {removing ? "Deleting…" : "Delete"}
                </button>
                <button type="button" onClick={() => setConfirmDelete(false)} className="text-xs text-smoke hover:text-cream">
                  Cancel
                </button>
              </form>
            ) : (
              <button type="button" onClick={() => setConfirmDelete(true)} className={`${ghost} text-red-300`}>
                Delete
              </button>
            ))}
          {message && (
            <p role="status" className={`ml-auto text-xs ${message.ok ? "text-emerald-300" : "text-red-300"}`}>
              {message.message}
            </p>
          )}
        </div>
      )}

      {editable && editing && (
        <form action={save} className="mt-4 space-y-3 border-t border-white/[0.05] pt-4">
          <input type="hidden" name="id" value={p.id} />
          <Labeled label="Title">
            <input name="title" defaultValue={p.title} maxLength={LIMITS.title} required className={input} />
          </Labeled>
          <Labeled label="Description">
            <textarea name="description" defaultValue={p.description} maxLength={LIMITS.description} rows={3} required className={input} />
          </Labeled>
          <div className="grid gap-3 sm:grid-cols-2">
            <Labeled label="Scent or key details">
              <input name="scent" defaultValue={p.scent} maxLength={LIMITS.scent} className={input} />
            </Labeled>
            <Labeled label="Size">
              <input name="size" defaultValue={p.size} maxLength={LIMITS.size} className={input} />
            </Labeled>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Labeled label="Price (USD)">
              <input name="priceUsd" type="number" step="0.01" min="1" max="10000" defaultValue={(p.priceCents / 100).toFixed(2)} required className={input} />
            </Labeled>
            <Labeled label="Stock">
              <input name="stock" type="number" step="1" min="0" max="10000" defaultValue={p.stock} required className={input} />
            </Labeled>
            <label className="col-span-2 flex items-center gap-2 self-end pb-2 text-sm text-cream sm:col-span-1">
              <input type="checkbox" name="active" defaultChecked={p.active} className="size-4 accent-amber-500" />
              On sale
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button disabled={saving} className="rounded-full bg-cream px-4 py-2 text-sm font-medium text-wax transition hover:bg-white disabled:opacity-60">
              {saving ? "Saving…" : "Save changes"}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="px-3 py-2 text-sm text-smoke hover:text-cream">
              Cancel
            </button>
            {saved && !saved.ok && (
              <p role="alert" className="text-xs text-red-300">
                {saved.message}
              </p>
            )}
          </div>
        </form>
      )}
    </li>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-smoke">{label}</span>
      {children}
    </label>
  );
}
