import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ProductEngineType } from '@nadohq/client';
import BigNumber from 'bignumber.js';
import { z } from 'zod';

import type { NadoClientWithAccount } from '../../client.js';
import { asyncResult } from '../../utils/asyncResult.js';
import {
  buildOrderParams,
  resolveOrderParams,
} from '../../utils/orderBuilder.js';
import { requireSigner } from '../../utils/requireSigner.js';
import { ProductIdsSchema } from '../../utils/schemas.js';

export function registerCloseAllPositions(
  server: McpServer,
  ctx: NadoClientWithAccount,
): void {
  server.registerTool(
    'close_all_positions',
    {
      title: 'Close All Positions',
      description:
        'Close all open perp positions by placing reduce-only market orders for each. ' +
        'Fetches all positions from the subaccount summary and places IOC orders to close each one. ' +
        'Skips positions with zero balance. Optionally filter by product IDs and/or side.',
      inputSchema: {
        slippagePct: z
          .number()
          .positive()
          .default(2)
          .describe(
            'Slippage tolerance percentage for all close orders (default: 2%)',
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
      annotations: { readOnlyHint: false },
    },
    async ({
      slippagePct,
      productIds,
      side,
    }: {
      slippagePct: number;
      productIds?: number[];
      side?: 'long' | 'short';
    }) => {
      requireSigner('close_all_positions', ctx);

      const summary = await ctx.client.subaccount.getSubaccountSummary({
        subaccountOwner: ctx.subaccountOwner,
        subaccountName: ctx.subaccountName,
      });

      const perpPositions = summary.balances.filter((b) => {
        if (b.type !== ProductEngineType.PERP) return false;
        const amount = new BigNumber(b.amount.toString());
        if (amount.isZero()) return false;
        if (productIds && !productIds.includes(b.productId)) return false;
        if (side === 'long' && amount.isNegative()) return false;
        if (side === 'short' && amount.isPositive()) return false;
        return true;
      });

      if (perpPositions.length === 0) {
        throw new Error(
          'No open perp positions found. Use get_subaccount_summary to verify.',
        );
      }

      const orders = await Promise.all(
        perpPositions.map(async (position) => {
          const positionAmount = new BigNumber(position.amount.toString());
          const isLong = positionAmount.isPositive();
          const closeSide = isLong ? ('short' as const) : ('long' as const);
          const absAmount = positionAmount.abs().toNumber();

          const resolved = await resolveOrderParams(
            ctx.client,
            position.productId,
            closeSide,
            absAmount,
            undefined,
            slippagePct,
          );

          const orderParams = buildOrderParams({
            productId: position.productId,
            side: closeSide,
            amountX18: resolved.amountX18,
            price: resolved.price,
            orderExecutionType: 'ioc',
            reduceOnly: true,
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
        'close_all_positions',
        'Failed to close all positions',
        async () => {
          const result = await ctx.client.market.placeOrders({
            orders,
          });

          return {
            ...result,
            summary: {
              positionsClosed: perpPositions.length,
              slippagePct: `${slippagePct}%`,
              positions: perpPositions.map((p) => {
                const amount = new BigNumber(p.amount.toString());
                return {
                  productId: p.productId,
                  side: amount.isPositive() ? 'long' : 'short',
                  size: amount.abs().toNumber(),
                };
              }),
            },
          };
        },
      );
    },
  );
}
