import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { NadoClientWithAccount } from '../../client.js';
import { asyncResult } from '../../utils/asyncResult.js';
import {
  buildTwapOrderParams,
  calculateTwapExpiration,
  resolveOrderParams,
} from '../../utils/orderBuilder.js';
import { requireSigner } from '../../utils/requireSigner.js';
import { BalanceSideSchema, ProductIdSchema } from '../../utils/schemas.js';

export function registerPlaceTwapOrder(
  server: McpServer,
  ctx: NadoClientWithAccount,
): void {
  server.registerTool(
    'place_twap_order',
    {
      title: 'Place TWAP Order',
      description:
        'Place a TWAP (Time-Weighted Average Price) order that splits a total amount into equal slices executed at regular intervals. ' +
        'Uses cross margin only (TWAP cannot use isolated margin). ' +
        'Each slice is executed as an IOC market order with oracle-based slippage protection.',
      inputSchema: {
        productId: ProductIdSchema,
        side: BalanceSideSchema,
        amountPerOrder: z
          .number()
          .positive()
          .describe(
            'Notional USD value per TWAP slice (e.g. 50 for $50 per slice)',
          ),
        intervalSeconds: z
          .number()
          .int()
          .positive()
          .default(30)
          .describe('Seconds between each slice (default: 30)'),
        durationMinutes: z
          .number()
          .positive()
          .describe('Total TWAP duration in minutes (e.g. 10 for 10 minutes)'),
        slippagePct: z
          .number()
          .positive()
          .default(2)
          .describe(
            'Max slippage per slice as percentage, based on oracle price at execution time (default: 2%)',
          ),
        reduceOnly: z
          .boolean()
          .default(false)
          .describe('If true, only reduces an existing position'),
      },
      annotations: { readOnlyHint: false },
    },
    async ({
      productId,
      side,
      amountPerOrder,
      intervalSeconds,
      durationMinutes,
      slippagePct,
      reduceOnly,
    }: {
      productId: number;
      side: 'long' | 'short';
      amountPerOrder: number;
      intervalSeconds: number;
      durationMinutes: number;
      slippagePct: number;
      reduceOnly: boolean;
    }) => {
      requireSigner('place_twap_order', ctx);

      const numOrders = Math.floor((durationMinutes * 60) / intervalSeconds);
      if (numOrders < 2) {
        throw new Error(
          `TWAP requires at least 2 slices. Duration ${durationMinutes}min / interval ${intervalSeconds}s = ${numOrders} slices.`,
        );
      }

      const totalNotional = amountPerOrder * numOrders;

      const marketPrice = await ctx.client.market.getLatestMarketPrice({
        productId,
      });
      const refPrice =
        side === 'long' ? Number(marketPrice.ask) : Number(marketPrice.bid);
      if (refPrice <= 0) {
        throw new Error(
          `No ${side === 'long' ? 'ask' : 'bid'} price available for product ${productId}.`,
        );
      }

      const totalAmount = totalNotional / refPrice;

      const resolved = await resolveOrderParams(
        ctx.client,
        productId,
        side,
        totalAmount,
        undefined,
        slippagePct,
      );

      const expirationSecs = calculateTwapExpiration(
        numOrders,
        intervalSeconds,
      );

      const twapParams = buildTwapOrderParams({
        productId,
        side,
        amountX18: resolved.amountX18,
        price: resolved.price,
        reduceOnly,
        twap: {
          numOrders,
          slippageFrac: slippagePct / 100,
        },
        expirationSecs,
      });

      return asyncResult(
        'place_twap_order',
        `Failed to place TWAP ${side} order for product ${productId}`,
        async () => {
          const result = await ctx.client.market.placeTriggerOrders({
            orders: [
              {
                productId: twapParams.productId,
                order: {
                  subaccountOwner: ctx.subaccountOwner,
                  subaccountName: ctx.subaccountName,
                  ...twapParams.order,
                },
                triggerCriteria: {
                  type: 'time' as const,
                  criteria: {
                    interval: intervalSeconds,
                  },
                },
              },
            ],
          });

          return {
            ...result,
            summary: {
              side,
              productId,
              totalNotional: `$${totalNotional.toFixed(2)}`,
              amountPerSlice: `$${amountPerOrder.toFixed(2)}`,
              numOrders,
              intervalSeconds,
              totalDuration: `${durationMinutes} minutes`,
              slippagePct: `${slippagePct}%`,
              referencePrice: refPrice,
            },
          };
        },
      );
    },
  );
}
