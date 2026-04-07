import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { NadoClient } from '@nadohq/client';
import { z } from 'zod';

import { handleToolRequest } from '../../utils/handleToolRequest';
import { ProductIdSchema, ProductIdsSchema } from '../../utils/schemas';

export function registerGetSnapshots(
  server: McpServer,
  client: NadoClient,
): void {
  server.registerTool(
    'get_snapshots',
    {
      title: 'Get Snapshots',
      description:
        'Get historical snapshots. Two types: ' +
        '(1) type="market" — aggregate market data (price, volume, OI) over time for one or more markets; ' +
        '(2) type="product" — detailed product parameters for a single product over time. ' +
        'Use type="market" for trend analysis and charting; type="product" for analyzing parameter changes.',
      inputSchema: {
        type: z
          .enum(['market', 'product'])
          .describe(
            'Snapshot type: "market" for aggregate market data, "product" for single-product parameters',
          ),
        granularity: z
          .number()
          .int()
          .positive()
          .optional()
          .describe(
            'Snapshot interval in seconds (e.g. 3600 for hourly, 86400 for daily). Required for type="market".',
          ),
        productId: ProductIdSchema.optional().describe(
          'Product ID (required for type="product")',
        ),
        productIds: ProductIdsSchema.optional().describe(
          'Product IDs filter (optional, for type="market" only — omit for all markets)',
        ),
        limit: z
          .number()
          .int()
          .positive()
          .max(500)
          .default(100)
          .describe('Number of snapshots to return (1-500, default 100)'),
        maxTimestamp: z
          .number()
          .int()
          .optional()
          .describe('Unix timestamp upper bound (seconds). Omit for latest.'),
        startCursor: z
          .string()
          .optional()
          .describe(
            'Pagination cursor for type="product" (submission index). Omit to start from the most recent.',
          ),
      },
      annotations: { readOnlyHint: true },
    },
    async ({
      type,
      granularity,
      productId,
      productIds,
      limit,
      maxTimestamp,
      startCursor,
    }: {
      type: 'market' | 'product';
      granularity?: number;
      productId?: number;
      productIds?: number[];
      limit: number;
      maxTimestamp?: number;
      startCursor?: string;
    }) => {
      if (type === 'market') {
        if (!granularity) {
          throw new Error(
            'granularity is required for type="market" snapshots.',
          );
        }
        return handleToolRequest(
          'get_snapshots',
          'Failed to fetch market snapshots.',
          () =>
            client.context.indexerClient.getMarketSnapshots({
              granularity,
              limit,
              productIds,
              maxTimeInclusive: maxTimestamp,
            }),
        );
      }

      if (productId == null) {
        throw new Error('productId is required for type="product" snapshots.');
      }
      return handleToolRequest(
        'get_snapshots',
        `Failed to fetch product snapshots for product ${productId}. Use get_all_markets to list valid product IDs.`,
        () =>
          client.context.indexerClient.getProductSnapshots({
            productId,
            limit,
            maxTimestampInclusive: maxTimestamp,
            startCursor,
          }),
      );
    },
  );
}
