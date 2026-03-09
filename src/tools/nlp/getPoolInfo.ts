import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { NadoClient } from '@nadohq/client';

import { handleToolRequest } from '../../utils/handleToolRequest.js';

export function registerGetNlpPoolInfo(
  server: McpServer,
  client: NadoClient,
): void {
  server.registerTool(
    'get_nlp_pool_info',
    {
      title: 'Get NLP Vault State',
      description:
        'Get the current state of the NLP vault: all sub-pools with their balance weights, positions, open orders, PnL, and margin health. No input needed -- returns the full vault-level view. Positions are aggregated across all sub-pools into one unified view. Use this to analyze vault risk, current exposure, and pool composition. For historical vault trends, use get_nlp_snapshots instead.',
      annotations: { readOnlyHint: true },
    },
    async () =>
      handleToolRequest(
        'get_nlp_pool_info',
        'Failed to fetch NLP pool info.',
        () => client.context.engineClient.getNlpPoolInfo(),
      ),
  );
}
