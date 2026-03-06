import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { NadoClient } from '@nadohq/client';

import { asyncResult } from '../../utils/asyncResult.js';
import {
  PaginationLimitSchema,
  ProductIdsSchema,
  SubaccountNameSchema,
  SubaccountOwnerSchema,
} from '../../utils/schemas.js';

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
        limit: PaginationLimitSchema,
      },
      annotations: { readOnlyHint: true },
    },
    async ({
      subaccountOwner,
      subaccountName,
      productIds,
      limit,
    }: {
      subaccountOwner: string;
      subaccountName: string;
      productIds?: number[];
      limit: number;
    }) =>
      asyncResult(
        'get_match_events',
        `Failed to fetch match events for ${subaccountOwner}/${subaccountName}.`,
        () =>
          client.context.indexerClient.getMatchEvents({
            subaccounts: [{ subaccountOwner, subaccountName }],
            productIds,
            limit,
          }),
      ),
  );
}
