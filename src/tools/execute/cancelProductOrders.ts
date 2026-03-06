import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { NadoClientWithAccount } from '../../client.js';
import { asyncResult } from '../../utils/asyncResult.js';
import { requireSigner } from '../../utils/requireSigner.js';
import { ProductIdsSchema } from '../../utils/schemas.js';

export function registerCancelProductOrders(
  server: McpServer,
  ctx: NadoClientWithAccount,
): void {
  server.registerTool(
    'cancel_product_orders',
    {
      title: 'Cancel All Product Orders',
      description:
        'Cancel ALL open orders for one or more products. Use this to quickly clear all resting orders on specific markets. For cancelling individual orders by digest, use cancel_orders instead.',
      inputSchema: {
        productIds: ProductIdsSchema.describe(
          'Product IDs to cancel all orders for',
        ),
      },
      annotations: { readOnlyHint: false },
    },
    async ({ productIds }: { productIds: number[] }) => {
      requireSigner('cancel_product_orders', ctx);

      return asyncResult(
        'cancel_product_orders',
        `Failed to cancel orders for products [${productIds.join(', ')}]. Use get_all_markets to verify product IDs.`,
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
