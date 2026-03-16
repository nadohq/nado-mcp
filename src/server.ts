import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { loadConfig } from './config';
import { createNadoContext } from './context';
import { SERVER_INSTRUCTIONS } from './instructions';
import { registerResources } from './resources/index';
import { registerTools } from './tools/index';

/**
 * Creates and configures the MCP server with all Nado tools and resources.
 * @returns A fully configured McpServer instance ready to be connected to a transport.
 */
export function createServer(): McpServer {
  const config = loadConfig();
  const ctx = createNadoContext(config);

  const server = new McpServer(
    { name: 'nado-mcp', version: '0.1.0' },
    { instructions: SERVER_INSTRUCTIONS },
  );

  registerTools(server, ctx);
  registerResources(server, ctx.client);

  return server;
}
