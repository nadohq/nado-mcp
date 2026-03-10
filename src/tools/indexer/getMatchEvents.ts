import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { NadoClient } from '@nadohq/client';
import type { IndexerMatchEvent } from '@nadohq/indexer-client';
import { z } from 'zod';

import { handleToolRequest } from '../../utils/handleToolRequest.js';
import {
  ProductIdsSchema,
  SubaccountNameSchema,
  SubaccountOwnerSchema,
} from '../../utils/schemas.js';

const PAGE_SIZE = 500;
const MAX_PAGES = 20;

export function registerGetMatchEvents(
  server: McpServer,
  client: NadoClient,
): void {
  server.registerTool(
    'get_match_events',
    {
      title: 'Get Match Events',
      description:
        'Fetch historical trade/match events for a subaccount, showing fills and execution details. Use this to analyze trade execution quality (fill prices, sizes, timestamps). For order-level history (including unfilled orders), use get_historical_orders instead.',
      inputSchema: {
        subaccountOwner: SubaccountOwnerSchema,
        subaccountName: SubaccountNameSchema,
        productIds: ProductIdsSchema.optional().describe(
          'Filter by product IDs (omit for all products)',
        ),
        limit: z
          .number()
          .int()
          .positive()
          .default(100)
          .describe(
            'Maximum number of results to return (1-10000, default 100)',
          ),
        maxTimestampInclusive: z
          .number()
          .int()
          .optional()
          .describe('Unix timestamp upper bound (seconds). Omit for latest.'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({
      subaccountOwner,
      subaccountName,
      productIds,
      limit,
      maxTimestampInclusive,
    }: {
      subaccountOwner: string;
      subaccountName: string;
      productIds?: number[];
      limit: number;
      maxTimestampInclusive?: number;
    }) =>
      handleToolRequest(
        'get_match_events',
        `Failed to fetch match events for ${subaccountOwner}/${subaccountName}.`,
        async () => {
          const allEvents: IndexerMatchEvent[] = [];
          let cursor: string | undefined;
          let pages = 0;

          while (allEvents.length < limit && pages < MAX_PAGES) {
            const pageLimit = Math.min(PAGE_SIZE, limit - allEvents.length);
            const response =
              await client.context.indexerClient.getPaginatedSubaccountMatchEvents(
                {
                  subaccountOwner,
                  subaccountName,
                  productIds,
                  limit: pageLimit,
                  startCursor: cursor,
                  maxTimestampInclusive,
                },
              );

            allEvents.push(...response.events);
            pages++;

            if (!response.meta.hasMore || !response.meta.nextCursor) {
              break;
            }
            cursor = response.meta.nextCursor;
          }

          return allEvents;
        },
      ),
  );
}
