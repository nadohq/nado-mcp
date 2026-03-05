import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { NadoClient } from '@nadohq/client';
import { z } from 'zod';

import { toJsonContent } from '../utils/formatting.js';

export function registerPortfolioSummaryPrompt(
  server: McpServer,
  client: NadoClient,
): void {
  server.registerPrompt(
    'portfolio-summary',
    {
      title: 'Portfolio Summary',
      description:
        'Comprehensive portfolio overview: subaccount summary, positions, open orders, trigger orders (stop-loss/TP), and fee rates.',
      argsSchema: {
        subaccountOwner: z
          .string()
          .describe('Wallet address that owns the subaccount'),
        subaccountName: z
          .string()
          .default('default')
          .describe('Subaccount name (defaults to "default")'),
      },
    },
    async ({ subaccountOwner, subaccountName }) => {
      const allMarkets = await client.market.getAllMarkets();
      const allProductIds = allMarkets.map((m) => m.productId);

      const [summary, positions, openOrders, triggerOrders, feeRates] =
        await Promise.allSettled([
          client.subaccount.getSubaccountSummary({
            subaccountOwner,
            subaccountName,
          }),
          client.subaccount.getIsolatedPositions({
            subaccountOwner,
            subaccountName,
          }),
          client.market.getOpenSubaccountMultiProductOrders({
            subaccountOwner,
            subaccountName,
            productIds: allProductIds,
          }),
          client.market.getTriggerOrders({
            subaccountOwner,
            subaccountName,
            statusTypes: [
              'waiting_price',
              'waiting_dependency',
              'triggering',
              'twap_executing',
            ],
          }),
          client.subaccount.getSubaccountFeeRates({
            subaccountOwner,
            subaccountName,
          }),
        ]);

      const sections: string[] = [];

      if (summary.status === 'fulfilled') {
        sections.push(`## Subaccount Summary\n${toJsonContent(summary.value)}`);
      }
      if (positions.status === 'fulfilled') {
        sections.push(
          `## Isolated Positions\n${toJsonContent(positions.value)}`,
        );
      }
      if (openOrders.status === 'fulfilled') {
        sections.push(
          `## Open Limit Orders\n${toJsonContent(openOrders.value)}`,
        );
      }
      if (triggerOrders.status === 'fulfilled') {
        sections.push(
          `## Active Trigger Orders (SL/TP/TWAP)\n${toJsonContent(triggerOrders.value)}`,
        );
      }
      if (feeRates.status === 'fulfilled') {
        sections.push(`## Fee Rates\n${toJsonContent(feeRates.value)}`);
      }

      return {
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: [
                `Summarize the following portfolio data for subaccount ${subaccountOwner}/${subaccountName}.\n`,
                ...sections,
                '\nProvide a concise summary covering:',
                '1. Overall account health and margin utilization',
                '2. Open positions and their sizes',
                '3. Unrealized PnL across positions',
                '4. Risk assessment (leverage, liquidation proximity)',
                '5. Open orders and their potential fill impact',
                '6. Active stop-loss/take-profit coverage for positions',
                '7. Fee tier and cost implications',
                '8. Any recommended actions',
              ].join('\n'),
            },
          },
        ],
      };
    },
  );
}
