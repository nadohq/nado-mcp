import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { addDecimals } from '@nadohq/client';
import { z } from 'zod';

import type { NadoClientWithAccount } from '../../client.js';
import { asyncResult } from '../../utils/asyncResult.js';
import { requireSigner } from '../../utils/requireSigner.js';
import { SubaccountNameSchema } from '../../utils/schemas.js';

export function registerTransferQuote(
  server: McpServer,
  ctx: NadoClientWithAccount,
): void {
  server.registerTool(
    'transfer_quote',
    {
      title: 'Transfer Quote',
      description:
        'Transfer USDT0 between subaccounts under the same wallet. ' +
        'Use this for moving funds between cross and isolated subaccounts, or adjusting isolated position margin. ' +
        'Use list_subaccounts to see available subaccounts.',
      inputSchema: {
        recipientSubaccountName: SubaccountNameSchema.describe(
          'Name of the recipient subaccount to transfer to',
        ),
        amount: z
          .number()
          .positive()
          .describe('Amount of USDT0 to transfer (e.g. 100 for 100 USDT0)'),
      },
      annotations: { readOnlyHint: false },
    },
    async ({
      recipientSubaccountName,
      amount,
    }: {
      recipientSubaccountName: string;
      amount: number;
    }) => {
      requireSigner('transfer_quote', ctx);

      return asyncResult(
        'transfer_quote',
        `Failed to transfer ${amount} USDT0 to subaccount "${recipientSubaccountName}".`,
        () =>
          ctx.client.spot.transferQuote({
            subaccountOwner: ctx.subaccountOwner,
            subaccountName: ctx.subaccountName,
            recipientSubaccountName,
            amount: addDecimals(amount),
          }),
      );
    },
  );
}
