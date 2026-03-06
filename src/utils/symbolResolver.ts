import { ProductEngineType, type ChainEnv } from '@nadohq/client';

const METADATA_URL = 'https://app.nado.xyz/api/product-metadata';

export interface ResolvedMarket {
  productId: number;
  symbol: string;
  type: ProductEngineType;
}

interface ProductMetadataEntry {
  marketName: string;
  symbol: string;
  altSearchTerms: string[];
  quoteProductId: number;
  marketCategories: string[];
}

interface EnvMetadata {
  perp: Record<string, ProductMetadataEntry>;
  spot: Record<string, ProductMetadataEntry>;
}

interface SearchEntry {
  productId: number;
  symbol: string;
  type: ProductEngineType;
  terms: string[];
}

let cached: Record<string, EnvMetadata> | null = null;

async function fetchMetadata(): Promise<Record<string, EnvMetadata>> {
  if (cached) return cached;
  const res = await fetch(METADATA_URL);
  if (!res.ok) {
    throw new Error(
      `Failed to fetch product metadata: ${res.status} ${res.statusText}`,
    );
  }
  cached = (await res.json()) as Record<string, EnvMetadata>;
  return cached;
}

function buildSearchEntries(env: EnvMetadata): SearchEntry[] {
  const entries: SearchEntry[] = [];

  for (const [id, entry] of Object.entries(env.perp)) {
    entries.push({
      productId: Number(id),
      symbol: entry.symbol,
      type: ProductEngineType.PERP,
      terms: [entry.symbol, ...entry.altSearchTerms].map((s) =>
        s.toLowerCase(),
      ),
    });
  }

  for (const [id, entry] of Object.entries(env.spot)) {
    entries.push({
      productId: Number(id),
      symbol: entry.symbol,
      type: ProductEngineType.SPOT,
      terms: [entry.symbol, ...entry.altSearchTerms].map((s) =>
        s.toLowerCase(),
      ),
    });
  }

  return entries;
}

/**
 * Resolves a human-readable market query (e.g. "bitcoin", "eth", "SOL")
 * to a concrete product using the web API's search terms.
 * Prefers perp markets over spot when ambiguous.
 */
export async function resolveMarket(
  chainEnv: ChainEnv,
  query: string,
): Promise<ResolvedMarket> {
  const metadata = await fetchMetadata();
  const env = metadata[chainEnv];
  if (!env) {
    throw new Error(`No product metadata for chain env: ${chainEnv}`);
  }

  const entries = buildSearchEntries(env);
  const normalized = query.trim().toLowerCase();

  // 1) Exact match on symbol or search term
  const exact = entries.find((e) => e.terms.includes(normalized));
  if (exact) return pick(exact);

  // 2) Substring match — prefer perps over spot
  const substring = entries.filter((e) =>
    e.terms.some((t) => t.includes(normalized) || normalized.includes(t)),
  );
  if (substring.length > 0) {
    const perp = substring.find((e) => e.type === ProductEngineType.PERP);
    return pick(perp ?? substring[0]);
  }

  const available = entries
    .filter((e) => e.type === ProductEngineType.PERP)
    .map((e) => e.symbol)
    .join(', ');
  throw new Error(
    `Could not find a market matching "${query}". Available perp symbols: ${available}`,
  );
}

function pick(entry: SearchEntry): ResolvedMarket {
  return {
    productId: entry.productId,
    symbol: entry.symbol,
    type: entry.type,
  };
}
