import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { NadoClient } from '@nadohq/client';
import { toBigDecimal } from '@nadohq/client';
import { z } from 'zod';

import { handleToolRequest } from '../../utils/handleToolRequest.js';
import {
  type BalanceSide,
  BalanceSideSchema,
  ProductIdSchema,
  SubaccountNameSchema,
  SubaccountOwnerSchema,
} from '../../utils/schemas.js';

export function registerGetMaxOrderSize(
  server: McpServer,
  client: NadoClient,
): void {
  server.registerTool(
    'get_max_order_size',
    {
      title: 'Get Max Order Size',
      description:
        'Calculate the maximum order size a subaccount can place for a given market, side, and price. Use this before placing orders to understand buying/selling power. Takes into account current margin, positions, and risk limits. For checking maximum withdrawal amount instead, use get_max_withdrawable.',
      inputSchema: {
        subaccountOwner: SubaccountOwnerSchema,
        subaccountName: SubaccountNameSchema,
        productId: ProductIdSchema,
        price: z.number().positive().describe('Limit price for the order'),
        side: BalanceSideSchema,
      },
      annotations: { readOnlyHint: true },
    },
    async ({
      subaccountOwner,
      subaccountName,
      productId,
      price,
      side,
    }: {
      subaccountOwner: string;
      subaccountName: string;
      productId: number;
      price: number;
      side: BalanceSide;
    }) =>
      handleToolRequest(
        'get_max_order_size',
        `Failed to calculate max order size for product ${productId}.`,
        async () => {
          const maxSize = await client.market.getMaxOrderSize({
            subaccountOwner,
            subaccountName,
            productId,
            price: toBigDecimal(price),
            side,
          });
          return { maxOrderSize: maxSize };
        },
      ),
  );
}
