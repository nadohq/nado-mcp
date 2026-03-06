import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { NadoClient } from '@nadohq/client';

import { asyncResult } from '../../utils/asyncResult.js';
import { ProductIdSchema } from '../../utils/schemas.js';

export function registerGetPerpPrices(
  server: McpServer,
  client: NadoClient,
): void {
  server.registerTool(
    'get_perp_prices',
    {
      title: 'Get Perp Prices',
      description:
        'Get the index price, mark price, and last update time for a single perpetual product. Mark price is used for unrealized PnL and liquidation calculations; index price is the oracle reference price. For multiple perps at once, use get_multi_product_perp_prices. For orderbook bid/ask prices, use get_market_price instead.',
      inputSchema: {
        productId: ProductIdSchema,
      },
      annotations: { readOnlyHint: true },
    },
    async ({ productId }: { productId: number }) =>
      asyncResult(
        'get_perp_prices',
        `Failed to fetch perp prices for product ${productId}. Ensure this is a perp product ID.`,
        () => client.perp.getPerpPrices({ productId }),
      ),
  );
}
