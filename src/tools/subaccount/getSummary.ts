import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { NadoContext } from '../../context';
import { handleToolRequest } from '../../utils/handleToolRequest';
import { getMarkets } from '../../utils/resolveMarket';
import {
  SubaccountNameSchema,
  SubaccountOwnerSchema,
} from '../../utils/schemas';

export function registerGetSubaccountSummary(
  server: McpServer,
  ctx: NadoContext,
): void {
  server.registerTool(
    'get_subaccount_summary',
    {
      title: 'Get Subaccount Summary',
      description:
        'Get a full summary of a subaccount including balances, health, and margin state from the off-chain engine. This is the primary tool for checking account status. Use this first when investigating a portfolio, then follow up with get_isolated_positions for per-position details, get_open_orders for pending orders, or get_trigger_orders for TP/SL orders.',
      inputSchema: {
        subaccountOwner: SubaccountOwnerSchema,
        subaccountName: SubaccountNameSchema,
      },
      annotations: { readOnlyHint: true },
    },
    async ({
      subaccountOwner,
      subaccountName,
    }: {
      subaccountOwner: string;
      subaccountName: string;
    }) =>
      handleToolRequest(
        'get_subaccount_summary',
        `Failed to fetch summary for ${subaccountOwner}/${subaccountName}.`,
        async () => {
          const [summary, isolatedPositions, markets] = await Promise.all([
            ctx.client.subaccount.getSubaccountSummary({
              subaccountOwner,
              subaccountName,
            }),
            ctx.client.subaccount
              .getIsolatedPositions({
                subaccountOwner,
                subaccountName,
              })
              .catch(() => []),
            getMarkets(ctx.dataEnv, ctx.chainEnv).catch(() => []),
          ]);

          const symbolByProductId = new Map(
            markets.map((m) => [m.productId, m.symbol]),
          );

          const enrichedIsolated = isolatedPositions.map((pos) => ({
            ...pos,
            baseBalance: {
              symbol:
                symbolByProductId.get(pos.baseBalance.productId) ?? undefined,
              ...pos.baseBalance,
            },
          }));

          return {
            ...summary,
            balances: summary.balances.map((b) => ({
              symbol: symbolByProductId.get(b.productId) ?? undefined,
              ...b,
            })),
            isolatedPositions: enrichedIsolated,
          };
        },
      ),
  );
}
