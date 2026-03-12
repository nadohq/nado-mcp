import { type ChainEnv, ProductEngineType } from '@nadohq/client';

import { type DataEnv, getMetadataUrl } from '../dataEnv.js';

interface ApiPerpMetadata {
  marketName: string;
  symbol: string;
  icon: { asset: string };
  altSearchTerms: string[];
  quoteProductId: number;
  marketCategories: string[];
}

interface ApiSpotMetadata {
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

interface ApiEnvMetadata {
  perp: Record<string, ApiPerpMetadata>;
  spot: Record<string, ApiSpotMetadata>;
}

export interface Market {
  productId: number;
  symbol: string;
  marketName: string;
  type: ProductEngineType;
  decimals?: number;
}

const cache = new Map<ChainEnv, Market[]>();

export async function getMarkets(
  dataEnv: DataEnv,
  chainEnv: ChainEnv,
): Promise<Market[]> {
  const existing = cache.get(chainEnv);
  if (existing) return existing;

  const url = getMetadataUrl(dataEnv);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Failed to fetch product metadata from ${url}: ${res.status} ${res.statusText}`,
    );
  }

  const allEnvs = (await res.json()) as Record<string, ApiEnvMetadata>;
  const env = allEnvs[chainEnv];
  if (!env) {
    throw new Error(
      `No product metadata found for chain env "${chainEnv}" in ${url}`,
    );
  }

  const markets: Market[] = [];

  for (const [id, entry] of Object.entries(env.perp)) {
    markets.push({
      productId: Number(id),
      symbol: entry.symbol,
      marketName: entry.marketName,
      type: ProductEngineType.PERP,
    });
  }

  for (const [id, entry] of Object.entries(env.spot)) {
    markets.push({
      productId: Number(id),
      symbol: entry.token.symbol,
      marketName: entry.marketName,
      type: ProductEngineType.SPOT,
      decimals: entry.token.tokenDecimals,
    });
  }

  cache.set(chainEnv, markets);
  return markets;
}

export async function getTokenDecimals(
  dataEnv: DataEnv,
  chainEnv: ChainEnv,
  productId: number,
): Promise<number> {
  const markets = await getMarkets(dataEnv, chainEnv);
  const market = markets.find((m) => m.productId === productId);
  if (market?.decimals == null) {
    throw new Error(
      `Unknown token decimals for product ${productId} on ${chainEnv}.`,
    );
  }
  return market.decimals;
}
