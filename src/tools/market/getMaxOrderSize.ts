import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { toBigNumber } from '@nadohq/client';
import type BigNumber from 'bignumber.js';
import { z } from 'zod';

import type { NadoContext } from '../../context';
import { handleToolRequest } from '../../utils/handleToolRequest';
import { resolveSubaccount } from '../../utils/resolveSubaccount';
import {
  type BalanceSide,
  BalanceSideSchema,
  OptionalSubaccountNameSchema,
  OptionalSubaccountOwnerSchema,
  ProductIdSchema,
} from '../../utils/schemas';

export function registerGetMaxOrderSize(
  server: McpServer,
  ctx: NadoContext,
): void {
  server.registerTool(
    'get_max_order_size',
    {
      title: 'Get Max Order Size',
      description:
        'Calculate the maximum order size a subaccount can place for a given market, side, and price. Use this before placing orders to understand buying/selling power. Takes into account current margin, positions, and risk limits. For checking maximum withdrawal amount instead, use get_max_withdrawable.',
      inputSchema: {
        subaccountOwner: OptionalSubaccountOwnerSchema,
        subaccountName: OptionalSubaccountNameSchema,
        productId: ProductIdSchema,
        price: z.number().positive().describe('Limit price for the order'),
        side: BalanceSideSchema,
      },
      annotations: { readOnlyHint: true },
    },
    async (input: {
      subaccountOwner?: string;
      subaccountName?: string;
      productId: number;
      price: number;
      side: BalanceSide;
    }) => {
      const { subaccountOwner, subaccountName } = resolveSubaccount(ctx, input);

      return handleToolRequest(
        'get_max_order_size',
        `Failed to calculate max order size for product ${input.productId}.`,
        async () => {
          const maxSize = (await ctx.client.market.getMaxOrderSize({
            subaccountOwner,
            subaccountName,
            productId: input.productId,
            price: toBigNumber(input.price),
            side: input.side,
          })) as BigNumber;
          return { maxOrderSize: maxSize };
        },
      );
    },
  );
}
