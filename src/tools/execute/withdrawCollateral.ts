import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { addDecimals } from '@nadohq/client';
import { z } from 'zod';

import type { NadoContext } from '../../context.js';
import { handleToolRequest } from '../../utils/handleToolRequest.js';
import { requireSigner } from '../../utils/requireSigner.js';
import { ProductIdSchema } from '../../utils/schemas.js';
import { getTokenDecimals } from '../../utils/tokenDecimals.js';

export function registerWithdrawCollateral(
  server: McpServer,
  ctx: NadoContext,
): void {
  server.registerTool(
    'withdraw_collateral',
    {
      title: 'Withdraw Collateral',
      description:
        'Withdraw collateral from a subaccount to the wallet. ' +
        'Use get_max_withdrawable to check the maximum amount that can be withdrawn without violating margin requirements. ' +
        'Use get_all_markets to find spot product IDs. ' +
        'SAFETY: You MUST present an execution summary and receive explicit user confirmation BEFORE calling this tool. Never call in the same turn as the summary.',
      inputSchema: {
        productId: ProductIdSchema.describe(
          'Spot product ID to withdraw (e.g. 0 for USDT0)',
        ),
        amount: z
          .number()
          .positive()
          .describe(
            'Amount to withdraw in human-readable units (e.g. 100 for 100 USDT0)',
          ),
        spotLeverage: z
          .boolean()
          .optional()
          .describe(
            'If true, allows the withdrawal even if it results in a negative spot balance (borrow). Defaults to engine default (true).',
          ),
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({
      productId,
      amount,
      spotLeverage,
    }: {
      productId: number;
      amount: number;
      spotLeverage?: boolean;
    }) => {
      requireSigner('withdraw_collateral', ctx);

      const decimals = getTokenDecimals(ctx.chainEnv, productId);

      return handleToolRequest(
        'withdraw_collateral',
        `Failed to withdraw ${amount} of product ${productId}. Use get_max_withdrawable to check available amount.`,
        () =>
          ctx.client.spot.withdraw({
            subaccountOwner: ctx.subaccountOwner,
            subaccountName: ctx.subaccountName,
            productId,
            amount: addDecimals(amount, decimals),
            spotLeverage,
          }),
      );
    },
  );
}
