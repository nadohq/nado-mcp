import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { NadoClient } from '@nadohq/client';
import { z } from 'zod';

import { handleToolRequest } from '../../utils/handleToolRequest.js';

export function registerGetTickers(
  server: McpServer,
  client: NadoClient,
): void {
  server.registerTool(
    'get_tickers',
    {
      title: 'Get Tickers',
      description:
        'Get 24h ticker data for all markets including volume, price change percentage, high/low, and open interest. Use this for market overview, screening, and comparing activity across markets. Optionally filter by spot or perp. For detailed price data on a single market, use get_market_price or get_candlesticks instead.',
      inputSchema: {
        market: z
          .enum(['spot', 'perp'])
          .optional()
          .describe('Filter by market type (omit for all)'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ market }: { market?: 'spot' | 'perp' }) =>
      handleToolRequest('get_tickers', 'Failed to fetch tickers.', () =>
        client.context.indexerClient.getV2Tickers({ market }),
      ),
  );
}
