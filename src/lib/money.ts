/** Money is integer cents (USD) everywhere; format only at the edges. */
export const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
