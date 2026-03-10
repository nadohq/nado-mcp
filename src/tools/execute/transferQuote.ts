import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { addDecimals } from '@nadohq/client';
import { z } from 'zod';

import type { NadoContext } from '../../context.js';
import { handleToolRequest } from '../../utils/handleToolRequest.js';
import { requireSigner } from '../../utils/requireSigner.js';
import { SubaccountNameSchema } from '../../utils/schemas.js';

export function registerTransferQuote(
  server: McpServer,
  ctx: NadoContext,
): void {
  server.registerTool(
    'transfer_quote',
    {
      title: 'Transfer Quote',
      description:
        'Transfer USDT0 between subaccounts under the same wallet. ' +
        'Use this for moving funds between cross and isolated subaccounts, or adjusting isolated position margin. ' +
        'Use list_subaccounts to see available subaccounts. ' +
        'SAFETY: You MUST present an execution summary and receive explicit user confirmation BEFORE calling this tool. Never call in the same turn as the summary.',
      inputSchema: {
        amount: z
          .number()
          .positive()
          .describe('Amount of USDT0 to transfer (e.g. 100 for 100 USDT0)'),
        recipientSubaccountName: SubaccountNameSchema.describe(
          'Name of the recipient subaccount to transfer to',
        ),
        subaccountName: SubaccountNameSchema.describe(
          'Name of the sender subaccount to transfer from',
        ),
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({
      amount,
      recipientSubaccountName,
      subaccountName,
    }: {
      amount: number;
      recipientSubaccountName: string;
      subaccountName: string;
    }) => {
      requireSigner('transfer_quote', ctx);

      return handleToolRequest(
        'transfer_quote',
        `Failed to transfer ${amount} USDT0 from "${subaccountName}" to "${recipientSubaccountName}".`,
        () =>
          ctx.client.spot.transferQuote({
            subaccountOwner: ctx.subaccountOwner,
            subaccountName,
            recipientSubaccountName,
            amount: addDecimals(amount),
          }),
      );
    },
  );
}
