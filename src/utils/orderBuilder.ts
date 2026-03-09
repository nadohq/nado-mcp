import type {
  BigDecimalish,
  NadoClient,
  OrderExecutionType,
} from '@nadohq/client';
import {
  addDecimals,
  getOrderNonce,
  packOrderAppendix,
  toBigDecimal,
} from '@nadohq/client';
import BigNumber from 'bignumber.js';

import type { BalanceSide } from './schemas.js';

const TIF_TO_EXECUTION_TYPE: Record<string, OrderExecutionType> = {
  gtc: 'default',
  ioc: 'ioc',
  fok: 'fok',
  post_only: 'post_only',
};

export function toExecutionType(tif: string): OrderExecutionType {
  return TIF_TO_EXECUTION_TYPE[tif] ?? 'default';
}

export const DEFAULT_SLIPPAGE_PCT = 2;

function roundToIncrement(value: BigNumber, increment: BigNumber): BigNumber {
  if (increment.isZero()) return value;
  return value
    .dividedBy(increment)
    .integerValue(BigNumber.ROUND_DOWN)
    .times(increment);
}

export interface BuiltOrderParams {
  productId: number;
  order: {
    price: BigDecimalish;
    amount: BigDecimalish;
    expiration: BigDecimalish;
    nonce: string;
    appendix: bigint;
  };
}

export interface BuildOrderInput {
  client: NadoClient;
  productId: number;
  side: BalanceSide;
  amount: number;
  price?: number;
  slippagePct?: number;
  orderExecutionType: OrderExecutionType;
  reduceOnly: boolean;
  marginMode?: 'cross' | 'isolated';
  leverage?: number;
  twap?: { numOrders: number; slippageFrac: number };
  expirationSecs?: number;
}

/**
 * Resolves price/amount (fetching market data as needed) and builds the
 * final order params ready for submission.
 *
 * Price resolution:
 * - Limit order: rounds the given price to priceIncrement
 * - Market order (price omitted): uses top-of-book + slippage
 *
 * Amount: converts human amount to x18 via addDecimals, rounds to sizeIncrement.
 *
 * Isolated margin: when `marginMode` is 'isolated', `leverage` is required and
 * the margin is computed from the resolved price.
 *
 * TWAP: pass `twap` and `expirationSecs`; `orderExecutionType` is forced to 'ioc'.
 */
export async function buildOrder(
  input: BuildOrderInput,
): Promise<BuiltOrderParams> {
  const {
    client,
    productId,
    side,
    amount,
    price,
    slippagePct = DEFAULT_SLIPPAGE_PCT,
    reduceOnly,
    marginMode,
    leverage,
    twap,
    expirationSecs,
  } = input;

  const allMarkets = await client.market.getAllMarkets();
  const market = allMarkets.find((m) => m.productId === productId);

  const priceIncrement = market ? market.priceIncrement : new BigNumber(1);
  const sizeIncrement = market ? market.sizeIncrement : new BigNumber(1);

  const signedHuman = side === 'short' ? -amount : amount;
  const amountX18 = toBigDecimal(addDecimals(signedHuman));
  const roundedAmountX18 = roundToIncrement(amountX18.abs(), sizeIncrement);
  const signedAmountX18 =
    side === 'short' ? roundedAmountX18.negated() : roundedAmountX18;

  const resolvedPrice = await (async () => {
    if (price != null) {
      return roundToIncrement(new BigNumber(price), priceIncrement).toFixed();
    }

    const marketPrice = await client.market.getLatestMarketPrice({
      productId,
    });
    const slippageMultiplier = 1 + slippagePct / 100;

    if (side === 'long') {
      const bidPrice = marketPrice.bid;
      if (bidPrice.lte(0)) {
        throw new Error(
          `No bid price available for product ${productId}. Cannot place market buy order.`,
        );
      }
      return roundToIncrement(
        bidPrice.times(slippageMultiplier),
        priceIncrement,
      ).toFixed();
    }

    const askPrice = marketPrice.ask;
    if (askPrice.lte(0)) {
      throw new Error(
        `No ask price available for product ${productId}. Cannot place market sell order.`,
      );
    }
    return roundToIncrement(
      askPrice.dividedBy(slippageMultiplier),
      priceIncrement,
    ).toFixed();
  })();

  const isolated = (() => {
    if (marginMode !== 'isolated') return undefined;
    if (leverage == null) {
      throw new Error('leverage is required when marginMode is "isolated".');
    }
    return {
      margin: addDecimals(
        Math.abs((amount * Number(resolvedPrice)) / leverage),
      ),
    };
  })();

  const appendix = twap
    ? packOrderAppendix({
        orderExecutionType: 'ioc',
        triggerType: 'twap',
        reduceOnly,
        twap,
      })
    : packOrderAppendix({
        orderExecutionType: input.orderExecutionType,
        reduceOnly,
        isolated,
      });

  return {
    productId,
    order: {
      price: resolvedPrice,
      amount: signedAmountX18.toFixed(0),
      expiration: expirationSecs ?? Date.now(),
      nonce: getOrderNonce(),
      appendix,
    },
  };
}

export function calculateTwapExpiration(
  numOrders: number,
  intervalSeconds: number,
): number {
  const runtimeSeconds = (numOrders - 1) * intervalSeconds;
  return Math.floor(Date.now() / 1000) + runtimeSeconds + 5;
}
