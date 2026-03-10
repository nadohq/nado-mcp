import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { NadoContext } from '../../context.js';
import { fmtProductIds } from '../../utils/formatting.js';
import { handleToolRequest } from '../../utils/handleToolRequest.js';
import { requireSigner } from '../../utils/requireSigner.js';
import { ProductIdsSchema } from '../../utils/schemas.js';

export function registerCancelTriggerProductOrders(
  server: McpServer,
  ctx: NadoContext,
): void {
  server.registerTool(
    'cancel_trigger_product_orders',
    {
      title: 'Cancel All Trigger Product Orders',
      description:
        'Cancel ALL trigger orders (stop-loss, take-profit, TWAP) for one or more products. ' +
        'Use this to quickly clear all trigger orders on specific markets. ' +
        'For cancelling individual trigger orders by digest, use cancel_trigger_orders instead. ' +
        'SAFETY: You MUST present an execution summary and receive explicit user confirmation BEFORE calling this tool. Never call in the same turn as the summary.',
      inputSchema: {
        productIds: ProductIdsSchema.describe(
          'Product IDs to cancel all trigger orders for',
        ),
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({ productIds }: { productIds: number[] }) => {
      requireSigner('cancel_trigger_product_orders', ctx);

      return handleToolRequest(
        'cancel_trigger_product_orders',
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
