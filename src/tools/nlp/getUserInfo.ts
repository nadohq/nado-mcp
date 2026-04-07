import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { NadoContext } from '../../context';
import { handleToolRequest } from '../../utils/handleToolRequest';
import { resolveSubaccount } from '../../utils/resolveSubaccount';
import {
  OptionalSubaccountNameSchema,
  OptionalSubaccountOwnerSchema,
} from '../../utils/schemas';

export function registerGetNlpUserInfo(
  server: McpServer,
  ctx: NadoContext,
): void {
  server.registerTool(
    'get_nlp_user_info',
    {
      title: 'Get NLP User Info',
      description:
        "Get a user's NLP vault position and limits: locked/unlocked NLP token balances with unlock timestamps, plus the maximum deposit (mint) and withdraw (burn) amounts based on current margin.",
      inputSchema: {
        subaccountOwner: OptionalSubaccountOwnerSchema,
        subaccountName: OptionalSubaccountNameSchema,
      },
      annotations: { readOnlyHint: true },
    },
    async (input: { subaccountOwner?: string; subaccountName?: string }) => {
      const { subaccountOwner, subaccountName } = resolveSubaccount(ctx, input);

      return handleToolRequest(
        'get_nlp_user_info',
        `Failed to fetch NLP user info for ${subaccountOwner}/${subaccountName}.`,
        async () => {
          const [lockedBalances, maxMint, maxBurn] = await Promise.all([
            ctx.client.context.engineClient.getNlpLockedBalances({
              subaccountOwner,
              subaccountName,
            }),
            ctx.client.context.engineClient.getMaxMintNlpAmount({
              subaccountOwner,
              subaccountName,
            }),
            ctx.client.context.engineClient.getMaxBurnNlpAmount({
              subaccountOwner,
              subaccountName,
            }),
          ]);
          return {
            lockedBalances,
            maxMintQuoteAmount: maxMint,
            maxBurnNlpAmount: maxBurn,
          };
        },
      );
    },
  );
}
