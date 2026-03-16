import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { NadoClient } from '@nadohq/client';

import { toJsonContent } from '../utils/formatting';

export function registerMarketsResource(
  server: McpServer,
  client: NadoClient,
): void {
  server.registerResource(
    'markets',
    'nado://markets',
    {
      description:
        'List of all available Nado markets with product IDs, symbols, and types. Refreshed on each read.',
      mimeType: 'application/json',
    },
    async () => {
      const markets = await client.market.getAllMarkets();
      return {
        contents: [
          {
            uri: 'nado://markets',
            mimeType: 'application/json',
            text: toJsonContent(markets),
          },
        ],
      };
    },
  );
}
