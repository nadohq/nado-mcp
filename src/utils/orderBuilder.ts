import type {
  BigDecimalish,
  NadoClient,
  OrderExecutionType,
} from '@nadohq/client';
import { addDecimals, getOrderNonce, packOrderAppendix } from '@nadohq/client';
import BigNumber from 'bignumber.js';

const TIF_TO_EXECUTION_TYPE: Record<string, OrderExecutionType> = {
  gtc: 'default',
  ioc: 'ioc',
  fok: 'fok',
  post_only: 'post_only',
};

export function toExecutionType(tif: string): OrderExecutionType {
  return TIF_TO_EXECUTION_TYPE[tif] ?? 'default';
}

export interface BuildOrderInput {
  productId: number;
  side: 'long' | 'short';
  /** Already in x18, rounded to sizeIncrement, signed (negative for short) */
  amountX18: string;
  /** Human-form price, rounded to priceIncrement */
  price: string;
  orderExecutionType: OrderExecutionType;
  reduceOnly: boolean;
  isolated?: { margin: number };
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

export function buildOrderParams(input: BuildOrderInput): BuiltOrderParams {
  const appendix = packOrderAppendix({
    orderExecutionType: input.orderExecutionType,
    reduceOnly: input.reduceOnly,
    isolated: input.isolated
      ? { margin: addDecimals(input.isolated.margin) }
      : undefined,
  });

  return {
    productId: input.productId,
    order: {
      price: input.price,
      amount: input.amountX18,
      expiration: Date.now(),
      nonce: getOrderNonce(),
      appendix,
    },
  };
}

const DEFAULT_SLIPPAGE_PCT = 2;

function roundToIncrement(value: BigNumber, increment: BigNumber): BigNumber {
  if (increment.isZero()) return value;
  return value
    .dividedBy(increment)
    .integerValue(BigNumber.ROUND_DOWN)
    .times(increment);
}

export interface ResolvedOrderParams {
  /** Human-form price string, rounded to priceIncrement */
  price: string;
  /** x18 amount string (signed: negative for short), rounded to sizeIncrement */
  amountX18: string;
}

/**
 * Resolves order price and amount, matching the frontend's rounding logic:
 * - Price: round human-form price to priceIncrement (already removeDecimals'd)
 * - Amount: convert to x18 via addDecimals, then round to sizeIncrement (raw x18)
 */
export async function resolveOrderParams(
  client: NadoClient,
  productId: number,
  side: 'long' | 'short',
  amount: number,
  price: number | undefined,
  slippagePct: number = DEFAULT_SLIPPAGE_PCT,
): Promise<ResolvedOrderParams> {
  const allMarkets = await client.market.getAllMarkets();
  const market = allMarkets.find((m) => m.productId === productId);

  const priceIncrement = market
    ? new BigNumber(market.priceIncrement.toString())
    : new BigNumber(1);
  const sizeIncrement = market
    ? new BigNumber(market.sizeIncrement.toString())
    : new BigNumber(1);

  const signedHuman = side === 'short' ? -amount : amount;
  const amountX18 = new BigNumber(addDecimals(signedHuman).toString());
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
      const askPrice = new BigNumber(marketPrice.ask.toString());
      if (askPrice.lte(0)) {
        throw new Error(
          `No ask price available for product ${productId}. Cannot place market buy order.`,
        );
      }
      return roundToIncrement(
        askPrice.times(slippageMultiplier),
        priceIncrement,
      ).toFixed();
    }

    const bidPrice = new BigNumber(marketPrice.bid.toString());
    if (bidPrice.lte(0)) {
      throw new Error(
        `No bid price available for product ${productId}. Cannot place market sell order.`,
      );
    }
    return roundToIncrement(
      bidPrice.dividedBy(slippageMultiplier),
      priceIncrement,
    ).toFixed();
  })();

  return {
    price: resolvedPrice,
    amountX18: signedAmountX18.toFixed(0),
  };
}

export interface BuildTwapOrderInput {
  productId: number;
  side: 'long' | 'short';
  /** Already in x18, rounded to sizeIncrement, signed (negative for short) */
  amountX18: string;
  /** Human-form price, rounded to priceIncrement */
  price: string;
  reduceOnly: boolean;
  twap: { numOrders: number; slippageFrac: number };
  /** Expiration as unix seconds */
  expirationSecs: number;
}

export interface BuiltTwapOrderParams {
  productId: number;
  order: {
    price: BigDecimalish;
    amount: BigDecimalish;
    expiration: BigDecimalish;
    nonce: string;
    appendix: bigint;
  };
}

export function buildTwapOrderParams(
  input: BuildTwapOrderInput,
): BuiltTwapOrderParams {
  const appendix = packOrderAppendix({
    orderExecutionType: 'ioc',
    triggerType: 'twap',
    reduceOnly: input.reduceOnly,
    twap: input.twap,
  });

  return {
    productId: input.productId,
    order: {
      price: input.price,
      amount: input.amountX18,
      expiration: input.expirationSecs,
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
