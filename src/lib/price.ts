/**
 * Fetch the reference price for the daily puzzle.
 * Default: Bitcoin (BTC) price in USD via CoinGecko public API (no key needed).
 *
 * Isolated behind this single function so the metric source can be
 * swapped with a one-file change (e.g. switch to stock index, gold, etc.)
 */

const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd";

export interface PriceResult {
  price: number;
  metric: string;
  timestamp: string;
}

export async function getReferencePrice(): Promise<PriceResult> {
  const res = await fetch(COINGECKO_URL, {
    next: { revalidate: 0 }, // always fresh
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    throw new Error(`CoinGecko API failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const price = data?.bitcoin?.usd;

  if (typeof price !== "number" || isNaN(price)) {
    throw new Error("Invalid price data from CoinGecko");
  }

  return {
    price,
    metric: "BTC/USD",
    timestamp: new Date().toISOString(),
  };
}
