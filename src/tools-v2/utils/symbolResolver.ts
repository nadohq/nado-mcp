/**
 * Symbol resolution for thin-wrapper tools.
 *
 * Resolves human-readable market queries (e.g. "bitcoin", "ETH", "BTC-PERP")
 * to concrete product info including productId, priceIncrement, sizeIncrement.
 *
 * Uses the engine's getSymbols() endpoint — no external API dependency.
 * Results are cached for the lifetime of the process.
 */
import type { BigDecimal, EngineSymbol } from '@nadohq/client';
import BigNumber from 'bignumber.js';

import type { NadoContext } from '../../context.js';

export interface ResolvedSymbol {
  productId: number;
  symbol: string;
  type: 'spot' | 'perp';
  priceIncrement: BigNumber;
  sizeIncrement: BigNumber;
  minSize: BigNumber;
}

// Common name aliases for fuzzy matching
const ALIASES: Record<string, string> = {
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
  bittensor: 'tao',
  hyperliquid: 'hype',
  jupiter: 'jup',
  binance: 'bnb',
  arbitrum: 'arb',
};

// Cache symbol data
let symbolCache: EngineSymbol[] | null = null;

async function getSymbols(ctx: NadoContext): Promise<EngineSymbol[]> {
  if (symbolCache) return symbolCache;
  const { symbols } = await ctx.client.context.engineClient.getSymbols({});
  symbolCache = Object.values(symbols);
  return symbolCache;
}

function toBN(v: BigDecimal): BigNumber {
  return new BigNumber(v.toString());
}

function toResolved(s: EngineSymbol): ResolvedSymbol {
  return {
    productId: s.productId,
    symbol: s.symbol,
    type: s.symbol.endsWith('-PERP') ? 'perp' : 'spot',
    priceIncrement: toBN(s.priceIncrement),
    sizeIncrement: toBN(s.sizeIncrement),
    minSize: toBN(s.minSize),
  };
}

/**
 * Resolve a human-readable market query to a concrete symbol with trading params.
 *
 * Resolution order:
 * 1. Exact symbol match (case-insensitive)
 * 2. Alias expansion + "-PERP" suffix
 * 3. k-prefix perps (e.g. "pepe" → "kPEPE-PERP")
 * 4. Substring match (prefers perps)
 */
export async function resolveSymbol(
  ctx: NadoContext,
  query: string,
): Promise<ResolvedSymbol> {
  const entries = await getSymbols(ctx);
  const normalized = query.trim().toLowerCase();
  const alias = ALIASES[normalized] ?? normalized;

  // 1. Exact match
  const exact = entries.find(
    (s) =>
      s.symbol.toLowerCase() === alias ||
      s.symbol.toLowerCase() === normalized,
  );
  if (exact) return toResolved(exact);

  // 2. Alias + "-PERP"
  const perpMatch = entries.find(
    (s) => s.symbol.toLowerCase() === `${alias}-perp`,
  );
  if (perpMatch) return toResolved(perpMatch);

  // 3. k-prefix perps (kPEPE-PERP, kBONK-PERP, etc.)
  const kPerpMatch = entries.find(
    (s) => s.symbol.toLowerCase() === `k${alias}-perp`,
  );
  if (kPerpMatch) return toResolved(kPerpMatch);

  // 4. Substring match, prefer perps
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

  // No match
  const available = entries
    .filter((s) => s.symbol.endsWith('-PERP'))
    .map((s) => s.symbol)
    .join(', ');
  throw new Error(
    `No market matching "${query}". Available perps: ${available}`,
  );
}

/**
 * Invalidate the symbol cache (useful if markets change).
 */
export function clearSymbolCache(): void {
  symbolCache = null;
}
