import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { NadoClient } from '@nadohq/client';
import { z } from 'zod';

import { asyncResult } from '../../utils/asyncResult.js';
import { ProductIdsSchema } from '../../utils/schemas.js';

export function registerGetMarketSnapshots(
  server: McpServer,
  client: NadoClient,
): void {
  server.registerTool(
    'get_market_snapshots',
    {
      title: 'Get Market Snapshots',
      description:
        'Get historical market snapshots with price, volume, and open interest data over time. Use this for trend analysis, charting, and comparing market activity across periods. For real-time prices, use get_market_price or get_perp_prices instead.',
      inputSchema: {
        granularity: z
          .number()
          .int()
          .positive()
          .describe(
            'Snapshot interval in seconds (e.g. 3600 for hourly, 86400 for daily)',
          ),
        limit: z
          .number()
          .int()
          .positive()
          .max(500)
          .default(100)
          .describe('Number of snapshots to return (1-500, default 100)'),
        productIds: ProductIdsSchema.optional().describe(
          'Filter by product IDs (omit for all markets)',
        ),
        maxTimeInclusive: z
          .number()
          .int()
          .optional()
          .describe('Unix timestamp upper bound (seconds). Omit for latest.'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({
      granularity,
      limit,
      productIds,
      maxTimeInclusive,
    }: {
      granularity: number;
      limit: number;
      productIds?: number[];
      maxTimeInclusive?: number;
    }) =>
      asyncResult(
        'get_market_snapshots',
        'Failed to fetch market snapshots.',
        () =>
          client.context.indexerClient.getMarketSnapshots({
            granularity,
            limit,
            productIds,
            maxTimeInclusive,
          }),
      ),
  );
}
