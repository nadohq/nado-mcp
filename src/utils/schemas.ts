import { ALL_CHAIN_ENVS } from '@nadohq/client';
import { z } from 'zod';

export const ChainEnvSchema = z.enum(ALL_CHAIN_ENVS);

export const ProductIdSchema = z
  .number()
  .int()
  .nonnegative()
  .describe('Numeric product ID of the market');

export const ProductIdsSchema = z
  .array(ProductIdSchema)
  // Why must we validate that it is non-empty?
  .min(1)
  .describe('Array of numeric product IDs');

// FRANK: `isAddress`
export const SubaccountOwnerSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'Must be a valid 20-byte hex address')
  .describe('Wallet address that owns the subaccount');

export const SubaccountNameSchema = z
  .string()
  .max(12)
  .default('default')
  // FRANK: hmm is 12 characters == 12 bytes
  .describe('Subaccount name (max 12 bytes, defaults to "default")');

export const BalanceSideSchema = z
  .enum(['long', 'short'])
  .describe('Order side: long (buy) or short (sell)');

export const CandlestickPeriodSchema = z
  .number()
  .int()
  .refine(
    // FRANK: can us `CandlestickPeriod` values
    (v) =>
      [60, 300, 900, 3600, 7200, 14400, 86400, 604800, 2419200].includes(v),
    {
      message:
        'Must be a valid period in seconds: 60, 300, 900, 3600, 7200, 14400, 86400, 604800, 2419200',
    },
  )
  .describe(
    'Candlestick period in seconds (60=1m, 300=5m, 900=15m, 3600=1h, 7200=2h, 14400=4h, 86400=1d, 604800=1w, 2419200=1M)',
  );

export const PaginationLimitSchema = z
  .number()
  .int()
  .positive()
  // FRANK: Is this a hard limit?
  .max(500)
  // FRANK: afaik backend sets a default
  .default(100)
  .describe('Maximum number of results to return (1-500, default 100)');
