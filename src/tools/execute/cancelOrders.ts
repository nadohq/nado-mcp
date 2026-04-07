import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { NadoContext } from '../../context';
import { fmtProductIds } from '../../utils/formatting';
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
        'Cancel open orders. Two modes: (1) pass digests to cancel specific orders — each digest must be paired with its product ID at the same index; (2) omit digests to cancel ALL orders for the given product IDs. Use get_open_orders to find digests. ' +
        SAFETY_DISCLAIMER,
      inputSchema: {
        productIds: ProductIdsSchema.describe(
          'Product IDs — paired with digests for specific cancellation, or standalone to cancel all orders on those markets',
        ),
        digests: z
          .array(z.string())
          .optional()
          .describe(
            'Order digests to cancel (from get_open_orders). Omit to cancel ALL orders for the given product IDs.',
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
      requireSigner('cancel_orders', ctx);

      if (digests) {
        return handleToolRequest(
          'cancel_orders',
          'Failed to cancel orders. Verify the digests are valid using get_open_orders.',
          () =>
            ctx.client.market.cancelOrders({
              subaccountOwner: ctx.subaccountOwner,
              subaccountName: ctx.subaccountName,
              productIds,
              digests,
            }),
        );
      }

      return handleToolRequest(
        'cancel_orders',
        `Failed to cancel orders for products ${fmtProductIds(productIds)}. Use get_all_markets to verify product IDs.`,
        () =>
          ctx.client.market.cancelProductOrders({
            subaccountOwner: ctx.subaccountOwner,
            subaccountName: ctx.subaccountName,
            productIds,
          }),
      );
    },
  );
}
