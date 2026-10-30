/** Money is integer cents (USD) everywhere; format only at the edges. */
const formatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
export const usd = (cents: number) => formatter.format(cents / 100);
