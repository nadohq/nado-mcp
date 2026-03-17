import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { NadoContext } from '../../context';
import { handleToolRequest } from '../../utils/handleToolRequest';
import {
  DEFAULT_SLIPPAGE_PCT,
  buildEngineOrder,
} from '../../utils/orderBuilder';
import { requireSigner } from '../../utils/requireSigner';
import {
  type BalanceSide,
  BalanceSideSchema,
  type MarginMode,
  MarginModeSchema,
  ProductIdSchema,
  ProductIdsSchema,
  SAFETY_DISCLAIMER,
  type TimeInForce,
  TimeInForceSchema,
} from '../../utils/schemas';

export function registerCancelAndPlace(
  server: McpServer,
  ctx: NadoContext,
): void {
  server.registerTool(
    'cancel_and_place',
    {
      title: 'Cancel and Place Order',
      description:
        'Atomically cancel one or more orders and place a new order in a single operation. ' +
        'Use this to modify an existing order without risk of partial fills between cancel and place. ' +
        'Use get_open_orders to find order digests for cancellation. ' +
        SAFETY_DISCLAIMER,
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
      annotations: { readOnlyHint: false, destructiveHint: true },
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
      marginMode: MarginMode;
      leverage?: number;
      timeInForce: TimeInForce;
      reduceOnly: boolean;
      slippagePct: number;
    }) => {
      requireSigner('cancel_and_place', ctx);

      const orderParams = await buildEngineOrder({
        client: ctx.client,
        productId,
        amount: side === 'short' ? -amount : amount,
        price,
        slippagePct,
        orderExecutionType: price == null ? 'ioc' : timeInForce,
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
