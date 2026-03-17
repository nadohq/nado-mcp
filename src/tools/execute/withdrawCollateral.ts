import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { addDecimals } from '@nadohq/client';
import { z } from 'zod';

import type { NadoContext } from '../../context';
import { handleToolRequest } from '../../utils/handleToolRequest';
import { requireSigner } from '../../utils/requireSigner';
import { getTokenDecimals } from '../../utils/resolveMarket';
import { ProductIdSchema, SAFETY_DISCLAIMER } from '../../utils/schemas';

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
        SAFETY_DISCLAIMER,
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

      const decimals = await getTokenDecimals(
        ctx.dataEnv,
        ctx.chainEnv,
        productId,
      );

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
