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
import { ProductIdSchema, SAFETY_DISCLAIMER } from '../../utils/schemas';

const REDUCE_ONLY_IOC_APPENDIX = packOrderAppendix({
  orderExecutionType: 'ioc',
  reduceOnly: true,
});

const REDUCE_ONLY_IOC_ISOLATED_APPENDIX = packOrderAppendix({
  orderExecutionType: 'ioc',
  reduceOnly: true,
  isolated: { margin: 0 },
});

export function registerClosePosition(
  server: McpServer,
  ctx: NadoContext,
): void {
  server.registerTool(
    'close_position',
    {
      title: 'Close Position',
      description:
        'Close an open position by placing a reduce-only market order in the opposite direction. ' +
        'Fetches the current position size automatically and places a full close. ' +
        'Only works for perp positions with a non-zero balance. ' +
        'Supports both cross-margin and isolated-margin positions (checks cross first, then isolated). ' +
        SAFETY_DISCLAIMER,
      inputSchema: {
        productId: ProductIdSchema.describe(
          'Product ID of the position to close',
        ),
        slippagePct: z
          .number()
          .positive()
          .default(DEFAULT_SLIPPAGE_PCT)
          .describe(
            `Slippage tolerance percentage (default: ${DEFAULT_SLIPPAGE_PCT}%)`,
          ),
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({
      productId,
      slippagePct,
    }: {
      productId: number;
      slippagePct: number;
    }) => {
      requireSigner('close_position', ctx);

      await Promise.all([
        ctx.client.market
          .cancelProductOrders({
            subaccountOwner: ctx.subaccountOwner,
            subaccountName: ctx.subaccountName,
            productIds: [productId],
          })
          .catch(() => {}),
        ctx.client.market
          .cancelTriggerProductOrders({
            subaccountOwner: ctx.subaccountOwner,
            subaccountName: ctx.subaccountName,
            productIds: [productId],
          })
          .catch(() => {}),
      ]);

      const [summary, isolatedPositions, allMarkets, latestMarketPrice] =
        await Promise.all([
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
          ctx.client.market.getLatestMarketPrice({ productId }),
        ]);

      const crossBalance = summary.balances.find(
        (b) => b.productId === productId && b.type === ProductEngineType.PERP,
      );
      const hasCrossPosition = crossBalance && !crossBalance.amount.isZero();

      const isolatedPos = isolatedPositions.find(
        (p) =>
          p.baseBalance.productId === productId &&
          !p.baseBalance.amount.isZero(),
      );

      if (!hasCrossPosition && !isolatedPos) {
        throw new Error(
          `No open position found for product ${productId} (checked both cross and isolated margin). ` +
            'Use get_subaccount_summary to check current positions.',
        );
      }

      const balance = hasCrossPosition
        ? crossBalance
        : isolatedPos!.baseBalance;
      const marginMode: 'cross' | 'isolated' = hasCrossPosition
        ? 'cross'
        : 'isolated';

      const market = allMarkets.find((m) => m.productId === productId);
      if (!market) {
        throw new Error(`No market found for product ${productId}.`);
      }

      const closeAmount = roundToIncrement(
        balance.amount.negated(),
        market.sizeIncrement,
        BigNumber.ROUND_DOWN,
      );
      if (closeAmount.isZero()) {
        throw new Error(
          `Close amount is zero after rounding for product ${productId}.`,
        );
      }

      const isBuy = closeAmount.isPositive();
      const slippageFrac = slippagePct / 100;
      const refPrice = isBuy ? latestMarketPrice.bid : latestMarketPrice.ask;
      const slippageMultiplier = isBuy ? 1 + slippageFrac : 1 - slippageFrac;
      const closePrice = roundToIncrement(
        refPrice.times(slippageMultiplier),
        market.priceIncrement,
      );

      const appendix =
        marginMode === 'isolated'
          ? REDUCE_ONLY_IOC_ISOLATED_APPENDIX
          : REDUCE_ONLY_IOC_APPENDIX;

      const orderParams = {
        productId,
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

      return handleToolRequest(
        'close_position',
        `Failed to close ${marginMode} position for product ${productId}`,
        async () => {
          const result = await ctx.client.market.placeOrder(orderParams);

          const size = removeDecimals(balance.amount.abs());
          return {
            ...result,
            summary: {
              productId,
              marginMode,
              closedSide: balance.amount.isPositive() ? 'long' : 'short',
              closedSize: size.toFixed(),
              slippagePct: `${slippagePct}%`,
            },
          };
        },
      );
    },
  );
}

/**
 * Returns an effectively-infinite expiration, matching the trade app.
 * The engine interprets this as seconds; passing milliseconds puts
 * the timestamp around year 58 000 — the order never expires.
 */
function getEngineOrderExpiration(): number {
  return Date.now();
}
