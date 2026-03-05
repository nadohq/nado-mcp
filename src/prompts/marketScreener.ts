import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { NadoClient } from '@nadohq/client';
import { ProductEngineType } from '@nadohq/client';
import { z } from 'zod';

import { toJsonContent } from '../utils/formatting.js';

export function registerMarketScreenerPrompt(
  server: McpServer,
  client: NadoClient,
): void {
  server.registerPrompt(
    'market-screener',
    {
      title: 'Market Screener',
      description:
        'Screen all markets for trading opportunities. Fetches 24h tickers and funding rates to identify highest volume, extreme funding, and biggest movers.',
      argsSchema: {
        market: z
          .enum(['spot', 'perp'])
          .optional()
          .describe('Filter by market type (omit for all markets)'),
      },
    },
    async ({ market }) => {
      const allMarkets = await client.market.getAllMarkets();
      const perpProductIds = allMarkets
        .filter((m) => m.type === ProductEngineType.PERP)
        .map((m) => m.productId);

      const [tickers, fundingRates] = await Promise.allSettled([
        client.context.indexerClient.getV2Tickers({
          market: market,
        }),
        perpProductIds.length > 0
          ? client.market.getMultiProductFundingRates({
              productIds: perpProductIds,
            })
          : Promise.reject(new Error('No perp products')),
      ]);

      const sections: string[] = [];

      if (tickers.status === 'fulfilled') {
        sections.push(`## 24h Ticker Data\n${toJsonContent(tickers.value)}`);
      }
      if (fundingRates.status === 'fulfilled') {
        sections.push(
          `## Funding Rates (all perps)\n${toJsonContent(fundingRates.value)}`,
        );
      }

      return {
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: [
                `Market screening report${market ? ` (${market} only)` : ' (all markets)'}.\n`,
                ...sections,
                '\nAnalyze the data and provide a screening report covering:',
                '1. Top markets by 24h volume',
                '2. Biggest price movers (gainers and losers)',
                '3. Markets with extreme funding rates (potential arbitrage opportunities)',
                '4. Markets with tightest/widest spreads',
                '5. Any notable patterns or opportunities worth investigating',
              ].join('\n'),
            },
          },
        ],
      };
    },
  );
}
