import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { NadoClient } from '@nadohq/client';

import { registerDeploymentsResource } from './deployments';
import { registerHealthGroupsResource } from './healthGroups';
import { registerMarketsResource } from './markets';
import { registerProtocolGuideResource } from './protocolGuide';

export function registerResources(server: McpServer, client: NadoClient): void {
  registerMarketsResource(server, client);
  registerDeploymentsResource(server);
  registerHealthGroupsResource(server, client);
  registerProtocolGuideResource(server);
}
