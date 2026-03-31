import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { PriceTriggerDependency } from '@nadohq/client';
import { toBigNumber } from '@nadohq/client';
import { z } from 'zod';

import type { NadoContext } from '../../context';
import { handleToolRequest } from '../../utils/handleToolRequest';
import {
  DEFAULT_SLIPPAGE_PCT,
  buildPriceTriggerOrder,
  resolveMarketData,
  toMutationPriceString,
} from '../../utils/orderBuilder';
import { requireSigner } from '../../utils/requireSigner';
import {
  type BalanceSide,
  BalanceSideSchema,
  type MarginMode,
  MarginModeSchema,
  ProductIdSchema,
  SAFETY_DISCLAIMER,
} from '../../utils/schemas';

// TODO: Export PRICE_TRIGGER_TYPES array from @nadohq/client and derive this schema from it
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
        'To attach TP/SL to a resting limit order, pass the order digest from place_order as orderDigest — ' +
        'the trigger will wait in waiting_dependency status until the resting order fills before activating. ' +
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
        orderDigest: z
          .string()
          .optional()
          .describe(
            'Digest of a resting order (from place_order response) that this trigger depends on. ' +
              'When set, the trigger order enters waiting_dependency status and only activates after the resting order fills. ' +
              'Use this to attach TP/SL orders to a resting limit order.',
          ),
        triggerOnPartialFill: z
          .boolean()
          .default(false)
          .describe(
            'When orderDigest is set: if true, activate the trigger on partial fills of the resting order; ' +
              'if false (default), wait for the resting order to fully fill.',
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
      orderDigest,
      triggerOnPartialFill,
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
      orderDigest?: string;
      triggerOnPartialFill: boolean;
    }) => {
      requireSigner('place_trigger_order', ctx);

      const { priceIncrement } = await resolveMarketData(ctx.client, productId);
      const roundedTriggerPrice = toMutationPriceString(
        toBigNumber(triggerPrice),
        priceIncrement,
      );

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

      const resolvedBorrowMargin =
        borrowMargin ??
        (marginMode === 'isolated' && reduceOnly ? false : undefined);

      const dependency: PriceTriggerDependency | undefined = orderDigest
        ? { digest: orderDigest, onPartialFill: triggerOnPartialFill }
        : undefined;

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
                triggerPrice: roundedTriggerPrice,
                type: triggerType,
                dependency,
              },
            },
            borrowMargin: resolvedBorrowMargin,
          }),
      );
    },
  );
}
