import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { NadoClientWithAccount } from '../../client.js';
import { handleToolRequest } from '../../utils/handleToolRequest.js';
import { requireSigner } from '../../utils/requireSigner.js';
import { ProductIdsSchema } from '../../utils/schemas.js';

export function registerCancelOrders(
  server: McpServer,
  ctx: NadoClientWithAccount,
): void {
  server.registerTool(
    'cancel_orders',
    {
      title: 'Cancel Orders',
      description:
        'Cancel specific orders by their digests. Use get_open_orders to find order digests first. Each digest must be paired with its product ID at the same array index.',
      inputSchema: {
        productIds: ProductIdsSchema.describe(
          'Product IDs of the orders to cancel (must match digests by index)',
        ),
        digests: z
          .array(z.string())
          .describe('Order digests to cancel (from get_open_orders)'),
      },
      annotations: { readOnlyHint: false },
    },
    async ({
      productIds,
      digests,
    }: {
      productIds: number[];
      digests: string[];
    }) => {
      requireSigner('cancel_orders', ctx);

      return handleToolRequest(
        'cancel_orders',
        `Failed to cancel orders. Verify the digests are valid using get_open_orders.`,
        () =>
          ctx.client.market.cancelOrders({
            subaccountOwner: ctx.subaccountOwner,
            subaccountName: ctx.subaccountName,
            productIds,
            digests,
          }),
      );
    },
  );
}
