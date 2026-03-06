import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { NadoClientWithAccount } from '../../client.js';
import { asyncResult } from '../../utils/asyncResult.js';
import {
  buildOrderParams,
  resolveOrderParams,
} from '../../utils/orderBuilder.js';
import { requireSigner } from '../../utils/requireSigner.js';
import { BalanceSideSchema, ProductIdSchema } from '../../utils/schemas.js';

const TriggerTypeSchema = z
  .enum([
    'oracle_price_above',
    'oracle_price_below',
    'last_price_above',
    'last_price_below',
    'mid_price_above',
    'mid_price_below',
  ])
  .describe(
    'Trigger condition type. Use oracle_price_above/below for oracle-based triggers, last_price_above/below for last trade price, mid_price_above/below for mid-market price.',
  );

const MarginModeSchema = z
  .enum(['cross', 'isolated'])
  .default('cross')
  .describe('Margin mode: cross (default) or isolated');

export function registerPlaceTriggerOrder(
  server: McpServer,
  ctx: NadoClientWithAccount,
): void {
  server.registerTool(
    'place_trigger_order',
    {
      title: 'Place Trigger Order',
      description:
        'Place a trigger order (stop-loss, take-profit, or conditional) that executes when a price condition is met. ' +
        'Use oracle_price_above/below for standard TP/SL. Omit price for a stop-market order; provide price for a stop-limit order. ' +
        'Typically used with reduceOnly=true for TP/SL on existing positions.',
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
          .describe(
            'Limit price for the triggered order. Omit for a stop-market order (will use IOC with slippage).',
          ),
        triggerPrice: z
          .number()
          .positive()
          .describe('The price at which the trigger condition is evaluated'),
        triggerType: TriggerTypeSchema,
        reduceOnly: z
          .boolean()
          .default(true)
          .describe(
            'If true (default), only reduces an existing position. Typically true for TP/SL.',
          ),
        marginMode: MarginModeSchema,
        leverage: z
          .number()
          .positive()
          .optional()
          .describe('Leverage for isolated margin orders (e.g. 10 for 10x)'),
        slippagePct: z
          .number()
          .positive()
          .default(2)
          .describe(
            'Slippage tolerance percentage for stop-market orders (default: 2%)',
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
      triggerPrice,
      triggerType,
      reduceOnly,
      marginMode,
      leverage,
      slippagePct,
      borrowMargin,
    }: {
      productId: number;
      side: 'long' | 'short';
      amount: number;
      price?: number;
      triggerPrice: number;
      triggerType: z.infer<typeof TriggerTypeSchema>;
      reduceOnly: boolean;
      marginMode: 'cross' | 'isolated';
      leverage?: number;
      slippagePct: number;
      borrowMargin?: boolean;
    }) => {
      requireSigner('place_trigger_order', ctx);

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

      const executionType = price == null ? 'ioc' : 'default';

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
        'place_trigger_order',
        `Failed to place trigger ${side} order for product ${productId}`,
        () =>
          ctx.client.market.placeTriggerOrder({
            productId: orderParams.productId,
            order: {
              subaccountOwner: ctx.subaccountOwner,
              subaccountName: ctx.subaccountName,
              ...orderParams.order,
            },
            triggerCriteria: {
              type: 'price' as const,
              criteria: {
                triggerPrice,
                type: triggerType,
              },
            },
            borrowMargin,
          }),
      );
    },
  );
}
