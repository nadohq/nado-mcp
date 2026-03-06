import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { NadoClient } from '@nadohq/client';

import { asyncResult } from '../../utils/asyncResult.js';
import { ProductIdsSchema } from '../../utils/schemas.js';

export function registerGetMultiProductPerpPrices(
  server: McpServer,
  client: NadoClient,
): void {
  server.registerTool(
    'get_multi_product_perp_prices',
    {
      title: 'Get Multi-Product Perp Prices',
      description:
        'Get index and mark prices for multiple perpetual markets in a single batch request. Use this instead of calling get_perp_prices repeatedly when comparing prices across markets. Returns a map of product ID to index/mark price data.',
      inputSchema: {
        productIds: ProductIdsSchema.describe(
          'Perp product IDs to fetch index/mark prices for',
        ),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ productIds }: { productIds: number[] }) =>
      asyncResult(
        'get_multi_product_perp_prices',
        `Failed to fetch perp prices for products [${productIds.join(', ')}]. Ensure these are perp product IDs.`,
        () => client.perp.getMultiProductPerpPrices({ productIds }),
      ),
  );
}
