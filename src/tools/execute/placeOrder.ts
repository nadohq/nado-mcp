import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { NadoClientWithAccount } from '../../client.js';
import { asyncResult } from '../../utils/asyncResult.js';
import {
  buildOrderParams,
  resolveOrderParams,
  toExecutionType,
} from '../../utils/orderBuilder.js';
import { requireSigner } from '../../utils/requireSigner.js';
import { BalanceSideSchema, ProductIdSchema } from '../../utils/schemas.js';

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

export function registerPlaceOrder(
  server: McpServer,
  ctx: NadoClientWithAccount,
): void {
  server.registerTool(
    'place_order',
    {
      title: 'Place Order',
      description:
        'Place a market or limit order on Nado. Omit price for a market order (will use IOC with slippage). Provide price for a limit order. Supports cross and isolated margin modes.',
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
          .default(2)
          .describe(
            'Slippage tolerance percentage for market orders (default: 2%)',
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
      annotations: { readOnlyHint: false },
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
      side: 'long' | 'short';
      amount: number;
      price?: number;
      marginMode: 'cross' | 'isolated';
      leverage?: number;
      timeInForce: 'gtc' | 'ioc' | 'fok' | 'post_only';
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

      const resolved = await resolveOrderParams(
        ctx.client,
        productId,
        side,
        amount,
        price,
        slippagePct,
      );

      const isolated =
        marginMode === 'isolated' && leverage
          ? { margin: Math.abs((amount * Number(resolved.price)) / leverage) }
          : undefined;

      const orderParams = buildOrderParams({
        productId,
        side,
        amountX18: resolved.amountX18,
        price: resolved.price,
        orderExecutionType: executionType,
        reduceOnly,
        isolated,
      });

      return asyncResult(
        'place_order',
        `Failed to place ${side} order for product ${productId}`,
        () =>
          ctx.client.market.placeOrder({
            ...orderParams,
            order: {
              subaccountOwner: ctx.subaccountOwner,
              subaccountName: ctx.subaccountName,
              ...orderParams.order,
            },
            spotLeverage,
            borrowMargin,
          }),
      );
    },
  );
}
