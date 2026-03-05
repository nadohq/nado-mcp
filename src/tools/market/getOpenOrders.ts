import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { NadoClient } from '@nadohq/client';

import { ToolExecutionError } from '../../utils/errors.js';
import { toJsonContent } from '../../utils/formatting.js';
import {
  ProductIdsSchema,
  SubaccountNameSchema,
  SubaccountOwnerSchema,
} from '../../utils/schemas.js';

export function registerGetOpenOrders(
  server: McpServer,
  client: NadoClient,
): void {
  server.registerTool(
    'get_open_orders',
    {
      title: 'Get Open Orders',
      description:
        'Get all open limit orders for a subaccount across one or more markets. Returns pending orders from the off-chain engine orderbook. Use this to see what orders are currently resting in the book. For historical (filled/cancelled) orders, use get_historical_orders instead.',
      inputSchema: {
        subaccountOwner: SubaccountOwnerSchema,
        subaccountName: SubaccountNameSchema,
        productIds: ProductIdsSchema.describe(
          'Product IDs to fetch open orders for',
        ),
      },
      annotations: { readOnlyHint: true },
    },
    async ({
      subaccountOwner,
      subaccountName,
      productIds,
    }: {
      subaccountOwner: string;
      subaccountName: string;
      productIds: number[];
    }) => {
      try {
        const orders = await client.market.getOpenSubaccountMultiProductOrders({
          subaccountOwner,
          subaccountName,
          productIds,
        });
        return {
          content: [{ type: 'text', text: toJsonContent(orders) }],
        };
      } catch (err) {
        throw new ToolExecutionError(
          'get_open_orders',
          `Failed to fetch open orders for ${subaccountOwner}/${subaccountName}. Use get_all_markets to list valid product IDs.`,
          err,
        );
      }
    },
  );
}
