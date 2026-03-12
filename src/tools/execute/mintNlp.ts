import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { addDecimals } from '@nadohq/client';
import { z } from 'zod';

import type { NadoContext } from '../../context.js';
import { handleToolRequest } from '../../utils/handleToolRequest.js';
import { requireSigner } from '../../utils/requireSigner.js';
import { SAFETY_DISCLAIMER } from '../../utils/schemas.js';

export function registerMintNlp(server: McpServer, ctx: NadoContext): void {
  server.registerTool(
    'mint_nlp',
    {
      title: 'Mint NLP',
      description:
        'Deposit quote (USDT0) into the NLP vault to mint NLP tokens. ' +
        'Use get_nlp_max_mint_burn to check the maximum deposit amount. ' +
        'Minted NLP tokens have a lock-up period before they can be burned. ' +
        SAFETY_DISCLAIMER,
      inputSchema: {
        quoteAmount: z
          .number()
          .positive()
          .describe(
            'Amount of USDT0 to deposit into the NLP vault (e.g. 1000 for $1000)',
          ),
        spotLeverage: z
          .boolean()
          .optional()
          .describe(
            'If true, allows borrowing to mint (negative USDT0 balance). Defaults to engine default (true).',
          ),
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({
      quoteAmount,
      spotLeverage,
    }: {
      quoteAmount: number;
      spotLeverage?: boolean;
    }) => {
      requireSigner('mint_nlp', ctx);

      return handleToolRequest(
        'mint_nlp',
        `Failed to mint NLP with ${quoteAmount} USDT0. Use get_nlp_max_mint_burn to check limits.`,
        () =>
          ctx.client.spot.mintNlp({
            subaccountOwner: ctx.subaccountOwner,
            subaccountName: ctx.subaccountName,
            quoteAmount: addDecimals(quoteAmount),
            spotLeverage,
          }),
      );
    },
  );
}
