import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  ProductEngineType,
  getOrderNonce,
  packOrderAppendix,
  removeDecimals,
} from '@nadohq/client';
import BigNumber from 'bignumber.js';
import { z } from 'zod';

import type { NadoContext } from '../../context';
import { handleToolRequest } from '../../utils/handleToolRequest';
import {
  DEFAULT_SLIPPAGE_PCT,
  roundToIncrement,
} from '../../utils/orderBuilder';
import { requireSigner } from '../../utils/requireSigner';
import {
  type BalanceSide,
  ProductIdsSchema,
  SAFETY_DISCLAIMER,
} from '../../utils/schemas';

const REDUCE_ONLY_IOC_APPENDIX = packOrderAppendix({
  orderExecutionType: 'ioc',
  reduceOnly: true,
});

const REDUCE_ONLY_IOC_ISOLATED_APPENDIX = packOrderAppendix({
  orderExecutionType: 'ioc',
  reduceOnly: true,
  isolated: { margin: 0 },
});

/**
 * Returns an effectively-infinite expiration, matching the trade app.
 * The engine interprets this as seconds; passing milliseconds puts
 * the timestamp around year 58 000 — the order never expires.
 */
function getEngineOrderExpiration(): number {
  return Date.now();
}

export function registerCloseAllPositions(
  server: McpServer,
  ctx: NadoContext,
): void {
  server.registerTool(
    'close_all_positions',
    {
      title: 'Close All Positions',
      description:
        'Close all open perp positions by placing reduce-only market orders for each. ' +
        'Fetches all positions from the subaccount summary and places IOC orders to close each one. ' +
        'Skips positions with zero balance. Optionally filter by product IDs and/or side. ' +
        'Supports both cross-margin and isolated-margin positions. ' +
        SAFETY_DISCLAIMER,
      inputSchema: {
        slippagePct: z
          .number()
          .positive()
          .default(DEFAULT_SLIPPAGE_PCT)
          .describe(
            `Slippage tolerance percentage for all close orders (default: ${DEFAULT_SLIPPAGE_PCT}%)`,
          ),
        productIds: ProductIdsSchema.optional().describe(
          'Filter: only close positions for these product IDs (omit to close all)',
        ),
        side: z
          .enum(['long', 'short'])
          .optional()
          .describe(
            'Filter: only close positions on this side (omit to close both sides)',
          ),
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({
      slippagePct,
      productIds,
      side,
    }: {
      slippagePct: number;
      productIds?: number[];
      side?: BalanceSide;
    }) => {
      requireSigner('close_all_positions', ctx);

      const [summary, isolatedPositions, allMarkets] = await Promise.all([
        ctx.client.subaccount.getSubaccountSummary({
          subaccountOwner: ctx.subaccountOwner,
          subaccountName: ctx.subaccountName,
        }),
        ctx.client.subaccount
          .getIsolatedPositions({
            subaccountOwner: ctx.subaccountOwner,
            subaccountName: ctx.subaccountName,
          })
          .catch(() => []),
        ctx.client.market.getAllMarkets(),
      ]);

      const allProductIds = [
        ...summary.balances
          .filter(
            (b) => b.type === ProductEngineType.PERP && !b.amount.isZero(),
          )
          .map((b) => b.productId),
        ...isolatedPositions
          .filter((p) => !p.baseBalance.amount.isZero())
          .map((p) => p.baseBalance.productId),
      ];
      const uniqueProductIds = [...new Set(allProductIds)];

      const marketPricesMap = new Map<
        number,
        { bid: BigNumber; ask: BigNumber }
      >();
      await Promise.all(
        uniqueProductIds.map(async (pid) => {
          const prices = await ctx.client.market.getLatestMarketPrice({
            productId: pid,
          });
          marketPricesMap.set(pid, prices);
        }),
      );

      const matchesFilter = (
        productId: number,
        isPositive: boolean,
      ): boolean => {
        if (productIds && !productIds.includes(productId)) return false;
        if (side === 'long' && !isPositive) return false;
        if (side === 'short' && isPositive) return false;
        return true;
      };

      const crossPositions = summary.balances.filter((b) => {
        if (b.type !== ProductEngineType.PERP) return false;
        if (b.amount.isZero()) return false;
        return matchesFilter(b.productId, b.amount.isPositive());
      });

      const filteredIsolated = isolatedPositions.filter((p) => {
        if (p.baseBalance.amount.isZero()) return false;
        return matchesFilter(
          p.baseBalance.productId,
          p.baseBalance.amount.isPositive(),
        );
      });

      if (crossPositions.length === 0 && filteredIsolated.length === 0) {
        throw new Error(
          'No open perp positions found (checked both cross and isolated margin). ' +
            'Use get_subaccount_summary to verify.',
        );
      }

      const affectedProductIds = [
        ...new Set([
          ...crossPositions.map((b) => b.productId),
          ...filteredIsolated.map((p) => p.baseBalance.productId),
        ]),
      ];

      await Promise.all([
        ctx.client.market
          .cancelProductOrders({
            subaccountOwner: ctx.subaccountOwner,
            subaccountName: ctx.subaccountName,
            productIds: affectedProductIds,
          })
          .catch(() => {}),
        ctx.client.market
          .cancelTriggerProductOrders({
            subaccountOwner: ctx.subaccountOwner,
            subaccountName: ctx.subaccountName,
            productIds: affectedProductIds,
          })
          .catch(() => {}),
      ]);

      const marketByProductId = new Map(
        allMarkets.map((m) => [
          m.productId,
          {
            priceIncrement: m.priceIncrement,
            sizeIncrement: m.sizeIncrement,
          },
        ]),
      );

      const positionsSummary: {
        productId: number;
        marginMode: 'cross' | 'isolated';
        side: string;
        size: string;
      }[] = [];

      function buildCloseOrderFromBalance(
        balance: {
          productId: number;
          amount: BigNumber;
        },
        marginMode: 'cross' | 'isolated',
      ) {
        const market = marketByProductId.get(balance.productId);
        if (!market) {
          throw new Error(`No market found for product ${balance.productId}.`);
        }

        const closeAmount = roundToIncrement(
          balance.amount.negated(),
          market.sizeIncrement,
          BigNumber.ROUND_DOWN,
        );
        if (closeAmount.isZero()) {
          throw new Error(
            `Close amount is zero after rounding for product ${balance.productId}.`,
          );
        }

        const isBuy = closeAmount.isPositive();
        const slippageFrac = slippagePct / 100;
        const latestPrice = marketPricesMap.get(balance.productId);
        const refPrice = isBuy
          ? (latestPrice?.bid ?? new BigNumber(0))
          : (latestPrice?.ask ?? new BigNumber(0));
        const slippageMultiplier = isBuy ? 1 + slippageFrac : 1 - slippageFrac;
        const closePrice = roundToIncrement(
          refPrice.times(slippageMultiplier),
          market.priceIncrement,
        );

        const appendix =
          marginMode === 'isolated'
            ? REDUCE_ONLY_IOC_ISOLATED_APPENDIX
            : REDUCE_ONLY_IOC_APPENDIX;

        positionsSummary.push({
          productId: balance.productId,
          marginMode,
          side: balance.amount.isPositive() ? 'long' : 'short',
          size: removeDecimals(balance.amount.abs()).toFixed(),
        });

        return {
          productId: balance.productId,
          order: {
            subaccountOwner: ctx.subaccountOwner,
            subaccountName: ctx.subaccountName,
            price: closePrice.toFixed(18, BigNumber.ROUND_DOWN),
            amount: closeAmount.toFixed(0, BigNumber.ROUND_DOWN),
            expiration: getEngineOrderExpiration(),
            nonce: getOrderNonce(),
            appendix,
          },
        };
      }

      const allOrders = [
        ...crossPositions.map((b) => buildCloseOrderFromBalance(b, 'cross')),
        ...filteredIsolated.map((p) =>
          buildCloseOrderFromBalance(p.baseBalance, 'isolated'),
        ),
      ];

      return handleToolRequest(
        'close_all_positions',
        'Failed to close all positions',
        async () => {
          const result = await ctx.client.market.placeOrders({
            orders: allOrders,
          });

          return {
            ...result,
            summary: {
              positionsClosed: allOrders.length,
              slippagePct: `${slippagePct}%`,
              positions: positionsSummary,
            },
          };
        },
      );
    },
  );
}
