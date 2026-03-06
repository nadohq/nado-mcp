import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { NadoClientWithAccount } from '../../client.js';
import { asyncResult } from '../../utils/asyncResult.js';
import {
  buildOrderParams,
  resolveOrderParams,
} from '../../utils/orderBuilder.js';
import { requireSigner } from '../../utils/requireSigner.js';
import { BalanceSideSchema, ProductIdSchema } from '../../utils/schemas.js';

function generatePrices(
  start: number,
  end: number,
  count: number,
  distribution: 'linear' | 'exponential',
): number[] {
  if (count === 1) return [start];

  const prices: number[] = [];

  if (distribution === 'linear') {
    const step = (end - start) / (count - 1);
    for (let i = 0; i < count; i++) {
      prices.push(start + step * i);
    }
  } else {
    const logStart = Math.log(start);
    const logEnd = Math.log(end);
    const logStep = (logEnd - logStart) / (count - 1);
    for (let i = 0; i < count; i++) {
      prices.push(Math.exp(logStart + logStep * i));
    }
  }

  return prices;
}

function generateSizes(
  totalAmount: number,
  count: number,
  distribution: 'uniform' | 'ascending' | 'descending',
): number[] {
  if (distribution === 'uniform') {
    const size = totalAmount / count;
    return Array(count).fill(size) as number[];
  }

  // Weighted distribution: ascending gives more weight to later orders (closer to endPrice),
  // descending gives more weight to earlier orders (closer to startPrice)
  const weights: number[] = [];
  for (let i = 1; i <= count; i++) {
    weights.push(distribution === 'ascending' ? i : count - i + 1);
  }
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => (w / totalWeight) * totalAmount);
}

export function registerPlaceScaledOrders(
  server: McpServer,
  ctx: NadoClientWithAccount,
): void {
  server.registerTool(
    'place_scaled_orders',
    {
      title: 'Place Scaled Orders',
      description:
        'Place multiple limit orders distributed across a price range (DCA / grid). ' +
        'Orders are placed as GTC limit orders using cross margin. ' +
        'Use linear price distribution for even spacing, exponential for tighter clustering near the start price. ' +
        'Size distribution controls how the total amount is split: uniform for equal sizes, ascending for larger orders at the end price, descending for larger orders at the start price.',
      inputSchema: {
        productId: ProductIdSchema,
        side: BalanceSideSchema,
        totalAmount: z
          .number()
          .positive()
          .describe(
            'Total order size in base asset units to distribute across all orders',
          ),
        startPrice: z.number().positive().describe('Start of the price range'),
        endPrice: z.number().positive().describe('End of the price range'),
        numberOfOrders: z
          .number()
          .int()
          .min(2)
          .max(50)
          .describe('Number of limit orders to place (2-50)'),
        priceDistribution: z
          .enum(['linear', 'exponential'])
          .default('linear')
          .describe(
            'How prices are distributed: linear (even spacing) or exponential (tighter near start)',
          ),
        sizeDistribution: z
          .enum(['uniform', 'ascending', 'descending'])
          .default('uniform')
          .describe(
            'How total size is distributed: uniform (equal), ascending (larger at end price), descending (larger at start price)',
          ),
      },
      annotations: { readOnlyHint: false },
    },
    async ({
      productId,
      side,
      totalAmount,
      startPrice,
      endPrice,
      numberOfOrders,
      priceDistribution,
      sizeDistribution,
    }: {
      productId: number;
      side: 'long' | 'short';
      totalAmount: number;
      startPrice: number;
      endPrice: number;
      numberOfOrders: number;
      priceDistribution: 'linear' | 'exponential';
      sizeDistribution: 'uniform' | 'ascending' | 'descending';
    }) => {
      requireSigner('place_scaled_orders', ctx);

      const prices = generatePrices(
        startPrice,
        endPrice,
        numberOfOrders,
        priceDistribution,
      );
      const sizes = generateSizes(
        totalAmount,
        numberOfOrders,
        sizeDistribution,
      );

      const orders = await Promise.all(
        prices.map(async (price, i) => {
          const resolved = await resolveOrderParams(
            ctx.client,
            productId,
            side,
            sizes[i],
            price,
          );

          const orderParams = buildOrderParams({
            productId,
            side,
            amountX18: resolved.amountX18,
            price: resolved.price,
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

      return asyncResult(
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
              numberOfOrders,
              priceRange: `${startPrice} - ${endPrice}`,
              priceDistribution,
              totalAmount,
              sizeDistribution,
              orders: prices.map((p, i) => ({
                price: p.toFixed(4),
                size: sizes[i].toFixed(6),
              })),
            },
          };
        },
      );
    },
  );
}
