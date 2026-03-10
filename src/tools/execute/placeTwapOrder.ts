import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { toBigDecimal } from '@nadohq/client';
import { z } from 'zod';

import type { NadoContext } from '../../context.js';
import { handleToolRequest } from '../../utils/handleToolRequest.js';
import {
  DEFAULT_SLIPPAGE_PCT,
  buildOrder,
  calculateTwapExpiration,
} from '../../utils/orderBuilder.js';
import { requireSigner } from '../../utils/requireSigner.js';
import {
  type BalanceSide,
  BalanceSideSchema,
  ProductIdSchema,
} from '../../utils/schemas.js';

export function registerPlaceTwapOrder(
  server: McpServer,
  ctx: NadoContext,
): void {
  server.registerTool(
    'place_twap_order',
    {
      title: 'Place TWAP Order',
      description:
        'Place a TWAP (Time-Weighted Average Price) order that splits a total amount into equal orders executed at regular intervals. ' +
        'Uses cross margin only (TWAP cannot use isolated margin). ' +
        'Each order is executed as an IOC market order with oracle-based slippage protection. ' +
        'SAFETY: You MUST present an execution summary and receive explicit user confirmation BEFORE calling this tool. Never call in the same turn as the summary.',
      inputSchema: {
        productId: ProductIdSchema,
        side: BalanceSideSchema,
        amountPerOrder: z
          .number()
          .positive()
          .describe(
            'Notional USD value per TWAP order (e.g. 50 for $50 per order)',
          ),
        intervalSeconds: z
          .number()
          .int()
          .positive()
          .default(30)
          .describe('Seconds between each order (default: 30)'),
        durationMinutes: z
          .number()
          .positive()
          .describe('Total TWAP duration in minutes (e.g. 10 for 10 minutes)'),
        slippagePct: z
          .number()
          .positive()
          .default(DEFAULT_SLIPPAGE_PCT)
          .describe(
            `Max slippage per order as percentage, based on oracle price at execution time (default: ${DEFAULT_SLIPPAGE_PCT}%)`,
          ),
        reduceOnly: z
          .boolean()
          .default(false)
          .describe('If true, only reduces an existing position'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
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
      side: BalanceSide;
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
          `TWAP requires at least 2 orders. Duration ${durationMinutes}min / interval ${intervalSeconds}s = ${numOrders} orders.`,
        );
      }

      const totalNotional = toBigDecimal(amountPerOrder).times(numOrders);

      const marketPrice = await ctx.client.market.getLatestMarketPrice({
        productId,
      });
      const refPrice = side === 'long' ? marketPrice.ask : marketPrice.bid;
      if (refPrice.lte(0)) {
        throw new Error(
          `No ${side === 'long' ? 'ask' : 'bid'} price available for product ${productId}.`,
        );
      }

      const totalAmount = totalNotional.dividedBy(refPrice).toNumber();

      const expirationSecs = calculateTwapExpiration(
        numOrders,
        intervalSeconds,
      );

      const twapParams = await buildOrder({
        client: ctx.client,
        productId,
        side,
        amount: totalAmount,
        slippagePct,
        orderExecutionType: 'ioc',
        reduceOnly,
        twap: {
          numOrders,
          slippageFrac: slippagePct / 100,
        },
        expirationSecs,
      });

      return handleToolRequest(
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
              totalNotional: totalNotional.toFixed(2),
              amountPerOrder: toBigDecimal(amountPerOrder).toFixed(2),
              numOrders,
              intervalSeconds,
              totalDuration: `${durationMinutes} minutes`,
              slippagePct: `${slippagePct}%`,
              referencePrice: refPrice.toFixed(),
            },
          };
        },
      );
    },
  );
}
