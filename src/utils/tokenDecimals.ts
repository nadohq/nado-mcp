import type { ChainEnv } from '@nadohq/client';
import { NLP_PRODUCT_ID, QUOTE_PRODUCT_ID } from '@nadohq/client';

/**
 * Static mapping of spot productId → ERC20 token decimals per chain environment.
 * Mirrors the product metadata in nado-web-monorepo (packages/react-client/context/metadata/productMetadata/).
 */
const TOKEN_DECIMALS_BY_CHAIN_ENV: Record<ChainEnv, Record<number, number>> = {
  inkMainnet: {
    [QUOTE_PRODUCT_ID]: 6, // USDT0
    1: 8, // kBTC
    3: 18, // wETH
    5: 6, // USDC
    [NLP_PRODUCT_ID]: 18, // NLP
  },
  inkTestnet: {
    [QUOTE_PRODUCT_ID]: 6, // USDT0
    1: 8, // kBTC
    3: 18, // wETH
    5: 6, // USDC
    [NLP_PRODUCT_ID]: 18, // NLP
  },
  local: {
    [QUOTE_PRODUCT_ID]: 6, // USDT0
    1: 8, // kBTC
    3: 18, // wETH
  },
};

/**
 * Returns the ERC20 token decimals for a spot product.
 * Uses a static mapping consistent with the frontend product metadata.
 */
export function getTokenDecimals(
  chainEnv: ChainEnv,
  productId: number,
): number {
  const decimals = TOKEN_DECIMALS_BY_CHAIN_ENV[chainEnv]?.[productId];
  if (decimals == null) {
    throw new Error(
      `Unknown token decimals for product ${productId} on ${chainEnv}. ` +
        'Update TOKEN_DECIMALS_BY_CHAIN_ENV in tokenDecimals.ts.',
    );
  }
  return decimals;
}
