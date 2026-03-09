import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { NadoClient } from '@nadohq/client';

import { fmtProductIds } from '../../utils/formatting.js';
import { handleToolRequest } from '../../utils/handleToolRequest.js';
import { ProductIdsSchema } from '../../utils/schemas.js';

export function registerGetMarketPrices(
  server: McpServer,
  client: NadoClient,
): void {
  server.registerTool(
    'get_market_prices',
    {
      title: 'Get Market Prices',
      description:
        'Get the latest bid and ask prices for multiple Nado markets in a single batch request. Use this instead of calling get_market_price repeatedly when you need prices for several markets. More efficient for comparing prices across markets.',
      inputSchema: {
        productIds: ProductIdsSchema,
      },
      annotations: { readOnlyHint: true },
    },
    async ({ productIds }: { productIds: number[] }) =>
      handleToolRequest(
        'get_market_prices',
        `Failed to fetch prices for products ${fmtProductIds(productIds)}. Use get_all_markets to list valid product IDs.`,
        () => client.market.getLatestMarketPrices({ productIds }),
      ),
  );
}
