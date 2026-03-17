import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { NadoContext } from '../../context';
import { handleToolRequest } from '../../utils/handleToolRequest';
import { resolveSubaccount } from '../../utils/resolveSubaccount';
import {
  OptionalSubaccountNameSchema,
  OptionalSubaccountOwnerSchema,
  ProductIdsSchema,
} from '../../utils/schemas';

export function registerGetOpenOrders(
  server: McpServer,
  ctx: NadoContext,
): void {
  server.registerTool(
    'get_open_orders',
    {
      title: 'Get Open Orders',
      description:
        'Get all open limit orders for a subaccount across one or more markets. Returns pending orders from the off-chain engine orderbook. Use this to see what orders are currently resting in the book. For historical (filled/cancelled) orders, use get_historical_orders instead.',
      inputSchema: {
        subaccountOwner: OptionalSubaccountOwnerSchema,
        subaccountName: OptionalSubaccountNameSchema,
        productIds: ProductIdsSchema.describe(
          'Product IDs to fetch open orders for',
        ),
      },
      annotations: { readOnlyHint: true },
    },
    async (input: {
      subaccountOwner?: string;
      subaccountName?: string;
      productIds: number[];
    }) => {
      const { subaccountOwner, subaccountName } = resolveSubaccount(ctx, input);

      return handleToolRequest(
        'get_open_orders',
        `Failed to fetch open orders for ${subaccountOwner}/${subaccountName}. Use get_all_markets to list valid product IDs.`,
        () =>
          ctx.client.market.getOpenSubaccountMultiProductOrders({
            subaccountOwner,
            subaccountName,
            productIds: input.productIds,
          }),
      );
    },
  );
}
