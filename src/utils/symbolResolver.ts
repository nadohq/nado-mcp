import type { NadoClient } from '@nadohq/client';

interface ResolvedMarket {
  productId: number;
  symbol: string;
  type: 'spot' | 'perp';
}

const COMMON_ALIASES: Record<string, string> = {
  bitcoin: 'btc',
  ethereum: 'eth',
  solana: 'sol',
  ripple: 'xrp',
  dogecoin: 'doge',
  cardano: 'ada',
  avalanche: 'avax',
  chainlink: 'link',
  uniswap: 'uni',
  litecoin: 'ltc',
  monero: 'xmr',
  gold: 'xaut',
  tao: 'tao',
  bittensor: 'tao',
  hyperliquid: 'hype',
  jupiter: 'jup',
  sui: 'sui',
  aave: 'aave',
  pengu: 'pengu',
  penguin: 'pengu',
  fartcoin: 'fartcoin',
  bonk: 'bonk',
  pepe: 'pepe',
  virtual: 'virtual',
  near: 'near',
  arbitrum: 'arb',
  ondo: 'ondo',
  ethena: 'ena',
  bnb: 'bnb',
  binance: 'bnb',
};

/**
 * Resolves a human-readable market query (e.g. "bitcoin", "eth", "BTC-PERP")
 * to a concrete product. Prefers perp products over spot for analysis.
 */
export async function resolveMarket(
  client: NadoClient,
  query: string,
): Promise<ResolvedMarket> {
  const { symbols } = await client.context.engineClient.getSymbols({});

  const entries = Object.values(symbols);
  const normalized = query.trim().toLowerCase();

  // Expand common name aliases
  const alias = COMMON_ALIASES[normalized] ?? normalized;

  // 1) Exact symbol match (case-insensitive)
  const exact = entries.find(
    (s) =>
      s.symbol.toLowerCase() === alias || s.symbol.toLowerCase() === normalized,
  );
  if (exact) {
    return toResolved(exact);
  }

  // 2) Match "{alias}-PERP" pattern  (e.g. "btc" -> "BTC-PERP")
  const perpMatch = entries.find(
    (s) => s.symbol.toLowerCase() === `${alias}-perp`,
  );
  if (perpMatch) {
    return toResolved(perpMatch);
  }

  // 3) Match with k-prefix perps (e.g. "pepe" -> "kPEPE-PERP", "bonk" -> "kBONK-PERP")
  const kPerpMatch = entries.find(
    (s) => s.symbol.toLowerCase() === `k${alias}-perp`,
  );
  if (kPerpMatch) {
    return toResolved(kPerpMatch);
  }

  // 4) Substring match -- prefer perps over spot
  const substringMatches = entries.filter(
    (s) =>
      s.symbol.toLowerCase().includes(alias) ||
      s.symbol.toLowerCase().includes(normalized),
  );
  if (substringMatches.length > 0) {
    const perp = substringMatches.find((s) =>
      s.symbol.toLowerCase().endsWith('-perp'),
    );
    return toResolved(perp ?? substringMatches[0]);
  }

  const available = entries
    .filter((s) => s.symbol.endsWith('-PERP'))
    .map((s) => s.symbol)
    .join(', ');
  throw new Error(
    `Could not find a market matching "${query}". Available perp markets: ${available}`,
  );
}

function toResolved(symbol: {
  productId: number;
  symbol: string;
  type: { toString(): string };
}): ResolvedMarket {
  return {
    productId: symbol.productId,
    symbol: symbol.symbol,
    type: symbol.symbol.endsWith('-PERP') ? 'perp' : 'spot',
  };
}
