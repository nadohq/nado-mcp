import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { NadoContext } from '../../context';
import { fmtProductIds } from '../../utils/formatting';
import { handleToolRequest } from '../../utils/handleToolRequest';
import { requireSigner } from '../../utils/requireSigner';
import { ProductIdsSchema, SAFETY_DISCLAIMER } from '../../utils/schemas';

export function registerCancelTriggerOrders(
  server: McpServer,
  ctx: NadoContext,
): void {
  server.registerTool(
    'cancel_trigger_orders',
    {
      title: 'Cancel Trigger Orders',
      description:
        'Cancel trigger orders (stop-loss, take-profit, TWAP). Two modes: (1) pass digests to cancel specific trigger orders — each digest must be paired with its product ID at the same index; (2) omit digests to cancel ALL trigger orders for the given product IDs. Use get_trigger_orders to find digests. ' +
        SAFETY_DISCLAIMER,
      inputSchema: {
        productIds: ProductIdsSchema.describe(
          'Product IDs — paired with digests for specific cancellation, or standalone to cancel all trigger orders on those markets',
        ),
        digests: z
          .array(z.string())
          .optional()
          .describe(
            'Trigger order digests to cancel (from get_trigger_orders). Omit to cancel ALL trigger orders for the given product IDs.',
          ),
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({
      productIds,
      digests,
    }: {
      productIds: number[];
      digests?: string[];
    }) => {
      requireSigner('cancel_trigger_orders', ctx);

      if (digests) {
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
      }

      return handleToolRequest(
        'cancel_trigger_orders',
        `Failed to cancel trigger orders for products ${fmtProductIds(productIds)}. Use get_all_markets to verify product IDs.`,
        () =>
          ctx.client.market.cancelTriggerProductOrders({
            subaccountOwner: ctx.subaccountOwner,
            subaccountName: ctx.subaccountName,
            productIds,
          }),
      );
    },
  );
}
