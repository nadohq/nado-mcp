import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { NadoContext } from '../../context.js';
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
  type MarginMode,
  MarginModeSchema,
  ProductIdSchema,
  type TimeInForce,
  TimeInForceSchema,
} from '../../utils/schemas.js';

export function registerPlaceOrder(server: McpServer, ctx: NadoContext): void {
  server.registerTool(
    'place_order',
    {
      title: 'Place Order',
      description:
        'Place a market or limit order on Nado. Omit price for a market order (will use IOC with slippage). Provide price for a limit order. Supports cross and isolated margin modes. ' +
        'SAFETY: You MUST present an execution summary and receive explicit user confirmation BEFORE calling this tool. Never call in the same turn as the summary.',
      inputSchema: {
        productId: ProductIdSchema,
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
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({
      productId,
      side,
      amount,
      price,
      marginMode,
      leverage,
      timeInForce,
      reduceOnly,
      slippagePct,
      spotLeverage,
      borrowMargin,
    }: {
      productId: number;
      side: BalanceSide;
      amount: number;
      price?: number;
      marginMode: MarginMode;
      leverage?: number;
      timeInForce: TimeInForce;
      reduceOnly: boolean;
      slippagePct: number;
      spotLeverage?: boolean;
      borrowMargin?: boolean;
    }) => {
      requireSigner('place_order', ctx);

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
        'place_order',
        `Failed to place ${side} order for product ${productId}`,
        () =>
          ctx.client.market.placeOrders({
            orders: [
              {
                ...orderParams,
                order: {
                  subaccountOwner: ctx.subaccountOwner,
                  subaccountName: ctx.subaccountName,
                  ...orderParams.order,
                },
                spotLeverage,
                borrowMargin,
              },
            ],
          }),
      );
    },
  );
}
