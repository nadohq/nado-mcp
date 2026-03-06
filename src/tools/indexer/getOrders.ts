import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { NadoClient } from '@nadohq/client';

import { asyncResult } from '../../utils/asyncResult.js';
import {
  PaginationLimitSchema,
  ProductIdsSchema,
  SubaccountNameSchema,
  SubaccountOwnerSchema,
} from '../../utils/schemas.js';

export function registerGetHistoricalOrders(
  server: McpServer,
  client: NadoClient,
): void {
  server.registerTool(
    'get_historical_orders',
    {
      title: 'Get Historical Orders',
      description:
        'Fetch historical orders (filled, cancelled, expired) for a subaccount from the indexer. Use this to review past trading activity. For currently open/resting orders, use get_open_orders instead. For trigger orders (SL/TP), use get_trigger_orders.',
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
        'get_historical_orders',
        `Failed to fetch orders for ${subaccountOwner}/${subaccountName}.`,
        () =>
          client.market.getHistoricalOrders({
            subaccounts: [{ subaccountOwner, subaccountName }],
            productIds,
            limit,
          }),
      ),
  );
}
