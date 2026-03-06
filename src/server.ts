import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { createNadoClient } from './client.js';
import { loadConfig } from './config.js';
import { registerResources } from './resources/index.js';
import { registerTools } from './tools/index.js';

/**
 * Creates and configures the MCP server with all Nado tools and resources.
 * @returns A fully configured McpServer instance ready to be connected to a transport.
 */
export function createServer(): McpServer {
  const config = loadConfig();
  const ctx = createNadoClient(config);

  const server = new McpServer({
    name: 'nado-mcp',
    version: '0.1.0',
  });

  registerTools(server, ctx);
  registerResources(server, ctx.client);

  return server;
}
