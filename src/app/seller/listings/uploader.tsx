"use client";

import { useState } from "react";
import { LIMITS } from "@/lib/listing-limits";
import type { ListingDraft } from "@/lib/listings";
import { draft, publish } from "./actions";

type Item = {
  key: string;
  photo: Blob;
  preview: string;
  state: "drafting" | "ready" | "publishing" | "published" | "failed";
  draft?: ListingDraft & { alreadySells?: string };
  message?: string;
  paypalProductId?: string;
};

const MAX_PHOTOS = 6;
const MAX_SIDE = 1024;

/** Shrink a photo in the browser (longest side 1024px, JPEG) before it's uploaded. */
async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't read that image."))), "image/jpeg", 0.85),
  );
}

const input =
  "w-full rounded-md border border-stone-300 bg-transparent px-2.5 py-1.5 text-sm dark:border-stone-700 disabled:opacity-60";

export function Uploader({ enabled, shopUrl }: { enabled: boolean; shopUrl: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const update = (key: string, patch: Partial<Item>) =>
    setItems((all) => all.map((it) => (it.key === key ? { ...it, ...patch } : it)));

  async function add(files: FileList | File[]) {
    const images = [...files].filter((f) => f.type.startsWith("image/")).slice(0, MAX_PHOTOS - items.length);
    for (const file of images) {
      const key = crypto.randomUUID();
      try {
        const photo = await shrink(file);
        setItems((all) => [...all, { key, photo, preview: URL.createObjectURL(photo), state: "drafting" }]);
        const form = new FormData();
        form.set("photo", photo, "photo.jpg");
        draft(form).then((r) =>
          update(key, r.ok ? { state: "ready", draft: r.draft } : { state: "ready", message: r.message }),
        );
      } catch {
        // Unreadable file (e.g. HEIC in some browsers): skip it.
      }
    }
  }

  async function onPublish(item: Item, form: HTMLFormElement) {
    const data = new FormData(form);
    data.set("photo", item.photo, "photo.jpg");
    update(item.key, { state: "publishing", message: undefined });
    const r = await publish(data);
    update(item.key, r.ok ? { state: "published", paypalProductId: r.paypalProductId } : { state: "ready", message: r.message });
  }

  return (
    <div>
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (enabled) add(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
          dragging ? "border-stone-900 bg-stone-100 dark:border-stone-100 dark:bg-stone-900" : "border-stone-300 dark:border-stone-700"
        } ${enabled ? "" : "cursor-not-allowed opacity-60"}`}
      >
        <span className="font-medium">Drop product photos here</span>
        <span className="mt-1 text-sm opacity-70">
          {enabled ? `or click to choose (up to ${MAX_PHOTOS}). The AI drafts each listing for you.` : "Connect a vision model (AI_MODEL_VISION) to draft listings from photos."}
        </span>
        <input
          type="file"
          accept="image/*"
          multiple
          disabled={!enabled}
          className="sr-only"
          onChange={(e) => {
            if (e.target.files) add(e.target.files);
            e.target.value = "";
          }}
        />
      </label>

      <ul className="mt-6 space-y-4">
        {items.map((item) => (
          <li key={item.key} className="grid gap-4 rounded-xl border border-stone-200 p-4 sm:grid-cols-[160px_1fr] dark:border-stone-800">
            {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
            <img src={item.preview} alt="" className="aspect-square w-full rounded-lg object-cover" />
            {item.state === "drafting" ? (
              <p className="self-center text-sm opacity-70">Reading the photo and drafting a listing…</p>
            ) : item.state === "published" ? (
              <div className="self-center text-sm">
                <p className="font-medium text-emerald-700 dark:text-emerald-400">Published to your shop and PayPal catalog.</p>
                <p className="mt-1 opacity-70">
                  PayPal product <span className="font-mono">{item.paypalProductId}</span> ·{" "}
                  <a href={shopUrl} className="underline">
                    View in shop
                  </a>
                </p>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  onPublish(item, e.currentTarget);
                }}
                className="space-y-2"
              >
                <fieldset disabled={item.state === "publishing"} className="space-y-2">
                  <input name="title" required maxLength={LIMITS.title} aria-label="Title" placeholder="Title" defaultValue={item.draft?.title} className={`${input} font-medium`} />
                  <textarea
                    name="description"
                    required
                    maxLength={LIMITS.description}
                    rows={3}
                    aria-label="Description"
                    placeholder="Description"
                    defaultValue={item.draft?.description}
                    className={input}
                  />
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <input name="scent" maxLength={LIMITS.scent} aria-label="Scent" placeholder="Scent" defaultValue={item.draft?.scent} className={input} />
                    <input name="size" maxLength={LIMITS.size} aria-label="Size" placeholder="Size" defaultValue={item.draft?.size} className={input} />
                    <label className="flex items-center gap-1 text-sm">
                      $
                      <input
                        name="priceUsd"
                        type="number"
                        step="0.01"
                        min="1"
                        required
                        aria-label="Price in USD"
                        defaultValue={item.draft?.suggestedPriceUsd}
                        className={input}
                      />
                    </label>
                    <label className="flex items-center gap-1 text-sm">
                      Stock
                      <input name="stock" type="number" min="0" required aria-label="Stock" defaultValue={10} className={input} />
                    </label>
                  </div>
                </fieldset>
                {item.draft?.alreadySells && (
                  <p className="rounded-md bg-amber-50 p-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                    You already sell “{item.draft.alreadySells}”. If this is a different product, change the title; if it&apos;s
                    the same one, there&apos;s no need to publish it again.
                  </p>
                )}
                {item.draft?.priceReason && <p className="text-xs opacity-60">Price: {item.draft.priceReason}</p>}
                {item.message && <p className="text-sm text-red-700 dark:text-red-400">{item.message}</p>}
                <button
                  disabled={item.state === "publishing"}
                  className="rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-stone-700 disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900"
                >
                  {item.state === "publishing" ? "Publishing to PayPal…" : "Publish"}
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
