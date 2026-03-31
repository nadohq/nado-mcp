import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { addDecimals, toBigNumber } from '@nadohq/client';
import BigNumber from 'bignumber.js';
import { z } from 'zod';

import type { NadoContext } from '../../context';
import { handleToolRequest } from '../../utils/handleToolRequest';
import { requireSigner } from '../../utils/requireSigner';
import { SAFETY_DISCLAIMER } from '../../utils/schemas';

export function registerBurnNlp(server: McpServer, ctx: NadoContext): void {
  server.registerTool(
    'burn_nlp',
    {
      title: 'Burn NLP',
      description:
        'Burn NLP tokens to withdraw quote (USDT0) from the NLP vault. ' +
        'Only unlocked NLP tokens can be burned. ' +
        'Use get_nlp_locked_balances to check unlocked balance, and get_nlp_max_mint_burn to check the maximum burn amount. ' +
        SAFETY_DISCLAIMER,
      inputSchema: {
        nlpAmount: z
          .number()
          .positive()
          .describe('Amount of NLP tokens to burn'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({ nlpAmount }: { nlpAmount: number }) => {
      requireSigner('burn_nlp', ctx);

      return handleToolRequest(
        'burn_nlp',
        `Failed to burn ${nlpAmount} NLP. Use get_nlp_locked_balances to check unlocked balance.`,
        () =>
          ctx.client.spot.burnNlp({
            subaccountOwner: ctx.subaccountOwner,
            subaccountName: ctx.subaccountName,
            nlpAmount: addDecimals(toBigNumber(nlpAmount)).integerValue(
              BigNumber.ROUND_DOWN,
            ),
          }),
      );
    },
  );
}
