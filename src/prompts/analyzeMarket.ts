import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { NadoClient } from '@nadohq/client';
import { z } from 'zod';

import { toJsonContent } from '../utils/formatting.js';
import { resolveMarket } from '../utils/symbolResolver.js';

export function registerAnalyzeMarketPrompt(
  server: McpServer,
  client: NadoClient,
): void {
  server.registerPrompt(
    'analyze-market',
    {
      title: 'Analyze Market',
      description:
        'Analyze a Nado market by name (e.g. "bitcoin", "eth", "SOL-PERP"). Fetches price, funding, liquidity, perp prices, and 24h ticker data automatically.',
      argsSchema: {
        market: z
          .string()
          .describe(
            'Market to analyze -- use a name like "bitcoin", "eth", "sol", or a symbol like "BTC-PERP"',
          ),
      },
    },
    async ({ market: query }) => {
      const resolved = await resolveMarket(client, query);

      const [price, fundingRate, liquidity, perpPrices, tickers] =
        await Promise.allSettled([
          client.market.getLatestMarketPrice({
            productId: resolved.productId,
          }),
          client.market.getFundingRate({ productId: resolved.productId }),
          client.market.getMarketLiquidity({
            productId: resolved.productId,
            depth: 10,
          }),
          resolved.type === 'perp'
            ? client.perp.getPerpPrices({ productId: resolved.productId })
            : Promise.reject(new Error('Not a perp product')),
          client.context.indexerClient.getV2Tickers({
            market: resolved.type === 'perp' ? 'perp' : 'spot',
          }),
        ]);

      const sections: string[] = [
        `Resolved "${query}" to **${resolved.symbol}** (product ID ${resolved.productId}, ${resolved.type}).\n`,
      ];

      if (price.status === 'fulfilled') {
        sections.push(`## Market Price\n${toJsonContent(price.value)}`);
      }
      if (fundingRate.status === 'fulfilled') {
        sections.push(`## Funding Rate\n${toJsonContent(fundingRate.value)}`);
      }
      if (liquidity.status === 'fulfilled') {
        sections.push(
          `## Orderbook Liquidity (depth=10)\n${toJsonContent(liquidity.value)}`,
        );
      }
      if (perpPrices.status === 'fulfilled') {
        sections.push(
          `## Perp Prices (index/mark)\n${toJsonContent(perpPrices.value)}`,
        );
      }
      if (tickers.status === 'fulfilled') {
        const tickerEntry = Object.values(tickers.value).find(
          (t) => t.productId === resolved.productId,
        );
        if (tickerEntry) {
          sections.push(`## 24h Ticker Data\n${toJsonContent(tickerEntry)}`);
        }
      }

      return {
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: [
                ...sections,
                '\nProvide a concise analysis covering:',
                '1. Current bid/ask spread and market tightness',
                '2. Funding rate direction and magnitude',
                '3. Orderbook depth and liquidity distribution',
                '4. Index vs mark price deviation (if perp)',
                '5. 24h volume and price change context',
                '6. Any notable observations or risks',
              ].join('\n'),
            },
          },
        ],
      };
    },
  );
}
