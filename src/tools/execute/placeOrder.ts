import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { NadoContext } from '../../context.js';
import { handleToolRequest } from '../../utils/handleToolRequest.js';
import {
  DEFAULT_SLIPPAGE_PCT,
  buildEngineOrder,
  toExecutionType,
} from '../../utils/orderBuilder.js';
import { requireSigner } from '../../utils/requireSigner.js';
import {
  BalanceSideSchema,
  MarginModeSchema,
  ProductIdSchema,
  SAFETY_DISCLAIMER,
  TimeInForceSchema,
} from '../../utils/schemas.js';

const OrderSchema = z.object({
  productId: ProductIdSchema,
  side: BalanceSideSchema,
  amount: z
    .number()
    .positive()
    .describe('Order size in base asset units (e.g. 0.001 for 0.001 BTC)'),
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
  spotLeverage: z
    .boolean()
    .optional()
    .describe(
      'If true, allows negative spot balance (borrow) for spot market orders. Defaults to engine default (true).',
    ),
  borrowMargin: z
    .boolean()
    .optional()
    .describe(
      'For isolated margin orders, whether margin can be borrowed from the cross account. Defaults to engine default.',
    ),
});

type Order = z.infer<typeof OrderSchema>;

export function registerPlaceOrder(server: McpServer, ctx: NadoContext): void {
  server.registerTool(
    'place_order',
    {
      title: 'Place Order(s)',
      description:
        'Place one or more orders on Nado. Supports market and limit orders, cross and isolated margin. ' +
        'Pass a single order object, or an array to batch multiple orders atomically (e.g. scaled/grid orders). ' +
        'Omit price for a market order (will use IOC with slippage). ' +
        SAFETY_DISCLAIMER,
      inputSchema: {
        orders: z.union([OrderSchema, z.array(OrderSchema).min(1).max(50)]),
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({ orders: input }: { orders: Order | Order[] }) => {
      requireSigner('place_order', ctx);

      const orderList = Array.isArray(input) ? input : [input];

      const built = await Promise.all(
        orderList.map(async (o) => {
          const isMarketOrder = o.price == null;
          const executionType = isMarketOrder
            ? 'ioc'
            : toExecutionType(o.timeInForce);

          const orderParams = await buildEngineOrder({
            client: ctx.client,
            productId: o.productId,
            amount: o.side === 'short' ? -o.amount : o.amount,
            price: o.price,
            slippagePct: o.slippagePct,
            orderExecutionType: executionType,
            reduceOnly: o.reduceOnly,
            marginMode: o.marginMode,
            leverage: o.leverage,
          });

          return {
            ...orderParams,
            order: {
              subaccountOwner: ctx.subaccountOwner,
              subaccountName: ctx.subaccountName,
              ...orderParams.order,
            },
            spotLeverage: o.spotLeverage,
            borrowMargin: o.borrowMargin,
          };
        }),
      );

      return handleToolRequest(
        'place_order',
        `Failed to place ${built.length} order(s)`,
        () => ctx.client.market.placeOrders({ orders: built }),
      );
    },
  );
}
