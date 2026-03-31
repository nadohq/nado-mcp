import type { NadoClient, OrderExecutionType } from '@nadohq/client';
import {
  BigNumbers,
  addDecimals,
  getOrderNonce,
  packOrderAppendix,
  removeDecimals,
  toBigNumber,
} from '@nadohq/client';
import BigNumber from 'bignumber.js';

export const DEFAULT_SLIPPAGE_PCT = 2;

const NADO_PRODUCT_DECIMALS = 18;

/**
 * The SDK returns `removeDecimals(MAX_I128)` as the ask price when the
 * book's ask side is empty. The trade app treats this as "no ask available"
 * via its `safeAsk` helper; we replicate that guard here.
 */
const MAX_EMPTY_ASK_PRICE = removeDecimals(BigNumbers.MAX_I128) as BigNumber;

/**
 * Returns an effectively-infinite expiration for engine orders.
 *
 * The engine interprets this field as a unix timestamp **in seconds**.
 * The trade app passes `Date.now()` (milliseconds) which, when read as
 * seconds, lands around year 58 000 — i.e. the order never expires.
 * We replicate that convention here.
 */
function getEngineOrderExpiration(): number {
  return Date.now();
}

export function roundToIncrement(
  value: BigNumber,
  increment: BigNumber,
  roundingMode?: BigNumber.RoundingMode,
): BigNumber {
  if (increment.isZero()) return value;
  return value.dividedBy(increment).integerValue(roundingMode).times(increment);
}

export function toMutationPriceString(
  price: BigNumber,
  priceIncrement: BigNumber,
): string {
  const rounded = roundToIncrement(price, priceIncrement);
  return rounded.toFixed(NADO_PRODUCT_DECIMALS, BigNumber.ROUND_DOWN);
}

function toMutationAmountString(
  amount: BigNumber,
  sizeIncrement: BigNumber,
): string {
  const rounded = roundToIncrement(amount, sizeIncrement, BigNumber.ROUND_DOWN);
  return rounded.toFixed(0, BigNumber.ROUND_DOWN);
}

