import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { NadoClient } from '@nadohq/client';
import { z } from 'zod';

import { handleToolRequest } from '../../utils/handleToolRequest';
import { ProductIdSchema } from '../../utils/schemas';

export function registerGetMarketPrice(
  server: McpServer,
  client: NadoClient,
): void {
  server.registerTool(
    'get_market_price',
    {
      title: 'Get Market Price',
      description:
        'Get the latest bid and ask price for a single Nado market from the off-chain orderbook. Use this for a quick price check on one market. For multiple markets at once, use get_market_prices instead. Returns the best bid and best ask from the live orderbook -- these are not oracle/index prices (use get_oracle_prices for those).',
      inputSchema: {
        productId: ProductIdSchema,
      },
      annotations: { readOnlyHint: true },
    },
    async ({ productId }: { productId: z.infer<typeof ProductIdSchema> }) =>
      handleToolRequest(
        'get_market_price',
        `Failed to fetch price for product ${productId}. Use get_all_markets to list valid product IDs.`,
        () => client.market.getLatestMarketPrice({ productId }),
      ),
  );
}
