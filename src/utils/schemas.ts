import { CandlestickPeriod } from '@nadohq/client';
import { isAddress, toBytes } from 'viem';
import { z } from 'zod';

export const ProductIdSchema = z
  .number()
  .int()
  .nonnegative()
  .describe('Numeric product ID of the market');

export const ProductIdsSchema = z
  .array(ProductIdSchema)
  .describe('Array of numeric product IDs');

export const SubaccountOwnerSchema = z
  .string()
  .refine(isAddress, 'Must be a valid Ethereum address')
  .describe('Wallet address that owns the subaccount');

export const OptionalSubaccountOwnerSchema = z
  .string()
  .refine((v) => v === '' || isAddress(v), 'Must be a valid Ethereum address')
  .optional()
  .describe(
    'Wallet address that owns the subaccount. Omit to use the configured wallet.',
  );

const MAX_SUBACCOUNT_NAME_BYTES = 12;

export const SubaccountNameSchema = z
  .string()
  .default('default')
  .refine(
    (v) => toBytes(v).length <= MAX_SUBACCOUNT_NAME_BYTES,
    `Subaccount name must be at most ${MAX_SUBACCOUNT_NAME_BYTES} bytes`,
  )
  .describe('Subaccount name (max 12 bytes, defaults to "default")');

export const OptionalSubaccountNameSchema = z
  .string()
  .default('default')
  .refine(
    (v) => toBytes(v).length <= MAX_SUBACCOUNT_NAME_BYTES,
    `Subaccount name must be at most ${MAX_SUBACCOUNT_NAME_BYTES} bytes`,
  )
  .optional()
  .describe('Subaccount name (max 12 bytes, defaults to "default")');

export const BalanceSideSchema = z
  .enum(['long', 'short'])
  .describe('Order side: long (buy) or short (sell)');

export type BalanceSide = z.infer<typeof BalanceSideSchema>;

export const CandlestickPeriodSchema = z
  .enum(CandlestickPeriod)
  .describe(
    'Candlestick period in seconds (60=1m, 300=5m, 900=15m, 3600=1h, 7200=2h, 14400=4h, 86400=1d, 604800=1w, 2419200=1M)',
  );

export const PaginationLimitSchema = z
  .number()
  .int()
  .positive()
  .default(100)
  .describe('Maximum number of results to return (1-500, default 100)');

export const MarginModeSchema = z
  .enum(['cross', 'isolated'])
  .default('cross')
  .describe('Margin mode: cross (default) or isolated');

export type MarginMode = z.infer<typeof MarginModeSchema>;

export const TimeInForceSchema = z
  .enum(['default', 'ioc', 'fok', 'post_only'])
  .default('default')
  .describe(
    'Time in force: default (good-til-cancel, default), ioc (immediate-or-cancel), fok (fill-or-kill), post_only',
  );

export type TimeInForce = z.infer<typeof TimeInForceSchema>;

export const SAFETY_DISCLAIMER =
  'SAFETY: You MUST present an execution summary and receive explicit user confirmation BEFORE calling this tool. Never call in the same turn as the summary.';
