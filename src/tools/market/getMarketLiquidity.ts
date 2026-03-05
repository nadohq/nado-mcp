import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { NadoClient } from '@nadohq/client';
import { z } from 'zod';

import { ToolExecutionError } from '../../utils/errors.js';
import { toJsonContent } from '../../utils/formatting.js';
import { ProductIdSchema } from '../../utils/schemas.js';

export function registerGetMarketLiquidity(
  server: McpServer,
  client: NadoClient,
): void {
  server.registerTool(
    'get_market_liquidity',
    {
      title: 'Get Market Liquidity',
      description:
        'Get orderbook depth (bids and asks at each price level) for a Nado market. Price levels with no liquidity are skipped. Use this to assess market depth, slippage risk, and liquidity distribution before placing large orders. For just the best bid/ask, use get_market_price instead.',
      inputSchema: {
        productId: ProductIdSchema,
        depth: z
          .number()
          .int()
          .positive()
          .describe('Minimum depth in base price ticks per side of the book'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ productId, depth }: { productId: number; depth: number }) => {
      try {
        const liquidity = await client.market.getMarketLiquidity({
          productId,
          depth,
        });
        return {
          content: [{ type: 'text', text: toJsonContent(liquidity) }],
        };
      } catch (err) {
        throw new ToolExecutionError(
          'get_market_liquidity',
          `Failed to fetch liquidity for product ${productId}.`,
          err,
        );
      }
    },
  );
}
