import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  addDecimals,
  packOrderAppendix,
  removeDecimals,
  toBigDecimal,
} from '@nadohq/client';
import { z } from 'zod';

import type { NadoContext } from '../../context';
import { handleToolRequest } from '../../utils/handleToolRequest';
import {
  DEFAULT_SLIPPAGE_PCT,
  calculateTwapExpiration,
  roundToIncrement,
} from '../../utils/orderBuilder';
import { requireSigner } from '../../utils/requireSigner';
import {
  type BalanceSide,
  BalanceSideSchema,
  ProductIdSchema,
  SAFETY_DISCLAIMER,
} from '../../utils/schemas';

export function registerPlaceTwapOrder(
  server: McpServer,
  ctx: NadoContext,
): void {
  server.registerTool(
    'place_twap_order',
    {
      title: 'Place TWAP Order',
      description:
        'Place a TWAP (Time-Weighted Average Price) order that splits a total base amount into equal orders executed at regular intervals. ' +
        'Amount is in base asset units (e.g. 0.1 for 0.1 BTC), NOT USD notional. ' +
        'Uses cross margin only (TWAP cannot use isolated margin). ' +
        'Each order is executed as an IOC market order with oracle-based slippage protection. ' +
        SAFETY_DISCLAIMER,
      inputSchema: {
        productId: ProductIdSchema,
        side: BalanceSideSchema,
        amount: z
          .number()
          .positive()
          .describe(
            'Total order size in base asset units (e.g. 0.1 for 0.1 BTC). Split evenly across all sub-orders.',
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
      amount,
      intervalSeconds,
      durationMinutes,
      slippagePct,
      reduceOnly,
    }: {
      productId: number;
      side: BalanceSide;
      amount: number;
      intervalSeconds: number;
      durationMinutes: number;
      slippagePct: number;
      reduceOnly: boolean;
    }) => {
      requireSigner('place_twap_order', ctx);

      const numOrders =
        Math.floor((durationMinutes * 60) / intervalSeconds) + 1;
      if (numOrders < 2) {
        throw new Error(
          `TWAP requires at least 2 orders. Duration ${durationMinutes}min / interval ${intervalSeconds}s = ${numOrders} orders.`,
        );
      }

      const allMarkets = await ctx.client.market.getAllMarkets();
      const market = allMarkets.find((m) => m.productId === productId);
      if (!market) {
        throw new Error(
          `Unknown product ${productId}. Use get_all_markets to find valid product IDs.`,
        );
      }
      const { sizeIncrement, priceIncrement } = market;

      const isLong = side === 'long';

      const marketPrice = await ctx.client.market.getLatestMarketPrice({
        productId,
      });
      const refPrice = isLong ? marketPrice.ask : marketPrice.bid;
      if (refPrice.lte(0)) {
        throw new Error(
          `No ${isLong ? 'ask' : 'bid'} price available for product ${productId}.`,
        );
      }

      const perOrderAmount = roundToIncrement(
        toBigDecimal(addDecimals(amount / numOrders)),
        sizeIncrement,
      );

      const perOrderSigned = isLong ? perOrderAmount : perOrderAmount.negated();
      const totalAmountX18 = perOrderSigned.times(numOrders);

      const orderPrice = isLong
        ? roundToIncrement(refPrice.times(1000), priceIncrement).toFixed()
        : '0';

      const expiration = calculateTwapExpiration(numOrders, intervalSeconds);

      const appendix = packOrderAppendix({
        orderExecutionType: 'ioc',
        triggerType: 'twap',
        reduceOnly,
        twap: {
          numOrders,
          slippageFrac: slippagePct / 100,
        },
      });

      const order = {
        subaccountOwner: ctx.subaccountOwner,
        subaccountName: ctx.subaccountName,
        price: orderPrice,
        amount: totalAmountX18.toFixed(0),
        expiration,
        appendix,
      };

      return handleToolRequest(
        'place_twap_order',
        `Failed to place TWAP ${side} order for product ${productId}`,
        async () => {
          const result = await ctx.client.market.placeTriggerOrders({
            orders: [
              {
                productId,
                order,
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
              totalAmount: amount,
              perOrderAmount: removeDecimals(perOrderAmount).toFixed(),
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
