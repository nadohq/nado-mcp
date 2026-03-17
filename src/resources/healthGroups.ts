import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { NadoClient } from '@nadohq/client';

import { toJsonContent } from '../utils/formatting';

export function registerHealthGroupsResource(
  server: McpServer,
  client: NadoClient,
): void {
  server.registerResource(
    'health-groups',
    'nado://health-groups',
    {
      description:
        'Health group configuration showing paired spot/perp product IDs used for cross-margin spread calculations.',
      mimeType: 'application/json',
    },
    async () => {
      const healthGroups = await client.market.getHealthGroups();
      return {
        contents: [
          {
            uri: 'nado://health-groups',
            mimeType: 'application/json',
            text: toJsonContent(healthGroups),
          },
        ],
      };
    },
  );
}
