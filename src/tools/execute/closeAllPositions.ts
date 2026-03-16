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
import {
  type BalanceSide,
  ProductIdsSchema,
  SAFETY_DISCLAIMER,
} from '../../utils/schemas';

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

      const positionsSummary: {
        productId: number;
        marginMode: 'cross' | 'isolated';
        side: string;
        size: number;
      }[] = [];

      const crossOrders = await Promise.all(
        crossPositions.map(async (position) => {
          const size = removeDecimals(position.amount).toNumber();

          positionsSummary.push({
            productId: position.productId,
            marginMode: 'cross',
            side: size > 0 ? 'long' : 'short',
            size: Math.abs(size),
          });

          const orderParams = await buildCloseOrder({
            client: ctx.client,
            productId: position.productId,
            amount: -size,
            slippagePct,
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

      const isolatedOrders = await Promise.all(
        filteredIsolated.map(async (pos) => {
          const size = removeDecimals(pos.baseBalance.amount).toNumber();

          positionsSummary.push({
            productId: pos.baseBalance.productId,
            marginMode: 'isolated',
            side: size > 0 ? 'long' : 'short',
            size: Math.abs(size),
          });

          const orderParams = await buildCloseOrder({
            client: ctx.client,
            productId: pos.baseBalance.productId,
            amount: -size,
            slippagePct,
            marginMode: 'isolated',
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

      const allOrders = [...crossOrders, ...isolatedOrders];

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
