import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { createServerV2 } from './server-v2.js';

async function main() {
  const server = createServerV2();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Fatal error starting nado-mcp-v2 server: ${message}`);
  process.exit(1);
});
