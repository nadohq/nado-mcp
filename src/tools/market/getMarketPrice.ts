import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { NadoClient } from '@nadohq/client';

import { fmtProductIds } from '../../utils/formatting';
import { handleToolRequest } from '../../utils/handleToolRequest';
import { ProductIdsSchema } from '../../utils/schemas';

export function registerGetMarketPrice(
  server: McpServer,
  client: NadoClient,
): void {
  server.registerTool(
    'get_market_price',
    {
      title: 'Get Market Price',
      description:
        'Get the latest bid and ask prices for one or more Nado markets from the off-chain orderbook. Returns the best bid and best ask from the live orderbook — these are not oracle/index prices (use get_oracle_prices for those).',
      inputSchema: {
        productIds: ProductIdsSchema,
      },
      annotations: { readOnlyHint: true },
    },
    async ({ productIds }: { productIds: number[] }) =>
      handleToolRequest(
        'get_market_price',
        `Failed to fetch prices for products ${fmtProductIds(productIds)}. Use get_all_markets to list valid product IDs.`,
        () => client.market.getLatestMarketPrices({ productIds }),
      ),
  );
}
