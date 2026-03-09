import { ProductEngineType } from '@nadohq/client';
import Fuse from 'fuse.js';

import { type DataEnv, getDataEnvConfig, getMetadataUrl } from '../dataEnv.js';

interface PerpMetadata {
  marketName: string;
  symbol: string;
  icon: { asset: string };
  altSearchTerms: string[];
  quoteProductId: number;
  marketCategories: string[];
}

interface SpotMetadata {
  token: {
    address: string;
    chainId: number;
    tokenDecimals: number;
    symbol: string;
    icon: { asset: string };
  };
  quoteProductId: number;
  marketName: string;
  altSearchTerms: string[];
  marketCategories: string[];
}

interface EnvMetadata {
  perp: Record<string, PerpMetadata>;
  spot: Record<string, SpotMetadata>;
}

export interface Market {
  productId: number;
  symbol: string;
  type: ProductEngineType;
}

const cache = new Map<DataEnv, Market[]>();

async function getMarkets(dataEnv: DataEnv): Promise<Market[]> {
  const existing = cache.get(dataEnv);
  if (existing) return existing;

  const url = getMetadataUrl(dataEnv);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Failed to fetch product metadata from ${url}: ${res.status} ${res.statusText}`,
    );
  }

  const allEnvs = (await res.json()) as Record<string, EnvMetadata>;
  const { chainEnvs } = getDataEnvConfig(dataEnv);
  const chainEnv = chainEnvs.find((ce) => allEnvs[ce]);
  if (!chainEnv) {
    throw new Error(`No product metadata found for data env: ${dataEnv}`);
  }

  const env = allEnvs[chainEnv];
  const markets: Market[] = [];

  for (const [id, entry] of Object.entries(env.perp)) {
    markets.push({
      productId: Number(id),
      symbol: entry.symbol,
      type: ProductEngineType.PERP,
    });
  }

  for (const [id, entry] of Object.entries(env.spot)) {
    markets.push({
      productId: Number(id),
      symbol: entry.token?.symbol ?? entry.marketName,
      type: ProductEngineType.SPOT,
    });
  }

  cache.set(dataEnv, markets);
  return markets;
}

/**
 * Resolves a human-readable market query (e.g. "bitcoin", "eth", "SOL")
 * to a concrete product via fuzzy search.
 * Prefers perp markets over spot when ambiguous.
 */
export async function resolveMarket(
  dataEnv: DataEnv,
  query: string,
): Promise<Market> {
  const markets = await getMarkets(dataEnv);

  const fuse = new Fuse(markets, {
    keys: ['symbol'],
    threshold: 0.4,
  });

  const results = fuse.search(query);
  if (results.length === 0) {
    const available = markets
      .filter((m) => m.type === ProductEngineType.PERP)
      .map((m) => m.symbol)
      .join(', ');
    throw new Error(
      `Could not find a market matching "${query}". Available perp symbols: ${available}`,
    );
  }

  const perp = results.find((r) => r.item.type === ProductEngineType.PERP);
  return (perp ?? results[0]).item;
}
