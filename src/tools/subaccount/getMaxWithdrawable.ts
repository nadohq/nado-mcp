import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { NadoContext } from '../../context';
import { handleToolRequest } from '../../utils/handleToolRequest';
import { resolveSubaccount } from '../../utils/resolveSubaccount';
import {
  OptionalSubaccountNameSchema,
  OptionalSubaccountOwnerSchema,
  ProductIdSchema,
} from '../../utils/schemas';

export function registerGetMaxWithdrawable(
  server: McpServer,
  ctx: NadoContext,
): void {
  server.registerTool(
    'get_max_withdrawable',
    {
      title: 'Get Max Withdrawable Amount',
      description:
        'Get the maximum amount a subaccount can withdraw for a given spot product without violating margin requirements. Essential for funds management. Use get_all_markets to find spot product IDs.',
      inputSchema: {
        subaccountOwner: OptionalSubaccountOwnerSchema,
        subaccountName: OptionalSubaccountNameSchema,
        productId: ProductIdSchema.describe(
          'Spot product ID to check withdrawable amount for',
        ),
      },
      annotations: { readOnlyHint: true },
    },
    async (input: {
      subaccountOwner?: string;
      subaccountName?: string;
      productId: number;
    }) => {
      const { subaccountOwner, subaccountName } = resolveSubaccount(ctx, input);

      return handleToolRequest(
        'get_max_withdrawable',
        `Failed to fetch max withdrawable for product ${input.productId}. Ensure this is a spot product ID.`,
        async () => {
          const maxWithdrawable = await ctx.client.spot.getMaxWithdrawable({
            subaccountOwner,
            subaccountName,
            productId: input.productId,
          });
          return { maxWithdrawable };
        },
      );
    },
  );
}
