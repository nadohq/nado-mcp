import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { NadoContext } from '../../context.js';
import { handleToolRequest } from '../../utils/handleToolRequest.js';
import {
  DEFAULT_SLIPPAGE_PCT,
  buildPriceTriggerOrder,
} from '../../utils/orderBuilder.js';
import { requireSigner } from '../../utils/requireSigner.js';
import {
  type BalanceSide,
  BalanceSideSchema,
  type MarginMode,
  MarginModeSchema,
  ProductIdSchema,
  SAFETY_DISCLAIMER,
} from '../../utils/schemas.js';

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

export function registerPlaceTriggerOrder(
  server: McpServer,
  ctx: NadoContext,
): void {
  server.registerTool(
    'place_trigger_order',
    {
      title: 'Place Trigger Order',
      description:
        'Place a trigger order (stop-loss, take-profit, or conditional) that executes when a price condition is met. ' +
        'Use oracle_price_above/below for standard TP/SL. Omit price for a stop-market order; provide price for a stop-limit order. ' +
        'Typically used with reduceOnly=true for TP/SL on existing positions. ' +
        SAFETY_DISCLAIMER,
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
          .default(DEFAULT_SLIPPAGE_PCT)
          .describe(
            `Slippage tolerance percentage for stop-market orders (default: ${DEFAULT_SLIPPAGE_PCT}%)`,
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
      triggerPrice,
      triggerType,
      reduceOnly,
      marginMode,
      leverage,
      slippagePct,
      borrowMargin,
    }: {
      productId: number;
      side: BalanceSide;
      amount: number;
      price?: number;
      triggerPrice: number;
      triggerType: z.infer<typeof TriggerTypeSchema>;
      reduceOnly: boolean;
      marginMode: MarginMode;
      leverage?: number;
      slippagePct: number;
      borrowMargin?: boolean;
    }) => {
      requireSigner('place_trigger_order', ctx);

      const orderParams = await buildPriceTriggerOrder({
        client: ctx.client,
        productId,
        amount: side === 'short' ? -amount : amount,
        price,
        slippagePct,
        reduceOnly,
        marginMode,
        leverage,
      });

      return handleToolRequest(
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
