import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { createServer } from './server';
import { formatError } from './utils/errors';

async function main() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  const message = formatError(error);
  console.error(`Fatal error starting nado-mcp server: ${message}`);
  process.exit(1);
});
