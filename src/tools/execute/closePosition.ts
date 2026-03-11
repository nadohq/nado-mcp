import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ProductEngineType, removeDecimals } from '@nadohq/client';
import { z } from 'zod';

import type { NadoContext } from '../../context.js';
import { handleToolRequest } from '../../utils/handleToolRequest.js';
import { DEFAULT_SLIPPAGE_PCT, buildOrder } from '../../utils/orderBuilder.js';
import { requireSigner } from '../../utils/requireSigner.js';
import { ProductIdSchema } from '../../utils/schemas.js';

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
        'SAFETY: You MUST present an execution summary and receive explicit user confirmation BEFORE calling this tool. Never call in the same turn as the summary.',
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

      const [summary, isolatedPositions] = await Promise.all([
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

      if (hasCrossPosition) {
        const positionAmount = crossBalance.amount;
        const isLong = positionAmount.isPositive();
        const closeSide = isLong ? ('short' as const) : ('long' as const);
        const absAmount = removeDecimals(positionAmount.abs()).toNumber();

        const orderParams = await buildOrder({
          client: ctx.client,
          productId,
          side: closeSide,
          amount: absAmount,
          slippagePct,
          orderExecutionType: 'ioc',
          reduceOnly: true,
        });

        return handleToolRequest(
          'close_position',
          `Failed to close position for product ${productId}`,
          async () => {
            const result = await ctx.client.market.placeOrder({
              ...orderParams,
              order: {
                subaccountOwner: ctx.subaccountOwner,
                subaccountName: ctx.subaccountName,
                ...orderParams.order,
              },
            });

            return {
              ...result,
              summary: {
                productId,
                marginMode: 'cross',
                closedSide: isLong ? 'long' : 'short',
                closedAmount: absAmount,
                orderSide: closeSide,
                slippagePct: `${slippagePct}%`,
              },
            };
          },
        );
      }

      const positionAmount = isolatedPos!.baseBalance.amount;
      const isLong = positionAmount.isPositive();
      const closeSide = isLong ? ('short' as const) : ('long' as const);
      const absAmount = removeDecimals(positionAmount.abs()).toNumber();

      const oraclePrice = Number(isolatedPos!.baseBalance.oraclePrice);
      const margin = removeDecimals(
        isolatedPos!.quoteBalance.amount,
      ).toNumber();
      const notional = absAmount * oraclePrice;
      const leverage = margin > 0 ? Math.max(1, notional / margin) : 10;

      const orderParams = await buildOrder({
        client: ctx.client,
        productId,
        side: closeSide,
        amount: absAmount,
        slippagePct,
        orderExecutionType: 'ioc',
        reduceOnly: true,
        marginMode: 'isolated',
        leverage,
      });

      return handleToolRequest(
        'close_position',
        `Failed to close isolated position for product ${productId}`,
        async () => {
          const result = await ctx.client.market.placeOrder({
            ...orderParams,
            order: {
              subaccountOwner: ctx.subaccountOwner,
              subaccountName: ctx.subaccountName,
              ...orderParams.order,
            },
          });

          return {
            ...result,
            summary: {
              productId,
              marginMode: 'isolated',
              closedSide: isLong ? 'long' : 'short',
              closedAmount: absAmount,
              orderSide: closeSide,
              leverage: leverage.toFixed(2),
              slippagePct: `${slippagePct}%`,
            },
          };
        },
      );
    },
  );
}
