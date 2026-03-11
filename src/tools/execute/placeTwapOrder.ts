import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { addDecimals, packOrderAppendix, toBigDecimal } from '@nadohq/client';
import BigNumber from 'bignumber.js';
import { z } from 'zod';

import type { NadoContext } from '../../context.js';
import { handleToolRequest } from '../../utils/handleToolRequest.js';
import {
  DEFAULT_SLIPPAGE_PCT,
  calculateTwapExpiration,
} from '../../utils/orderBuilder.js';
import { requireSigner } from '../../utils/requireSigner.js';
import {
  type BalanceSide,
  BalanceSideSchema,
  ProductIdSchema,
} from '../../utils/schemas.js';

function roundToIncrement(value: BigNumber, increment: BigNumber): BigNumber {
  if (increment.isZero()) return value;
  return value
    .dividedBy(increment)
    .integerValue(BigNumber.ROUND_DOWN)
    .times(increment);
}

/**
 * Computes per-order amounts for a TWAP, rounded to the market's size
 * increment. Any rounding remainder is redistributed across orders so the
 * sum exactly equals the intended total.
 */
function computeTwapAmounts(
  totalAmount: BigNumber,
  numOrders: number,
  sizeIncrement: BigNumber,
): BigNumber[] {
  const perOrder = totalAmount.dividedBy(numOrders);
  const rounded = Array.from({ length: numOrders }, () =>
    roundToIncrement(perOrder, sizeIncrement),
  );

  if (!sizeIncrement.isZero()) {
    let diff = totalAmount.minus(
      rounded.reduce((s, a) => s.plus(a), new BigNumber(0)),
    );
    for (let i = 0; i < numOrders && !diff.isZero(); i++) {
      const adj = diff.isPositive() ? sizeIncrement : sizeIncrement.negated();
      rounded[i] = rounded[i].plus(adj);
      diff = diff.minus(adj);
    }
  }

  return rounded;
}

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

      // Frontend: floor(duration / interval) + 1  (first order is immediate)
      const numOrders =
        Math.floor((durationMinutes * 60) / intervalSeconds) + 1;
      if (numOrders < 2) {
        throw new Error(
          `TWAP requires at least 2 orders. Duration ${durationMinutes}min / interval ${intervalSeconds}s = ${numOrders} orders.`,
        );
      }

      const allMarkets = await ctx.client.market.getAllMarkets();
      const market = allMarkets.find((m) => m.productId === productId);
      const sizeIncrement = market ? market.sizeIncrement : new BigNumber(1);
      const priceIncrement = market ? market.priceIncrement : new BigNumber(1);

      const marketPrice = await ctx.client.market.getLatestMarketPrice({
        productId,
      });
      const refPrice = side === 'long' ? marketPrice.ask : marketPrice.bid;
      if (refPrice.lte(0)) {
        throw new Error(
          `No ${side === 'long' ? 'ask' : 'bid'} price available for product ${productId}.`,
        );
      }

      const totalNotional = toBigDecimal(amountPerOrder).times(numOrders);
      const totalHumanAmount = totalNotional.dividedBy(refPrice);

      // Compute per-order amounts in human units, rounded to sizeIncrement,
      // then convert each to x18.
      const sizeIncrementHuman = market
        ? toBigDecimal(market.sizeIncrement).dividedBy(toBigDecimal(10).pow(18))
        : new BigNumber(0);

      const perOrderAmounts = computeTwapAmounts(
        totalHumanAmount,
        numOrders,
        sizeIncrementHuman,
      );

      // x18 signed amounts for the trigger criteria
      const amountsX18 = perOrderAmounts.map((amt) => {
        const x18 = roundToIncrement(
          toBigDecimal(addDecimals(amt.abs().toNumber())),
          sizeIncrement,
        );
        return side === 'short' ? x18.negated() : x18;
      });

      // Total amount = sum of per-order amounts (ensures no mismatch)
      const totalAmountX18 = amountsX18.reduce(
        (sum, a) => sum.plus(a),
        new BigNumber(0),
      );

      // Frontend: Long → price * 1000, Short → 0 (permissive price for oracle-based slippage)
      const orderPrice =
        side === 'long'
          ? roundToIncrement(refPrice.times(1000), priceIncrement).toFixed()
          : '0';

      const expiration = calculateTwapExpiration(numOrders, intervalSeconds);

      const appendix = packOrderAppendix({
        orderExecutionType: 'ioc',
        triggerType: 'twap_custom_amounts',
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
                    amounts: amountsX18.map((a) => a.toFixed(0)),
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
