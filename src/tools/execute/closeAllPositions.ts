import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ProductEngineType, removeDecimals } from '@nadohq/client';
import { z } from 'zod';

import type { NadoContext } from '../../context.js';
import { handleToolRequest } from '../../utils/handleToolRequest.js';
import { DEFAULT_SLIPPAGE_PCT, buildOrder } from '../../utils/orderBuilder.js';
import { requireSigner } from '../../utils/requireSigner.js';
import { type BalanceSide, ProductIdsSchema } from '../../utils/schemas.js';

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
        'SAFETY: You MUST present an execution summary and receive explicit user confirmation BEFORE calling this tool. Never call in the same turn as the summary.',
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

      const crossOrders = await Promise.all(
        crossPositions.map(async (position) => {
          const positionAmount = position.amount;
          const isLong = positionAmount.isPositive();
          const closeSide = isLong ? ('short' as const) : ('long' as const);
          const absAmount = removeDecimals(positionAmount.abs()).toNumber();

          const orderParams = await buildOrder({
            client: ctx.client,
            productId: position.productId,
            side: closeSide,
            amount: absAmount,
            slippagePct,
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

      const isolatedOrders = await Promise.all(
        filteredIsolated.map(async (pos) => {
          const positionAmount = pos.baseBalance.amount;
          const isLong = positionAmount.isPositive();
          const closeSide = isLong ? ('short' as const) : ('long' as const);
          const absAmount = removeDecimals(positionAmount.abs()).toNumber();

          const oraclePrice = Number(pos.baseBalance.oraclePrice);
          const margin = removeDecimals(pos.quoteBalance.amount).toNumber();
          const notional = absAmount * oraclePrice;
          const leverage = margin > 0 ? Math.max(1, notional / margin) : 10;

          const orderParams = await buildOrder({
            client: ctx.client,
            productId: pos.baseBalance.productId,
            side: closeSide,
            amount: absAmount,
            slippagePct,
            orderExecutionType: 'ioc',
            reduceOnly: true,
            marginMode: 'isolated',
            leverage,
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

          const crossSummary = crossPositions.map((p) => ({
            productId: p.productId,
            marginMode: 'cross' as const,
            side: p.amount.isPositive() ? 'long' : 'short',
            size: removeDecimals(p.amount.abs()).toNumber(),
          }));

          const isolatedSummary = filteredIsolated.map((p) => ({
            productId: p.baseBalance.productId,
            marginMode: 'isolated' as const,
            side: p.baseBalance.amount.isPositive() ? 'long' : 'short',
            size: removeDecimals(p.baseBalance.amount.abs()).toNumber(),
          }));

          return {
            ...result,
            summary: {
              positionsClosed: allOrders.length,
              slippagePct: `${slippagePct}%`,
              positions: [...crossSummary, ...isolatedSummary],
            },
          };
        },
      );
    },
  );
}
