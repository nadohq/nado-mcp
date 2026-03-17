import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { NadoContext } from '../../context';
import { handleToolRequest } from '../../utils/handleToolRequest';
import { resolveSubaccount } from '../../utils/resolveSubaccount';
import {
  OptionalSubaccountNameSchema,
  OptionalSubaccountOwnerSchema,
} from '../../utils/schemas';

export function registerGetNlpLockedBalances(
  server: McpServer,
  ctx: NadoContext,
): void {
  server.registerTool(
    'get_nlp_locked_balances',
    {
      title: 'Get User NLP Balances',
      description:
        "Get a specific user's NLP vault position: locked and unlocked NLP token balances, plus individual lock entries with unlock timestamps. Requires the user's wallet address. Use this to check a user's vault deposit status and when locked tokens will become available. For deposit/withdraw limits, use get_nlp_max_mint_burn instead.",
      inputSchema: {
        subaccountOwner: OptionalSubaccountOwnerSchema,
        subaccountName: OptionalSubaccountNameSchema,
      },
      annotations: { readOnlyHint: true },
    },
    async (input: { subaccountOwner?: string; subaccountName?: string }) => {
      const { subaccountOwner, subaccountName } = resolveSubaccount(ctx, input);

      return handleToolRequest(
        'get_nlp_locked_balances',
        `Failed to fetch NLP locked balances for ${subaccountOwner}/${subaccountName}.`,
        () =>
          ctx.client.context.engineClient.getNlpLockedBalances({
            subaccountOwner,
            subaccountName,
          }),
      );
    },
  );
}
