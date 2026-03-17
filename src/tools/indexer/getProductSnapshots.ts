import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { NadoClient } from '@nadohq/client';
import { z } from 'zod';

import { handleToolRequest } from '../../utils/handleToolRequest';
import { ProductIdSchema } from '../../utils/schemas';

export function registerGetProductSnapshots(
  server: McpServer,
  client: NadoClient,
): void {
  server.registerTool(
    'get_product_snapshots',
    {
      title: 'Get Product Snapshots',
      description:
        'Get historical state snapshots for a single product, including product parameters and market info at each point in time. Use this for analyzing how product parameters (weights, oracle prices, interest rates, open interest) have changed over time. For aggregate market-level data (volume, price, OI) use get_market_snapshots instead.',
      inputSchema: {
        productId: ProductIdSchema,
        limit: z
          .number()
          .int()
          .positive()
          .max(500)
          .default(100)
          .describe('Number of snapshots to return (1-500, default 100)'),
        maxTimestampInclusive: z
          .number()
          .int()
          .optional()
          .describe('Unix timestamp upper bound (seconds). Omit for latest.'),
        startCursor: z
          .string()
          .optional()
          .describe(
            'Pagination cursor (submission index). Omit to start from the most recent.',
          ),
      },
      annotations: { readOnlyHint: true },
    },
    async ({
      productId,
      limit,
      maxTimestampInclusive,
      startCursor,
    }: {
      productId: number;
      limit: number;
      maxTimestampInclusive?: number;
      startCursor?: string;
    }) =>
      handleToolRequest(
        'get_product_snapshots',
        `Failed to fetch product snapshots for product ${productId}. Use get_all_markets to list valid product IDs.`,
        () =>
          client.context.indexerClient.getProductSnapshots({
            productId,
            limit,
            maxTimestampInclusive,
            startCursor,
          }),
      ),
  );
}
