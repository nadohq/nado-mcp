import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { NadoContext } from '../../context';
import { handleToolRequest } from '../../utils/handleToolRequest';
import { requireSigner } from '../../utils/requireSigner';
import { ProductIdsSchema, SAFETY_DISCLAIMER } from '../../utils/schemas';

export function registerCancelOrders(
  server: McpServer,
  ctx: NadoContext,
): void {
  server.registerTool(
    'cancel_orders',
    {
      title: 'Cancel Orders',
      description:
        'Cancel specific orders by their digests. Use get_open_orders to find order digests first. Each digest must be paired with its product ID at the same array index. ' +
        SAFETY_DISCLAIMER,
      inputSchema: {
        productIds: ProductIdsSchema.describe(
          'Product IDs of the orders to cancel (must match digests by index)',
        ),
        digests: z
          .array(z.string())
          .describe('Order digests to cancel (from get_open_orders)'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
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
