import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { NadoContext } from '../../context';
import { handleToolRequest } from '../../utils/handleToolRequest';
import { resolveSubaccount } from '../../utils/resolveSubaccount';
import {
  OptionalSubaccountNameSchema,
  OptionalSubaccountOwnerSchema,
  PaginationLimitSchema,
  ProductIdsSchema,
} from '../../utils/schemas';

export function registerGetHistoricalOrders(
  server: McpServer,
  ctx: NadoContext,
): void {
  server.registerTool(
    'get_historical_orders',
    {
      title: 'Get Historical Orders',
      description:
        'Fetch historical orders (filled, cancelled, expired) for a subaccount from the indexer. Use this to review past trading activity. For currently open/resting orders, use get_open_orders instead. For trigger orders (TP/SL), use get_trigger_orders.',
      inputSchema: {
        subaccountOwner: OptionalSubaccountOwnerSchema,
        subaccountName: OptionalSubaccountNameSchema,
        productIds: ProductIdsSchema.optional().describe(
          'Filter by product IDs (omit for all products)',
        ),
        limit: PaginationLimitSchema,
      },
      annotations: { readOnlyHint: true },
    },
    async (input: {
      subaccountOwner?: string;
      subaccountName?: string;
      productIds?: number[];
      limit: number;
    }) => {
      const { subaccountOwner, subaccountName } = resolveSubaccount(ctx, input);

      return handleToolRequest(
        'get_historical_orders',
        `Failed to fetch orders for ${subaccountOwner}/${subaccountName}.`,
        () =>
          ctx.client.market.getHistoricalOrders({
            subaccounts: [{ subaccountOwner, subaccountName }],
            productIds: input.productIds,
            limit: input.limit,
          }),
      );
    },
  );
}
