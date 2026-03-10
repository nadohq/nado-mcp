import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { NadoContext } from '../../context.js';
import { handleToolRequest } from '../../utils/handleToolRequest.js';
import { requireSigner } from '../../utils/requireSigner.js';
import { ProductIdsSchema } from '../../utils/schemas.js';

export function registerCancelTriggerOrders(
  server: McpServer,
  ctx: NadoContext,
): void {
  server.registerTool(
    'cancel_trigger_orders',
    {
      title: 'Cancel Trigger Orders',
      description:
        'Cancel specific trigger orders (stop-loss, take-profit, TWAP) by their digests. ' +
        'Use get_trigger_orders to find trigger order digests first. ' +
        'Each digest must be paired with its product ID at the same array index. ' +
        'SAFETY: You MUST present an execution summary and receive explicit user confirmation BEFORE calling this tool. Never call in the same turn as the summary.',
      inputSchema: {
        productIds: ProductIdsSchema.describe(
          'Product IDs of the trigger orders to cancel (must match digests by index)',
        ),
        digests: z
          .array(z.string())
          .describe(
            'Trigger order digests to cancel (from get_trigger_orders)',
          ),
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
      requireSigner('cancel_trigger_orders', ctx);

      return handleToolRequest(
        'cancel_trigger_orders',
        'Failed to cancel trigger orders. Verify the digests are valid using get_trigger_orders.',
        () =>
          ctx.client.market.cancelTriggerOrders({
            subaccountOwner: ctx.subaccountOwner,
            subaccountName: ctx.subaccountName,
            productIds,
            digests,
          }),
      );
    },
  );
}