export interface BuiltOrderParams {
  productId: number;
  order: {
    price: string;
    amount: string;
    expiration: number;
    nonce: string;
    appendix: bigint;
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

export interface MarketData {
  priceIncrement: BigNumber;
  sizeIncrement: BigNumber;
  maxLeverage: number;
  oraclePrice: BigNumber;
}

let allMarketsCache:
  | Awaited<ReturnType<NadoClient['market']['getAllMarkets']>>
  | undefined;

/** @internal Exposed for testing only. */
export function _resetMarketDataCache(): void {
  allMarketsCache = undefined;
}

export async function resolveMarketData(
  client: NadoClient,
  productId: number,
): Promise<MarketData> {
  if (!allMarketsCache) {
    allMarketsCache = await client.market.getAllMarkets();
  }
  const market = allMarketsCache.find((m) => m.productId === productId);
  if (!market) {
    throw new Error(
      `Unknown product ${productId}. Use get_all_markets to find valid product IDs.`,
    );
  }
  const maxLeverage = Math.round(
    1 / (1 - market.product.longWeightInitial.toNumber()),
  );
  return {
    priceIncrement: market.priceIncrement,
    sizeIncrement: market.sizeIncrement,
    maxLeverage,
    oraclePrice: market.product.oraclePrice,
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
    addDecimals(toBigNumber(Math.abs(amount))),
    sizeIncrement,
    BigNumber.ROUND_DOWN,
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

/**
 * Resolves the limit price for an order. When no explicit price is given
 * (market order), applies slippage to the top-of-book price on the **same
 * side** so that the bid-ask spread is included in the slippage budget,
 * matching the trade-app behaviour.
 */
async function resolvePrice({
  client,
  productId,
  isLong,
  slippagePct,
  priceIncrement,
  price,
}: ResolvePriceInput): Promise<string> {
  if (price != null) {
    return toMutationPriceString(toBigNumber(price), priceIncrement);
  }

  const marketPrice = await client.market.getLatestMarketPrice({ productId });
  const slippageFrac = slippagePct / 100;

  if (isLong) {
    const bidPrice = marketPrice.bid;
    if (bidPrice.lte(0)) {
      throw new Error(
        `No bid price available for product ${productId}. Cannot place market buy order.`,
      );
    }
    return toMutationPriceString(
      bidPrice.times(1 + slippageFrac),
      priceIncrement,
    );
  }

  const askPrice = marketPrice.ask;
  if (askPrice.lte(0) || askPrice.gte(MAX_EMPTY_ASK_PRICE)) {
    throw new Error(
      `No ask price available for product ${productId}. Cannot place market sell order.`,
    );
  }
  return toMutationPriceString(
    askPrice.times(1 - slippageFrac),
    priceIncrement,
  );
}

interface ComputeIsolatedMarginInput {
  signedAmountX18: BigNumber;
  orderPrice: string;
  leverage: number;
  maxLeverage: number;
  oraclePrice: BigNumber;
  isMarketOrder: boolean;
}

/**
 * Calculates the required margin for an isolated-margin order, matching
 * the trade app's `calcIsoOrderRequiredMargin`.
 */
function computeIsolatedMargin({
  signedAmountX18,
  orderPrice,
  leverage: userLeverage,
  maxLeverage,
  oraclePrice,
  isMarketOrder,
}: ComputeIsolatedMarginInput): BigNumber {
  const leverage = Math.min(userLeverage, maxLeverage - 0.2);

  const marginWithoutInitialPnl = signedAmountX18
    .multipliedBy(orderPrice)
    .dividedBy(leverage)
    .abs();

  if (!isMarketOrder) {
    return marginWithoutInitialPnl;
  }

  const weight = signedAmountX18.isPositive()
    ? 1 - 1 / leverage
    : 1 + 1 / leverage;

  const takerMarginAdjustment = signedAmountX18
    .negated()
    .multipliedBy(oraclePrice.minus(orderPrice))
    .multipliedBy(weight);

  return marginWithoutInitialPnl.plus(BigNumber.max(takerMarginAdjustment, 0));
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
  const marketData = await resolveMarketData(client, productId);
  const { priceIncrement, sizeIncrement } = marketData;
  const { signedAmountX18 } = resolveAmount(amount, sizeIncrement);
  const resolvedPrice = await resolvePrice({
    client,
    productId,
    isLong,
    slippagePct,
    priceIncrement,
    price,
  });

  let isolated: { margin: string | number } | undefined;
  if (marginMode === 'isolated') {
    if (reduceOnly) {
      isolated = { margin: 0 };
    } else {
      if (leverage == null) {
        throw new Error('leverage is required when marginMode is "isolated".');
      }
      isolated = {
        margin: computeIsolatedMargin({
          signedAmountX18,
          orderPrice: resolvedPrice,
          leverage,
          maxLeverage: marketData.maxLeverage,
          oraclePrice: marketData.oraclePrice,
          isMarketOrder: price == null,
        }).toFixed(0, BigNumber.ROUND_DOWN),
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
      amount: toMutationAmountString(signedAmountX18, sizeIncrement),
      expiration: getEngineOrderExpiration(),
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
  const { priceIncrement, sizeIncrement } = await resolveMarketData(
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
      amount: toMutationAmountString(signedAmountX18, sizeIncrement),
      expiration: getEngineOrderExpiration(),
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
  const marketData = await resolveMarketData(client, productId);
  const { priceIncrement, sizeIncrement } = marketData;
  const { signedAmountX18 } = resolveAmount(amount, sizeIncrement);
  const resolvedPrice = await resolvePrice({
    client,
    productId,
    isLong,
    slippagePct,
    priceIncrement,
    price,
  });

  let isolated: { margin: string | number } | undefined;
  if (marginMode === 'isolated') {
    if (reduceOnly) {
      isolated = { margin: 0 };
    } else {
      if (leverage == null) {
        throw new Error('leverage is required when marginMode is "isolated".');
      }
      isolated = {
        margin: computeIsolatedMargin({
          signedAmountX18,
          orderPrice: resolvedPrice,
          leverage,
          maxLeverage: marketData.maxLeverage,
          oraclePrice: marketData.oraclePrice,
          isMarketOrder: price == null,
        }).toFixed(0, BigNumber.ROUND_DOWN),
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
      amount: toMutationAmountString(signedAmountX18, sizeIncrement),
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
