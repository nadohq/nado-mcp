import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { NadoClient } from '@nadohq/client';

import { registerDeploymentsResource } from './deployments.js';
import { registerHealthGroupsResource } from './healthGroups.js';
import { registerMarketsResource } from './markets.js';
import { registerProtocolGuideResource } from './protocolGuide.js';

export function registerResources(server: McpServer, client: NadoClient): void {
  registerMarketsResource(server, client);
  registerDeploymentsResource(server);
  registerHealthGroupsResource(server, client);
  registerProtocolGuideResource(server);
}
