import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { NadoClient } from '@nadohq/client';
import { z } from 'zod';

import { handleToolRequest } from '../../utils/handleToolRequest';
import { CandlestickPeriodSchema, ProductIdSchema } from '../../utils/schemas';

export function registerGetCandlesticks(
  server: McpServer,
  client: NadoClient,
): void {
  server.registerTool(
    'get_candlesticks',
    {
      title: 'Get Candlesticks',
      description:
        'Get historical OHLCV candlestick data for a market. Use this for price chart analysis, technical analysis, or trend detection. Periods: 60 (1m), 300 (5m), 900 (15m), 3600 (1h), 7200 (2h), 14400 (4h), 86400 (1d), 604800 (1w), 2419200 (1M). For broader market-level snapshots (volume, open interest), use get_market_snapshots instead.',
      inputSchema: {
        productId: ProductIdSchema,
        period: CandlestickPeriodSchema,
        limit: z
          .number()
          .int()
          .positive()
          .max(500)
          .describe('Number of candles to return'),
        maxTimeInclusive: z
          .number()
          .int()
          .optional()
          .describe('Unix timestamp upper bound (seconds). Omit for latest.'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({
      productId,
      period,
      limit,
      maxTimeInclusive,
    }: {
      productId: number;
      period: number;
      limit: number;
      maxTimeInclusive?: number;
    }) =>
      handleToolRequest(
        'get_candlesticks',
        `Failed to fetch candlesticks for product ${productId}.`,
        () =>
          client.market.getCandlesticks({
            productId,
            period,
            limit,
            maxTimeInclusive,
          }),
      ),
  );
}
