import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { createNadoClient } from './client.js';
import { loadConfig } from './config.js';
import { registerPrompts } from './prompts/index.js';
import { registerResources } from './resources/index.js';
import { registerTools } from './tools/index.js';

/**
 * Creates and configures the MCP server with all Nado tools, resources, and prompts.
 * @returns A fully configured McpServer instance ready to be connected to a transport.
 */
export function createServer(): McpServer {
  const config = loadConfig();
  const client = createNadoClient(config);

  const server = new McpServer({
    name: 'nado-mcp',
    version: '0.1.0',
  });

  registerTools(server, client);
  registerResources(server, client);
  registerPrompts(server, client);

  return server;
}
