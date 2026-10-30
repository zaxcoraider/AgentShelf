import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

// Serves product photos from the database. Public: storefront, AI assistants, and PayPal's catalog link here.
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const image = await db.query.productImages.findFirst({ where: eq(schema.productImages.productId, id) });
  if (!image) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(image.data), {
    headers: {
      "Content-Type": image.mediaType,
      // A product's photo never changes in place; a new photo means a new product.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
