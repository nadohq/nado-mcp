import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ProductEngineType } from '@nadohq/client';
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

      const summary = await ctx.client.subaccount.getSubaccountSummary({
        subaccountOwner: ctx.subaccountOwner,
        subaccountName: ctx.subaccountName,
      });

      const balance = summary.balances.find(
        (b) => b.productId === productId && b.type === ProductEngineType.PERP,
      );

      if (!balance) {
        throw new Error(
          `No perp position found for product ${productId}. Use get_subaccount_summary to check current positions.`,
        );
      }

      const positionAmount = balance.amount;
      if (positionAmount.isZero()) {
        throw new Error(
          `Position for product ${productId} has zero size. Nothing to close.`,
        );
      }

      const isLong = positionAmount.isPositive();
      const closeSide = isLong ? 'short' : 'long';
      const absAmount = positionAmount.abs().toNumber();

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
              closedSide: isLong ? 'long' : 'short',
              closedAmount: absAmount,
              orderSide: closeSide,
              slippagePct: `${slippagePct}%`,
            },
          };
        },
      );
    },
  );
}
