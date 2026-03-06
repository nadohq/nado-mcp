import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { NadoClient } from '@nadohq/client';
import { z } from 'zod';

import { asyncResult } from '../../utils/asyncResult.js';
import { PaginationLimitSchema } from '../../utils/schemas.js';

export function registerGetLeaderboard(
  server: McpServer,
  client: NadoClient,
): void {
  server.registerTool(
    'get_leaderboard',
    {
      title: 'Get Leaderboard',
      description:
        'Fetch the trading competition leaderboard ranked by PnL or ROI. Use this to see top traders in a specific contest. Requires a valid contest ID.',
      inputSchema: {
        contestId: z
          .number()
          .int()
          .nonnegative()
          .describe('Trading contest ID'),
        rankType: z
          .enum(['pnl', 'roi'])
          .describe('Ranking metric: absolute PnL or percentage ROI'),
        limit: PaginationLimitSchema,
      },
      annotations: { readOnlyHint: true },
    },
    async ({
      contestId,
      rankType,
      limit,
    }: {
      contestId: number;
      rankType: 'pnl' | 'roi';
      limit: number;
    }) =>
      asyncResult(
        'get_leaderboard',
        `Failed to fetch leaderboard for contest ${contestId}.`,
        () =>
          client.context.indexerClient.getLeaderboard({
            contestId,
            rankType,
            limit,
          }),
      ),
  );
}
