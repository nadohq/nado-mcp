/**
 * nado_place_order — Thin validated wrapper for order placement
 *
 * Handles: limit orders, market orders, close position.
 * Replaces: place_order, close_position tools.
 *
 * Custom logic kept (SDK gaps):
 *   - Symbol resolution (fuzzy match → productId)
 *   - Price increment rounding
 *   - Size increment rounding
 *   - Market order price resolution (best bid/ask + slippage)
 *   - x18 decimal conversion (addDecimals)
 *
 * Delegated to SDK:
 *   - Nonce generation
 *   - EIP712 signing
 *   - Appendix packing (packOrderAppendix)
 *   - Server payload construction
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { OrderExecutionType } from '@nadohq/client';
import { addDecimals, packOrderAppendix, toBigDecimal } from '@nadohq/client';
import BigNumber from 'bignumber.js';
import { z } from 'zod';

import type { NadoContext } from '../context.js';
import { resolveSymbol, type ResolvedSymbol } from './utils/symbolResolver.js';

// ─── Shared Utilities ─────────────────────────────────────────────

function roundToIncrement(value: BigNumber, increment: BigNumber): BigNumber {
  if (increment.isZero()) return value;
  return value
    .dividedBy(increment)
    .integerValue(BigNumber.ROUND_DOWN)
    .times(increment);
}

const TIF_MAP: Record<string, OrderExecutionType> = {
  gtc: 'default',
  ioc: 'ioc',
  fok: 'fok',
  post_only: 'post_only',
};

const DEFAULT_SLIPPAGE_PCT = 2;

// ─── Order Parameter Resolution ───────────────────────────────────

async function resolvePrice(
  ctx: NadoContext,
  symbol: ResolvedSymbol,
  side: 'long' | 'short',
  price: number | undefined,
  slippagePct: number,
): Promise<string> {
  if (price != null) {
    return roundToIncrement(
      new BigNumber(price),
      symbol.priceIncrement,
    ).toFixed();
  }

  // Market order: use best bid/ask + slippage
  const marketPrice = await ctx.client.market.getLatestMarketPrice({
    productId: symbol.productId,
  });
  const slippageMul = 1 + slippagePct / 100;

  if (side === 'long') {
    const bid = marketPrice.bid;
    if (bid.lte(0)) {
      throw new Error(
        `No bid price for ${symbol.symbol}. Cannot place market buy.`,
      );
    }
    return roundToIncrement(
      bid.times(slippageMul),
      symbol.priceIncrement,
    ).toFixed();
  }

  const ask = marketPrice.ask;
  if (ask.lte(0)) {
    throw new Error(
      `No ask price for ${symbol.symbol}. Cannot place market sell.`,
    );
  }
  return roundToIncrement(
    ask.dividedBy(slippageMul),
    symbol.priceIncrement,
  ).toFixed();
}

function resolveAmount(
  amount: number,
  side: 'long' | 'short',
  sizeIncrement: BigNumber,
): string {
  const absX18 = roundToIncrement(
    toBigDecimal(addDecimals(amount)).abs(),
    sizeIncrement,
  );
  return (side === 'short' ? absX18.negated() : absX18).toFixed(0);
}

// ─── Tool Registration ────────────────────────────────────────────

export function registerPlaceOrderTool(
  server: McpServer,
  ctx: NadoContext,
): void {
  server.registerTool(
    'nado_place_order',
    {
      title: 'Place Order',
      description:
        'Place a limit or market order on Nado. Accepts a human-readable market name ' +
        '(e.g. "ETH-PERP", "BTC", "ethereum"). Omit price for a market order (uses IOC with slippage). ' +
        'SAFETY: You MUST present an execution summary and receive explicit user confirmation ' +
        'BEFORE calling this tool. Never call in the same turn as the summary.',
      inputSchema: {
        market: z
          .string()
          .describe(
            'Market name or symbol (e.g. "ETH-PERP", "BTC", "bitcoin")',
          ),
        side: z.enum(['long', 'short']).describe('Buy (long) or sell (short)'),
        amount: z
          .number()
          .positive()
          .describe('Order size in base units (e.g. 0.5 for 0.5 ETH)'),
        price: z
          .number()
          .positive()
          .optional()
          .describe('Limit price. Omit for a market order.'),
        timeInForce: z
          .enum(['gtc', 'ioc', 'fok', 'post_only'])
          .default('gtc')
          .describe('Time-in-force (default: gtc). Market orders use ioc.'),
        reduceOnly: z
          .boolean()
          .default(false)
          .describe('Only reduce an existing position'),
        marginMode: z
          .enum(['cross', 'isolated'])
          .default('cross')
          .describe('Margin mode'),
        leverage: z
          .number()
          .positive()
          .optional()
          .describe('Leverage for isolated margin (e.g. 10)'),
        slippagePct: z
          .number()
          .positive()
          .default(DEFAULT_SLIPPAGE_PCT)
          .describe(`Slippage % for market orders (default: ${DEFAULT_SLIPPAGE_PCT}%)`),
        spotLeverage: z
          .boolean()
          .optional()
          .describe('Allow borrowing for spot orders'),
        borrowMargin: z
          .boolean()
          .optional()
          .describe('Allow margin borrowing for isolated orders'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async (input: {
      market: string;
      side: 'long' | 'short';
      amount: number;
      price?: number;
      timeInForce: string;
      reduceOnly: boolean;
      marginMode: 'cross' | 'isolated';
      leverage?: number;
      slippagePct: number;
      spotLeverage?: boolean;
      borrowMargin?: boolean;
    }) => {
      if (!ctx.hasSigner || !ctx.subaccountOwner) {
        throw new Error(
          'nado_place_order requires a signer (PRIVATE_KEY env var).',
        );
      }

      // 1. Resolve symbol
      const symbol = await resolveSymbol(ctx, input.market);

      // 2. Resolve price (limit or market)
      const isMarket = input.price == null;
      const executionType: OrderExecutionType = isMarket
        ? 'ioc'
        : (TIF_MAP[input.timeInForce] ?? 'default');

      const resolvedPrice = await resolvePrice(
        ctx,
        symbol,
        input.side,
        input.price,
        input.slippagePct,
      );

      // 3. Resolve amount to x18
      const resolvedAmount = resolveAmount(
        input.amount,
        input.side,
        symbol.sizeIncrement,
      );

      // 4. Compute isolated margin if needed
      const isolated = (() => {
        if (input.marginMode !== 'isolated') return undefined;
        if (input.leverage == null) {
          throw new Error(
            'leverage is required for isolated margin orders.',
          );
        }
        return {
          margin: addDecimals(
            Math.abs(
              (input.amount * Number(resolvedPrice)) / input.leverage,
            ),
          ),
        };
      })();

      // 5. Pack appendix (SDK handles the bit packing)
      const appendix = packOrderAppendix({
        orderExecutionType: executionType,
        reduceOnly: input.reduceOnly,
        isolated,
      });

      // 6. Submit via SDK — nonce + signing handled internally
      const result = await ctx.client.market.placeOrders({
        orders: [
          {
            productId: symbol.productId,
            order: {
              subaccountOwner: ctx.subaccountOwner,
              subaccountName: ctx.subaccountName,
              price: resolvedPrice,
              amount: resolvedAmount,
              expiration: Date.now(),
              appendix,
            },
            spotLeverage: input.spotLeverage,
            borrowMargin: input.borrowMargin,
          },
        ],
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                ...result,
                _summary: {
                  market: symbol.symbol,
                  productId: symbol.productId,
                  side: input.side,
                  amount: input.amount,
                  price: isMarket
                    ? `market (resolved: ${resolvedPrice})`
                    : resolvedPrice,
                  marginMode: input.marginMode,
                  executionType,
                },
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
