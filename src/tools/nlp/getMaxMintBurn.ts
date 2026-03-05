import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { NadoClient } from '@nadohq/client';

import { ToolExecutionError } from '../../utils/errors.js';
import { toJsonContent } from '../../utils/formatting.js';
import {
  SubaccountNameSchema,
  SubaccountOwnerSchema,
} from '../../utils/schemas.js';

export function registerGetNlpMaxMintBurn(
  server: McpServer,
  client: NadoClient,
): void {
  server.registerTool(
    'get_nlp_max_mint_burn',
    {
      title: 'Get User NLP Deposit/Withdraw Limits',
      description:
        "Get the maximum amount a specific user can deposit into (mint) and withdraw from (burn) the NLP vault, based on their current subaccount balance and margin. Requires the user's wallet address. Use this before vault deposits/withdrawals to know available limits. For checking existing vault balances and lock status, use get_nlp_locked_balances instead.",
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
    }) => {
      try {
        const [maxMint, maxBurn] = await Promise.all([
          client.context.engineClient.getMaxMintNlpAmount({
            subaccountOwner,
            subaccountName,
          }),
          client.context.engineClient.getMaxBurnNlpAmount({
            subaccountOwner,
            subaccountName,
          }),
        ]);
        return {
          content: [
            {
              type: 'text',
              text: toJsonContent({
                maxMintQuoteAmount: maxMint,
                maxBurnNlpAmount: maxBurn,
              }),
            },
          ],
        };
      } catch (err) {
        throw new ToolExecutionError(
          'get_nlp_max_mint_burn',
          `Failed to fetch NLP mint/burn limits for ${subaccountOwner}/${subaccountName}.`,
          err,
        );
      }
    },
  );
}
