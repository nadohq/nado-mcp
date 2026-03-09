import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { NadoClientWithAccount } from '../../client.js';
import { handleToolRequest } from '../../utils/handleToolRequest.js';
import {
  DEFAULT_SLIPPAGE_PCT,
  buildOrder,
  toExecutionType,
} from '../../utils/orderBuilder.js';
import { requireSigner } from '../../utils/requireSigner.js';
import {
  type BalanceSide,
  BalanceSideSchema,
  ProductIdSchema,
  ProductIdsSchema,
} from '../../utils/schemas.js';

const MarginModeSchema = z
  .enum(['cross', 'isolated'])
  .default('cross')
  .describe('Margin mode: cross (default) or isolated');

const TimeInForceSchema = z
  .enum(['gtc', 'ioc', 'fok', 'post_only'])
  .default('gtc')
  .describe(
    'Time in force: gtc (good-til-cancel, default), ioc (immediate-or-cancel), fok (fill-or-kill), post_only',
  );

export function registerCancelAndPlace(
  server: McpServer,
  ctx: NadoClientWithAccount,
): void {
  server.registerTool(
    'cancel_and_place',
    {
      title: 'Cancel and Place Order',
      description:
        'Atomically cancel one or more orders and place a new order in a single operation. ' +
        'Use this to modify an existing order without risk of partial fills between cancel and place. ' +
        'Use get_open_orders to find order digests for cancellation.',
      inputSchema: {
        cancelProductIds: ProductIdsSchema.describe(
          'Product IDs of the orders to cancel (must match cancelDigests by index)',
        ),
        cancelDigests: z
          .array(z.string())
          .describe('Order digests to cancel (from get_open_orders)'),
        productId: ProductIdSchema.describe(
          'Product ID for the new order to place',
        ),
        side: BalanceSideSchema,
        amount: z
          .number()
          .positive()
          .describe(
            'Order size in base asset units (e.g. 0.001 for 0.001 BTC)',
          ),
        price: z
          .number()
          .positive()
          .optional()
          .describe('Limit price. Omit for a market order.'),
        marginMode: MarginModeSchema,
        leverage: z
          .number()
          .positive()
          .optional()
          .describe('Leverage for isolated margin orders (e.g. 10 for 10x)'),
        timeInForce: TimeInForceSchema,
        reduceOnly: z
          .boolean()
          .default(false)
          .describe('If true, only reduces an existing position'),
        slippagePct: z
          .number()
          .positive()
          .default(DEFAULT_SLIPPAGE_PCT)
          .describe(
            `Slippage tolerance percentage for market orders (default: ${DEFAULT_SLIPPAGE_PCT}%)`,
          ),
      },
      annotations: { readOnlyHint: false },
    },
    async ({
      cancelProductIds,
      cancelDigests,
      productId,
      side,
      amount,
      price,
      marginMode,
      leverage,
      timeInForce,
      reduceOnly,
      slippagePct,
    }: {
      cancelProductIds: number[];
      cancelDigests: string[];
      productId: number;
      side: BalanceSide;
      amount: number;
      price?: number;
      marginMode: 'cross' | 'isolated';
      leverage?: number;
      timeInForce: 'gtc' | 'ioc' | 'fok' | 'post_only';
      reduceOnly: boolean;
      slippagePct: number;
    }) => {
      requireSigner('cancel_and_place', ctx);

      const isMarketOrder = price == null;
      const executionType = isMarketOrder
        ? 'ioc'
        : toExecutionType(timeInForce);

      const orderParams = await buildOrder({
        client: ctx.client,
        productId,
        side,
        amount,
        price,
        slippagePct,
        orderExecutionType: executionType,
        reduceOnly,
        marginMode,
        leverage,
      });

      return handleToolRequest(
        'cancel_and_place',
        'Failed to cancel and place order. Verify the cancel digests are valid using get_open_orders.',
        () =>
          ctx.client.market.cancelAndPlace({
            cancelOrders: {
              subaccountOwner: ctx.subaccountOwner,
              subaccountName: ctx.subaccountName,
              productIds: cancelProductIds,
              digests: cancelDigests,
            },
            placeOrder: {
              ...orderParams,
              order: {
                subaccountOwner: ctx.subaccountOwner,
                subaccountName: ctx.subaccountName,
                ...orderParams.order,
              },
            },
          }),
      );
    },
  );
}
