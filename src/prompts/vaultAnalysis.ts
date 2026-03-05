import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { NadoClient } from '@nadohq/client';

import { toJsonContent } from '../utils/formatting.js';

export function registerVaultAnalysisPrompt(
  server: McpServer,
  client: NadoClient,
): void {
  server.registerPrompt(
    'vault-analysis',
    {
      title: 'NLP Vault Analysis',
      description:
        'Analyze the NLP vault: current state (TVL, positions, PnL) and 30-day historical snapshots for trend analysis and yield estimation.',
    },
    async () => {
      const [poolInfo, snapshots] = await Promise.allSettled([
        client.context.engineClient.getNlpPoolInfo(),
        client.context.indexerClient.getNlpSnapshots({
          granularity: 86400,
          limit: 30,
        }),
      ]);

      const sections: string[] = [];

      if (poolInfo.status === 'fulfilled') {
        sections.push(
          `## NLP Pool Current State\n${toJsonContent(poolInfo.value)}`,
        );
      }
      if (snapshots.status === 'fulfilled') {
        sections.push(
          `## NLP Vault 30-Day Snapshots (daily)\n${toJsonContent(snapshots.value)}`,
        );
      }

      return {
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: [
                'Analyze the NLP vault data below.\n',
                ...sections,
                '\nProvide a comprehensive vault analysis covering:',
                '1. Current TVL and its trend over the last 30 days',
                '2. Cumulative PnL performance and daily PnL trend',
                '3. Current positions and their risk profile',
                '4. Depositor count trend (growing/shrinking)',
                '5. Estimated yield/APR based on recent performance',
                '6. Risk assessment: concentration, directional exposure, drawdowns',
                '7. Overall health assessment and outlook',
              ].join('\n'),
            },
          },
        ],
      };
    },
  );
}
