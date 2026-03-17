import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ProductEngineType, removeDecimals } from '@nadohq/client';
import { z } from 'zod';

import type { NadoContext } from '../../context';
import { handleToolRequest } from '../../utils/handleToolRequest';
import {
  DEFAULT_SLIPPAGE_PCT,
  buildCloseOrder,
} from '../../utils/orderBuilder';
import { requireSigner } from '../../utils/requireSigner';
import { ProductIdSchema, SAFETY_DISCLAIMER } from '../../utils/schemas';

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

      let size: number;
      let marginMode: 'cross' | 'isolated';

      if (hasCrossPosition) {
        size = removeDecimals(crossBalance.amount).toNumber();
        marginMode = 'cross';
      } else if (isolatedPos) {
        size = removeDecimals(isolatedPos.baseBalance.amount).toNumber();
        marginMode = 'isolated';
      } else {
        throw new Error(
          `No open position found for product ${productId} (checked both cross and isolated margin). ` +
            'Use get_subaccount_summary to check current positions.',
        );
      }

      const orderParams = await buildCloseOrder({
        client: ctx.client,
        productId,
        amount: -size,
        slippagePct,
        marginMode: marginMode === 'isolated' ? 'isolated' : undefined,
      });

      return handleToolRequest(
        'close_position',
        `Failed to close ${marginMode} position for product ${productId}`,
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
              marginMode,
              closedSide: size > 0 ? 'long' : 'short',
              closedSize: Math.abs(size),
              slippagePct: `${slippagePct}%`,
            },
          };
        },
      );
    },
  );
}
