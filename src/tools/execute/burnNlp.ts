import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { addDecimals } from '@nadohq/client';
import { z } from 'zod';

import type { NadoClientWithAccount } from '../../client.js';
import { asyncResult } from '../../utils/asyncResult.js';
import { requireSigner } from '../../utils/requireSigner.js';

export function registerBurnNlp(
  server: McpServer,
  ctx: NadoClientWithAccount,
): void {
  server.registerTool(
    'burn_nlp',
    {
      title: 'Burn NLP',
      description:
        'Burn NLP tokens to withdraw quote (USDT) from the NLP vault. ' +
        'Only unlocked NLP tokens can be burned. ' +
        'Use get_nlp_locked_balances to check unlocked balance, and get_nlp_max_mint_burn to check the maximum burn amount.',
      inputSchema: {
        nlpAmount: z
          .number()
          .positive()
          .describe('Amount of NLP tokens to burn'),
      },
      annotations: { readOnlyHint: false },
    },
    async ({ nlpAmount }: { nlpAmount: number }) => {
      requireSigner('burn_nlp', ctx);

      return asyncResult(
        'burn_nlp',
        `Failed to burn ${nlpAmount} NLP. Use get_nlp_locked_balances to check unlocked balance.`,
        () =>
          ctx.client.spot.burnNlp({
            subaccountOwner: ctx.subaccountOwner,
            subaccountName: ctx.subaccountName,
            nlpAmount: addDecimals(nlpAmount),
          }),
      );
    },
  );
}
