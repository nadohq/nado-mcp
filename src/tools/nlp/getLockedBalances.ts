import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { NadoClient } from '@nadohq/client';

import { handleToolRequest } from '../../utils/handleToolRequest.js';
import {
  SubaccountNameSchema,
  SubaccountOwnerSchema,
} from '../../utils/schemas.js';

export function registerGetNlpLockedBalances(
  server: McpServer,
  client: NadoClient,
): void {
  server.registerTool(
    'get_nlp_locked_balances',
    {
      title: 'Get User NLP Balances',
      description:
        "Get a specific user's NLP vault position: locked and unlocked NLP token balances, plus individual lock entries with unlock timestamps. Requires the user's wallet address. Use this to check a user's vault deposit status and when locked tokens will become available. For deposit/withdraw limits, use get_nlp_max_mint_burn instead.",
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
    }) =>
      handleToolRequest(
        'get_nlp_locked_balances',
        `Failed to fetch NLP locked balances for ${subaccountOwner}/${subaccountName}.`,
        () =>
          client.context.engineClient.getNlpLockedBalances({
            subaccountOwner,
            subaccountName,
          }),
      ),
  );
}
