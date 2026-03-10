import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { NadoContext } from '../../context.js';
import { handleToolRequest } from '../../utils/handleToolRequest.js';
import { buildOrder } from '../../utils/orderBuilder.js';
import { requireSigner } from '../../utils/requireSigner.js';
import {
  type BalanceSide,
  BalanceSideSchema,
  ProductIdSchema,
} from '../../utils/schemas.js';

export function registerPlaceScaledOrders(
  server: McpServer,
  ctx: NadoContext,
): void {
  server.registerTool(
    'place_scaled_orders',
    {
      title: 'Place Scaled Orders',
      description:
        'Place multiple limit orders in a single batch. ' +
        'Accepts parallel arrays of prices and amounts, allowing full flexibility ' +
        '(linear grids, exponential spacing, custom distributions, etc.). ' +
        'Both arrays must have the same length (max 50). ' +
        'All orders are placed as GTC limit orders using cross margin. ' +
        'SAFETY: You MUST present an execution summary and receive explicit user confirmation BEFORE calling this tool. Never call in the same turn as the summary.',
      inputSchema: {
        productId: ProductIdSchema,
        side: BalanceSideSchema,
        prices: z
          .array(z.number().positive())
          .min(1)
          .max(50)
          .describe('Limit prices for each order'),
        amounts: z
          .array(z.number().positive())
          .min(1)
          .max(50)
          .describe('Sizes in base asset units for each order'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({
      productId,
      side,
      prices,
      amounts,
    }: {
      productId: number;
      side: BalanceSide;
      prices: number[];
      amounts: number[];
    }) => {
      requireSigner('place_scaled_orders', ctx);

      if (prices.length !== amounts.length) {
        throw new Error(
          `prices (${prices.length}) and amounts (${amounts.length}) must have the same length.`,
        );
      }

      const orders = await Promise.all(
        prices.map(async (price, i) => {
          const orderParams = await buildOrder({
            client: ctx.client,
            productId,
            side,
            amount: amounts[i],
            price,
            orderExecutionType: 'default',
            reduceOnly: false,
          });

          return {
            ...orderParams,
            order: {
              subaccountOwner: ctx.subaccountOwner,
              subaccountName: ctx.subaccountName,
              ...orderParams.order,
            },
          };
        }),
      );

      return handleToolRequest(
        'place_scaled_orders',
        `Failed to place scaled ${side} orders for product ${productId}`,
        async () => {
          const result = await ctx.client.market.placeOrders({
            orders,
          });

          return {
            ...result,
            summary: {
              side,
              productId,
              numberOfOrders: prices.length,
              totalAmount: amounts.reduce((a, b) => a + b, 0),
              orders: prices.map((p, i) => ({
                price: p,
                amount: amounts[i],
              })),
            },
          };
        },
      );
    },
  );
}
