import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { NadoClient } from '@nadohq/client';
import { z } from 'zod';

import { toJsonContent } from '../utils/formatting.js';

export function registerRiskReportPrompt(
  server: McpServer,
  client: NadoClient,
): void {
  server.registerPrompt(
    'risk-report',
    {
      title: 'Risk Report',
      description:
        'In-depth risk analysis for a subaccount: margin health, position concentration, stop-loss coverage, and funding exposure.',
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

      const [summary, positions, openOrders, triggerOrders, oraclePrices] =
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
          client.context.indexerClient.getOraclePrices({
            productIds: allProductIds,
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
      if (oraclePrices.status === 'fulfilled') {
        sections.push(`## Oracle Prices\n${toJsonContent(oraclePrices.value)}`);
      }

      return {
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: [
                `Risk report for subaccount ${subaccountOwner}/${subaccountName}.\n`,
                ...sections,
                '\nProvide a detailed risk analysis covering:',
                '1. Liquidation proximity: how close is the account to liquidation? What price moves would trigger it?',
                '2. Position concentration: is risk spread across markets or concentrated?',
                '3. Hedge ratio: are long/short positions offsetting each other?',
                '4. Uncovered positions: which positions lack stop-loss protection?',
                '5. Funding exposure: net funding payment direction and estimated daily cost',
                '6. Order impact: how would open limit orders affect margin if filled?',
                '7. Oracle vs mark price divergence: any positions at risk from convergence?',
                '8. Priority recommendations to reduce risk',
              ].join('\n'),
            },
          },
        ],
      };
    },
  );
}
