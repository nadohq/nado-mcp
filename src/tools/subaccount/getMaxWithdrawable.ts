import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { NadoClient } from '@nadohq/client';

import { handleToolRequest } from '../../utils/handleToolRequest';
import {
  ProductIdSchema,
  SubaccountNameSchema,
  SubaccountOwnerSchema,
} from '../../utils/schemas';

export function registerGetMaxWithdrawable(
  server: McpServer,
  client: NadoClient,
): void {
  server.registerTool(
    'get_max_withdrawable',
    {
      title: 'Get Max Withdrawable Amount',
      description:
        'Get the maximum amount a subaccount can withdraw for a given spot product without violating margin requirements. Essential for funds management. Use get_all_markets to find spot product IDs.',
      inputSchema: {
        subaccountOwner: SubaccountOwnerSchema,
        subaccountName: SubaccountNameSchema,
        productId: ProductIdSchema.describe(
          'Spot product ID to check withdrawable amount for',
        ),
      },
      annotations: { readOnlyHint: true },
    },
    async ({
      subaccountOwner,
      subaccountName,
      productId,
    }: {
      subaccountOwner: string;
      subaccountName: string;
      productId: number;
    }) =>
      handleToolRequest(
        'get_max_withdrawable',
        `Failed to fetch max withdrawable for product ${productId}. Ensure this is a spot product ID.`,
        async () => {
          const maxWithdrawable = await client.spot.getMaxWithdrawable({
            subaccountOwner,
            subaccountName,
            productId,
          });
          return { maxWithdrawable };
        },
      ),
  );
}
