import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { NadoClient } from '@nadohq/client';

import { fmtProductIds } from '../../utils/formatting';
import { handleToolRequest } from '../../utils/handleToolRequest';
import { ProductIdsSchema } from '../../utils/schemas';

export function registerGetPerpPrices(
  server: McpServer,
  client: NadoClient,
): void {
  server.registerTool(
    'get_perp_prices',
    {
      title: 'Get Perp Prices',
      description:
        'Get the index price, mark price, and last update time for one or more perpetual products. Mark price is used for unrealized PnL and liquidation calculations; index price is the oracle reference price. For orderbook bid/ask prices, use get_market_price instead.',
      inputSchema: {
        productIds: ProductIdsSchema.describe(
          'Perp product IDs to fetch index/mark prices for',
        ),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ productIds }: { productIds: number[] }) =>
      handleToolRequest(
        'get_perp_prices',
        `Failed to fetch perp prices for products ${fmtProductIds(productIds)}. Ensure these are perp product IDs.`,
        () => client.perp.getMultiProductPerpPrices({ productIds }),
      ),
  );
}
