import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { NadoClient } from '@nadohq/client';

import { ToolExecutionError } from '../../utils/errors.js';
import { toJsonContent } from '../../utils/formatting.js';
import { ProductIdsSchema } from '../../utils/schemas.js';

export function registerGetOraclePrices(
  server: McpServer,
  client: NadoClient,
): void {
  server.registerTool(
    'get_oracle_prices',
    {
      title: 'Get Oracle Prices',
      description:
        'Get oracle (index) prices for one or more products. Oracle prices are the "truth" price feed from external sources, used for margin calculations and liquidations. Different from orderbook bid/ask prices (use get_market_price for those) or mark prices (use get_perp_prices for those).',
      inputSchema: {
        productIds: ProductIdsSchema,
      },
      annotations: { readOnlyHint: true },
    },
    async ({ productIds }: { productIds: number[] }) => {
      try {
        const prices = await client.context.indexerClient.getOraclePrices({
          productIds,
        });
        return {
          content: [{ type: 'text', text: toJsonContent(prices) }],
        };
      } catch (err) {
        throw new ToolExecutionError(
          'get_oracle_prices',
          `Failed to fetch oracle prices for products [${productIds.join(', ')}]. Use get_all_markets to list valid product IDs.`,
          err,
        );
      }
    },
  );
}
