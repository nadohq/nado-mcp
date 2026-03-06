import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { NadoClient } from '@nadohq/client';

import { asyncResult } from '../../utils/asyncResult.js';

export function registerGetAllMarkets(
  server: McpServer,
  client: NadoClient,
): void {
  server.registerTool(
    'get_all_markets',
    {
      title: 'Get All Markets',
      description:
        'List all available Nado markets with product info (product ID, symbol, type, state). Use this first to discover valid product IDs before calling other market tools. Returns both spot and perp markets. Call this once and cache the results rather than calling repeatedly.',
      annotations: { readOnlyHint: true },
    },
    async () =>
      asyncResult(
        'get_all_markets',
        'Failed to fetch markets. The engine may be temporarily unavailable.',
        () => client.market.getAllMarkets(),
      ),
  );
}
