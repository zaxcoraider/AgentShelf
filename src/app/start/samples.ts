/**
 * Sample products a new shop can start with, by what it sells. Photos are in
 * scripts/seed-photos/samples (Unsplash, credited in CREDITS.md). "candles" copies three of the
 * showcase shop's own products instead, so those come from the database.
 */

export type SampleProduct = {
  title: string;
  description: string;
  /** Shown as "Scent or key details" in the seller app; for candles it holds the scent. */
  details: string;
  size: string;
  priceCents: number;
  photo: string;
};

export const SAMPLE_PRODUCTS: Record<"ceramics" | "prints" | "jewelry", SampleProduct[]> = {
  ceramics: [
    {
      title: "Pinched Clay Cup Set",
      description:
        "Three small cups pinched by hand, so each one is a little different. A satin cream glaze inside and out, for espresso, tea, or a single flower.",
      details: "Hand-pinched stoneware, satin cream glaze",
      size: "Set of 3, 6 oz each",
      priceCents: 3800,
      photo: "pinched-clay-cup-set.jpg",
    },
    {
      title: "Robin's Egg Mug",
      description:
        "A wheel-thrown everyday mug in a glossy robin's-egg blue, with a thumb-friendly handle and a wide, steady base. Holds a generous morning coffee.",
      details: "Wheel-thrown stoneware, glossy turquoise glaze",
      size: "12 oz",
      priceCents: 2800,
      photo: "robins-egg-mug.jpg",
    },
    {
      title: "Terracotta Serving Bowl",
      description:
        "A wide serving bowl with a raw terracotta outside and a white glazed inside, brushed with green leaves by hand. Big enough for a salad for four.",
      details: "Terracotta, white glaze, hand-painted leaves",
      size: "9 in wide",
      priceCents: 4600,
      photo: "terracotta-serving-bowl.jpg",
    },
  ],
  prints: [
    {
      title: "Vintage Bouquet Botanical Print",
      description:
        "A restored 19th-century botanical illustration of a garden bouquet: rose, iris and lily. Printed on heavy cotton rag paper with archival inks. Ships unframed, flat.",
      details: "Archival giclée, cotton rag paper",
      size: "11 × 14 in, unframed",
      priceCents: 3200,
      photo: "vintage-bouquet-botanical-print.jpg",
    },
    {
      title: "Desert Dunes Photo Print",
      description:
        "Soft morning light over rippled sand dunes, in warm, quiet tones that suit a bedroom or office. Printed on matte photo paper. Ships unframed, flat.",
      details: "Matte photo paper, archival inks",
      size: "12 × 16 in, unframed",
      priceCents: 3600,
      photo: "desert-dunes-photo-print.jpg",
    },
    {
      title: "Monochrome Figure Print",
      description:
        "A black-and-white abstract figure study with deep shadows and a lot of white space. Small enough for a shelf or a gallery wall. Ships unframed, flat.",
      details: "Giclée on fine art paper, black and white",
      size: "8 × 10 in, unframed",
      priceCents: 3000,
      photo: "monochrome-figure-print.jpg",
    },
  ],
  jewelry: [
    {
      title: "Leather Teardrop Earrings",
      description:
        "Lightweight teardrop earrings cut from metallic pewter leather. They catch the light without weighing your ears down. Hypoallergenic hooks.",
      details: "Metallic leather, hypoallergenic hooks",
      size: "2.5 in drop",
      priceCents: 2400,
      photo: "leather-teardrop-earrings.jpg",
    },
    {
      title: "Sea Glass Beaded Necklace",
      description:
        "A strand of glass seed beads in mint, lilac and teal, strung by hand with a small gold-tone clasp. Easy to layer, easy to wear every day.",
      details: "Glass seed beads, gold-tone clasp",
      size: "18 in",
      priceCents: 3400,
      photo: "sea-glass-beaded-necklace.jpg",
    },
    {
      title: "Hand-forged Silver Ring",
      description:
        "A sterling silver band hammered and polished at the bench, with a soft hand-forged texture. Made to order in your size.",
      details: "Sterling silver, hammered finish",
      size: "Sizes 5–9",
      priceCents: 5800,
      photo: "hand-forged-silver-ring.jpg",
    },
  ],
};
