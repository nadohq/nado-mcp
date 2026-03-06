import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { addDecimals } from '@nadohq/client';
import { z } from 'zod';

import type { NadoClientWithAccount } from '../../client.js';
import { asyncResult } from '../../utils/asyncResult.js';
import { requireSigner } from '../../utils/requireSigner.js';
import { ProductIdSchema } from '../../utils/schemas.js';

export function registerDepositCollateral(
  server: McpServer,
  ctx: NadoClientWithAccount,
): void {
  server.registerTool(
    'deposit_collateral',
    {
      title: 'Deposit Collateral',
      description:
        'Deposit collateral from the wallet into a subaccount. ' +
        'This is an on-chain transaction that requires gas (native token for fees). ' +
        'Automatically approves the token spending allowance before depositing. ' +
        'Use get_all_markets to find spot product IDs (e.g. 0 for USDT0).',
      inputSchema: {
        productId: ProductIdSchema.describe(
          'Spot product ID to deposit (e.g. 0 for USDT0)',
        ),
        amount: z
          .number()
          .positive()
          .describe(
            'Amount to deposit in human-readable units (e.g. 100 for 100 USDT0)',
          ),
      },
      annotations: { readOnlyHint: false },
    },
    async ({ productId, amount }: { productId: number; amount: number }) => {
      requireSigner('deposit_collateral', ctx);

      const amountX18 = addDecimals(amount);

      return asyncResult(
        'deposit_collateral',
        `Failed to deposit ${amount} of product ${productId}. Ensure the wallet has sufficient token balance and native token for gas.`,
        async () => {
          await ctx.client.spot.approveAllowance({
            productId,
            amount: amountX18,
          });

          return ctx.client.spot.deposit({
            subaccountName: ctx.subaccountName,
            productId,
            amount: amountX18,
          });
        },
      );
    },
  );
}
