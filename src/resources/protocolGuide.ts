import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import PROTOCOL_GUIDE from './protocol-guide.md';

export function registerProtocolGuideResource(server: McpServer): void {
  server.registerResource(
    'protocol-guide',
    'nado://protocol-guide',
    {
      description:
        'Comprehensive guide to the Nado protocol: margin system, health, funding, price types, NLP vault, subaccounts, order types, and common workflows.',
      mimeType: 'text/markdown',
    },
    () => ({
      contents: [
        {
          uri: 'nado://protocol-guide',
          mimeType: 'text/markdown',
          text: PROTOCOL_GUIDE,
        },
      ],
    }),
  );
}
