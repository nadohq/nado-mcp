import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { NadoClient } from '@nadohq/client';
import { z } from 'zod';

import { handleToolRequest } from '../../utils/handleToolRequest.js';

export function registerGetNlpSnapshots(
  server: McpServer,
  client: NadoClient,
): void {
  server.registerTool(
    'get_nlp_snapshots',
    {
      title: 'Get NLP Vault Snapshots',
      description:
        'Get historical vault-level NLP snapshots: TVL, cumulative trading volume, PnL, number of depositors, and total mint/burn amounts over time. No wallet address needed -- this is aggregate vault data. Use this for vault performance analysis and trend charting. For current vault state, use get_nlp_pool_info instead.',
      inputSchema: {
        granularity: z
          .number()
          .int()
          .positive()
          .describe(
            'Snapshot interval in seconds (e.g. 3600 for hourly, 86400 for daily)',
          ),
        limit: z
          .number()
          .int()
          .positive()
          .max(500)
          .default(100)
          .describe('Number of snapshots to return (1-500, default 100)'),
        maxTimeInclusive: z
          .number()
          .int()
          .optional()
          .describe('Unix timestamp upper bound (seconds). Omit for latest.'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({
      granularity,
      limit,
      maxTimeInclusive,
    }: {
      granularity: number;
      limit: number;
      maxTimeInclusive?: number;
    }) =>
      handleToolRequest(
        'get_nlp_snapshots',
        'Failed to fetch NLP vault snapshots.',
        () =>
          client.context.indexerClient.getNlpSnapshots({
            granularity,
            limit,
            maxTimeInclusive,
          }),
      ),
  );
}
