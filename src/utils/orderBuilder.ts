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

export const DEFAULT_SLIPPAGE_PCT = 2;

const DEFAULT_ORDER_LIFETIME_SECONDS = 1000;

/**
 * Engine order expiration in seconds from now.
 * The engine interprets this field as a unix timestamp in seconds.
 */
function getExpiration(
  secondsInFuture = DEFAULT_ORDER_LIFETIME_SECONDS,
): number {
  return Math.floor(Date.now() / 1000) + secondsInFuture;
}

export function roundToIncrement(
  value: BigNumber,
  increment: BigNumber,
): BigNumber {
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

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

export interface MarketIncrements {
  priceIncrement: BigNumber;
  sizeIncrement: BigNumber;
}

let allMarketsCache:
  | Awaited<ReturnType<NadoClient['market']['getAllMarkets']>>
  | undefined;

/** @internal Exposed for testing only. */
export function _resetMarketDataCache(): void {
  allMarketsCache = undefined;
}

export async function resolveMarketIncrements(
  client: NadoClient,
  productId: number,
): Promise<MarketIncrements> {
  if (!allMarketsCache) {
    allMarketsCache = await client.market.getAllMarkets();
  }
  const market = allMarketsCache.find((m) => m.productId === productId);
  if (!market) {
    throw new Error(
      `Unknown product ${productId}. Use get_all_markets to find valid product IDs.`,
    );
  }
  return {
    priceIncrement: market.priceIncrement,
    sizeIncrement: market.sizeIncrement,
  };
}

interface ResolvedAmount {
  absAmountX18: BigNumber;
  signedAmountX18: BigNumber;
}

function resolveAmount(
  amount: number,
  sizeIncrement: BigNumber,
): ResolvedAmount {
  const isLong = amount > 0;
  const absAmountX18 = roundToIncrement(
    addDecimals(toBigDecimal(Math.abs(amount))),
    sizeIncrement,
  );
  const signedAmountX18 = isLong ? absAmountX18 : absAmountX18.negated();
  return { absAmountX18, signedAmountX18 };
}

interface ResolvePriceInput {
  client: NadoClient;
  productId: number;
  isLong: boolean;
  slippagePct: number;
  priceIncrement: BigNumber;
  price?: number;
}

async function resolvePrice({
  client,
  productId,
  isLong,
  slippagePct,
  priceIncrement,
  price,
}: ResolvePriceInput): Promise<string> {
  if (price != null) {
    return roundToIncrement(toBigDecimal(price), priceIncrement).toFixed();
  }

  const marketPrice = await client.market.getLatestMarketPrice({ productId });
  const slippageFrac = slippagePct / 100;

  if (isLong) {
    const askPrice = marketPrice.ask;
    if (askPrice.lte(0)) {
      throw new Error(
        `No ask price available for product ${productId}. Cannot place market buy order.`,
      );
    }
    return roundToIncrement(
      askPrice.times(1 + slippageFrac),
      priceIncrement,
    ).toFixed();
  }

  const bidPrice = marketPrice.bid;
  if (bidPrice.lte(0)) {
    throw new Error(
      `No bid price available for product ${productId}. Cannot place market sell order.`,
    );
  }
  return roundToIncrement(
    bidPrice.times(1 - slippageFrac),
    priceIncrement,
  ).toFixed();
}

function computeIsolatedMargin(
  amount: number,
  resolvedPrice: string,
  leverage: number,
): BigNumber {
  return addDecimals(
    toBigDecimal(Math.abs(amount)).times(resolvedPrice).dividedBy(leverage),
  );
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

/** Input for engine-path orders (limit / market). */
export interface BuildEngineOrderInput {
  client: NadoClient;
  productId: number;
  /** Signed amount in human units: positive = long, negative = short. */
  amount: number;
  price?: number;
  slippagePct?: number;
  orderExecutionType: OrderExecutionType;
  reduceOnly: boolean;
  marginMode?: 'cross' | 'isolated';
  leverage?: number;
}

/**
 * Builds params for a regular engine order (limit or market).
 * Used by `placeOrder` and `cancelAndPlace`.
 */
export async function buildEngineOrder(
  input: BuildEngineOrderInput,
): Promise<BuiltOrderParams> {
  const {
    client,
    productId,
    amount,
    price,
    slippagePct = DEFAULT_SLIPPAGE_PCT,
    orderExecutionType,
    reduceOnly,
    marginMode,
    leverage,
  } = input;

  const isLong = amount > 0;
  const { priceIncrement, sizeIncrement } = await resolveMarketIncrements(
    client,
    productId,
  );
  const { signedAmountX18 } = resolveAmount(amount, sizeIncrement);
  const resolvedPrice = await resolvePrice({
    client,
    productId,
    isLong,
    slippagePct,
    priceIncrement,
    price,
  });

  let isolated: { margin: BigDecimalish } | undefined;
  if (marginMode === 'isolated') {
    if (reduceOnly) {
      isolated = { margin: 0 };
    } else {
      if (leverage == null) {
        throw new Error('leverage is required when marginMode is "isolated".');
      }
      isolated = {
        margin: computeIsolatedMargin(amount, resolvedPrice, leverage),
      };
    }
  }

  const appendix = packOrderAppendix({
    orderExecutionType,
    reduceOnly,
    isolated,
  });

  return {
    productId,
    order: {
      price: resolvedPrice,
      amount: signedAmountX18.toFixed(0),
      expiration: getExpiration(),
      nonce: getOrderNonce(),
      appendix,
    },
  };
}

/** Input for closing a position (always IOC + reduce-only). */
export interface BuildCloseOrderInput {
  client: NadoClient;
  productId: number;
  /** Signed amount: negative to close a long, positive to close a short. */
  amount: number;
  slippagePct?: number;
  marginMode?: 'cross' | 'isolated';
}

/**
 * Builds params for a close-position order.
 * Always IOC + reduce-only; isolated margin uses `margin: 0`.
 */
export async function buildCloseOrder(
  input: BuildCloseOrderInput,
): Promise<BuiltOrderParams> {
  const {
    client,
    productId,
    amount,
    slippagePct = DEFAULT_SLIPPAGE_PCT,
    marginMode,
  } = input;

  const isLong = amount > 0;
  const { priceIncrement, sizeIncrement } = await resolveMarketIncrements(
    client,
    productId,
  );
  const { signedAmountX18 } = resolveAmount(amount, sizeIncrement);
  const resolvedPrice = await resolvePrice({
    client,
    productId,
    isLong,
    slippagePct,
    priceIncrement,
  });
  const isolated = marginMode === 'isolated' ? { margin: 0 } : undefined;

  const appendix = packOrderAppendix({
    orderExecutionType: 'ioc',
    reduceOnly: true,
    isolated,
  });

  return {
    productId,
    order: {
      price: resolvedPrice,
      amount: signedAmountX18.toFixed(0),
      expiration: getExpiration(),
      nonce: getOrderNonce(),
      appendix,
    },
  };
}

/** Input for a price-triggered order (TP/SL). */
export interface BuildPriceTriggerOrderInput {
  client: NadoClient;
  productId: number;
  /** Signed amount in human units: positive = long, negative = short. */
  amount: number;
  /** Limit price. Omit for a stop-market order. */
  price?: number;
  slippagePct?: number;
  reduceOnly: boolean;
  marginMode?: 'cross' | 'isolated';
  leverage?: number;
}

/**
 * Builds params for a price-trigger order (stop-loss / take-profit).
 * Automatically sets `triggerType: 'price'` in the appendix.
 * Stop-market (price omitted) → IOC; stop-limit (price given) → default.
 */
export async function buildPriceTriggerOrder(
  input: BuildPriceTriggerOrderInput,
): Promise<BuiltOrderParams> {
  const {
    client,
    productId,
    amount,
    price,
    slippagePct = DEFAULT_SLIPPAGE_PCT,
    reduceOnly,
    marginMode,
    leverage,
  } = input;

  const isLong = amount > 0;
  const { priceIncrement, sizeIncrement } = await resolveMarketIncrements(
    client,
    productId,
  );
  const { signedAmountX18 } = resolveAmount(amount, sizeIncrement);
  const resolvedPrice = await resolvePrice({
    client,
    productId,
    isLong,
    slippagePct,
    priceIncrement,
    price,
  });

  let isolated: { margin: BigDecimalish } | undefined;
  if (marginMode === 'isolated') {
    if (reduceOnly) {
      isolated = { margin: 0 };
    } else {
      if (leverage == null) {
        throw new Error('leverage is required when marginMode is "isolated".');
      }
      isolated = {
        margin: computeIsolatedMargin(amount, resolvedPrice, leverage),
      };
    }
  }

  const executionType = price == null ? 'ioc' : 'default';

  const appendix = packOrderAppendix({
    orderExecutionType: executionType,
    triggerType: 'price',
    reduceOnly,
    isolated,
  });

  return {
    productId,
    order: {
      price: resolvedPrice,
      amount: signedAmountX18.toFixed(0),
      expiration: getTriggerOrderExpiration(),
      nonce: getOrderNonce(),
      appendix,
    },
  };
}

/**
 * Trigger orders (TP/SL, stop-limit, stop-market) should never expire.
 * The web UI uses Date.now() (milliseconds) as the expiration field; since
 * the engine interprets this value as seconds, the resulting timestamp is
 * effectively infinite (~year 58000).
 */
function getTriggerOrderExpiration(): number {
  return Date.now();
}

/**
 * Computes a TWAP order expiration timestamp in unix seconds.
 * The trigger service validates expiration in seconds (not milliseconds).
 * Adds a 5s buffer so the last sub-order doesn't expire mid-execution.
 */
export function calculateTwapExpiration(
  numOrders: number,
  intervalSeconds: number,
): number {
  const runtimeSeconds = (numOrders - 1) * intervalSeconds;
  return Math.floor(Date.now() / 1000) + runtimeSeconds + 5;
}
