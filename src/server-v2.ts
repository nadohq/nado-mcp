import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { loadConfig } from './config.js';
import { createNadoContext } from './context.js';
import { SERVER_INSTRUCTIONS } from './instructions.js';
import { registerResources } from './resources/index.js';
import { registerDiscoverTool } from './tools-v2/discover.js';
import { registerPlaceOrderTool } from './tools-v2/execute-order.js';
import { registerQueryTool } from './tools-v2/query.js';

/**
 * Creates and configures the MCP server with v2 tools (thin-wrapper architecture).
 *
 * Registers only 3 tools:
 *   - nado_discover — dynamic SDK method discovery
 *   - nado_query — generic SDK read dispatcher
 *   - nado_place_order — validated order placement
 *
 * Resources (protocol guide, deployments, health groups, markets) are kept.
 *
 * @returns A fully configured McpServer instance ready to be connected to a transport.
 */
export function createServerV2(): McpServer {
  const config = loadConfig();
  const ctx = createNadoContext(config);

  const server = new McpServer(
    { name: 'nado-mcp-v2', version: '0.1.0' },
    { instructions: SERVER_INSTRUCTIONS },
  );

  // Register v2 tools
  registerDiscoverTool(server, ctx);
  registerQueryTool(server, ctx);
  registerPlaceOrderTool(server, ctx);

  // Keep resources — they're useful context for both v1 and v2
  registerResources(server, ctx.client);

  return server;
}
