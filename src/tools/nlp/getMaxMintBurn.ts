import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { NadoContext } from '../../context';
import { handleToolRequest } from '../../utils/handleToolRequest';
import { resolveSubaccount } from '../../utils/resolveSubaccount';
import {
  OptionalSubaccountNameSchema,
  OptionalSubaccountOwnerSchema,
} from '../../utils/schemas';

export function registerGetNlpMaxMintBurn(
  server: McpServer,
  ctx: NadoContext,
): void {
  server.registerTool(
    'get_nlp_max_mint_burn',
    {
      title: 'Get User NLP Deposit/Withdraw Limits',
      description:
        "Get the maximum amount a specific user can deposit into (mint) and withdraw from (burn) the NLP vault, based on their current subaccount balance and margin. Requires the user's wallet address. Use this before vault deposits/withdrawals to know available limits. For checking existing vault balances and lock status, use get_nlp_locked_balances instead.",
      inputSchema: {
        subaccountOwner: OptionalSubaccountOwnerSchema,
        subaccountName: OptionalSubaccountNameSchema,
      },
      annotations: { readOnlyHint: true },
    },
    async (input: { subaccountOwner?: string; subaccountName?: string }) => {
      const { subaccountOwner, subaccountName } = resolveSubaccount(ctx, input);

      return handleToolRequest(
        'get_nlp_max_mint_burn',
        `Failed to fetch NLP mint/burn limits for ${subaccountOwner}/${subaccountName}.`,
        async () => {
          const [maxMint, maxBurn] = await Promise.all([
            ctx.client.context.engineClient.getMaxMintNlpAmount({
              subaccountOwner,
              subaccountName,
            }),
            ctx.client.context.engineClient.getMaxBurnNlpAmount({
              subaccountOwner,
              subaccountName,
            }),
          ]);
          return { maxMintQuoteAmount: maxMint, maxBurnNlpAmount: maxBurn };
        },
      );
    },
  );
}
