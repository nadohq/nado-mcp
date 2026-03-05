import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { NadoClient } from '@nadohq/client';

import { ToolExecutionError } from '../../utils/errors.js';
import { toJsonContent } from '../../utils/formatting.js';
import { ProductIdSchema } from '../../utils/schemas.js';

export function registerGetFundingRate(
  server: McpServer,
  client: NadoClient,
): void {
  server.registerTool(
    'get_funding_rate',
    {
      title: 'Get Funding Rate',
      description:
        'Get the current funding rate for a single perpetual market. Only valid for perp product IDs. Positive rates mean longs pay shorts; negative means shorts pay longs. For funding rates across multiple markets at once, use get_multi_product_funding_rates instead.',
      inputSchema: {
        productId: ProductIdSchema,
      },
      annotations: { readOnlyHint: true },
    },
    async ({ productId }: { productId: number }) => {
      try {
        const rate = await client.market.getFundingRate({ productId });
        return {
          content: [{ type: 'text', text: toJsonContent(rate) }],
        };
      } catch (err) {
        throw new ToolExecutionError(
          'get_funding_rate',
          `Failed to fetch funding rate for product ${productId}. Ensure this is a perp product ID.`,
          err,
        );
      }
    },
  );
}
