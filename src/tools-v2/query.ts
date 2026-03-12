/**
 * nado_query — Generic SDK read tool
 *
 * Calls any SDK read method by name with params. Replaces all 32+ individual
 * read tools with a single dynamic dispatcher.
 *
 * The LLM discovers available methods via nado_discover, then calls this tool
 * with the method path and parameters.
 *
 * Security: Only read methods are exposed. Write methods are handled by
 * dedicated thin-wrapper tools with explicit schemas.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { NadoClient } from '@nadohq/client';
import { z } from 'zod';

import type { NadoContext } from '../context.js';

/**
 * Registry mapping method paths → actual SDK call functions.
 *
 * This is the core of the progressive disclosure pattern. Each entry maps
 * a human-readable method path to a function that calls the SDK.
 *
 * We use explicit mapping rather than dynamic reflection because:
 * 1. TypeScript doesn't have runtime reflection
 * 2. We can control parameter translation (camelCase ↔ snake_case)
 * 3. We can add context-specific defaults (subaccount owner/name)
 * 4. We prevent accidental exposure of write methods
 */
type QueryHandler = (
  client: NadoClient,
  ctx: NadoContext,
  params: Record<string, unknown>,
) => Promise<unknown>;

function subaccountDefaults(
  ctx: NadoContext,
  params: Record<string, unknown>,
): { subaccountOwner: string; subaccountName: string } {
  return {
    subaccountOwner:
      (params.subaccountOwner as string) ?? ctx.subaccountOwner ?? '',
    subaccountName:
      (params.subaccountName as string) ?? ctx.subaccountName ?? 'default',
  };
}

const QUERY_HANDLERS: Record<string, QueryHandler> = {
  // ── Market ───────────────────────────────────────────────────────
  'market.getAllMarkets': async (client) => client.market.getAllMarkets(),

  'market.getLatestMarketPrice': async (client, _ctx, params) =>
    client.market.getLatestMarketPrice({
      productId: params.productId as number,
    }),

  'market.getLatestMarketPrices': async (client, _ctx, params) =>
    client.market.getLatestMarketPrices({
      productIds: params.productIds as number[],
    }),

  'market.getMarketLiquidity': async (client, _ctx, params) =>
    client.market.getMarketLiquidity({
      productId: params.productId as number,
      depth: (params.depth as number) ?? 10,
    }),

  'market.getCandlesticks': async (client, _ctx, params) =>
    client.market.getCandlesticks({
      productId: params.productId as number,
      period: params.period as string,
      maxTimeInclusive: params.maxTimeInclusive as number | undefined,
      limit: params.limit as number | undefined,
    }),

  'market.getFundingRate': async (client, _ctx, params) =>
    client.market.getFundingRate({
      productId: params.productId as number,
    }),

  'market.getMultiProductFundingRates': async (client, _ctx, params) =>
    client.market.getMultiProductFundingRates({
      productIds: params.productIds as number[],
    }),

  'market.getMaxOrderSize': async (client, ctx, params) => {
    const sub = subaccountDefaults(ctx, params);
    return client.market.getMaxOrderSize({
      productId: params.productId as number,
      price: params.price as string,
      side: params.side as 'long' | 'short',
      ...sub,
      spotLeverage: params.spotLeverage as boolean | undefined,
      reduceOnly: params.reduceOnly as boolean | undefined,
      isolated: params.isolated as boolean | undefined,
    });
  },

  'market.getOpenSubaccountOrders': async (client, ctx, params) => {
    const sub = subaccountDefaults(ctx, params);
    return client.market.getOpenSubaccountOrders({
      productId: params.productId as number,
      ...sub,
    });
  },

  'market.getOpenSubaccountMultiProductOrders': async (
    client,
    ctx,
    params,
  ) => {
    const sub = subaccountDefaults(ctx, params);
    return client.market.getOpenSubaccountMultiProductOrders({
      productIds: params.productIds as number[],
      ...sub,
    });
  },

  'market.getTriggerOrders': async (client, ctx, params) => {
    const sub = subaccountDefaults(ctx, params);
    return client.market.getTriggerOrders({
      ...sub,
      productIds: params.productIds as number[] | undefined,
      statusTypes: params.statusTypes as string[] | undefined,
      triggerTypes: params.triggerTypes as string[] | undefined,
    });
  },

  'market.getHistoricalOrders': async (client, ctx, params) => {
    const sub = subaccountDefaults(ctx, params);
    return client.market.getHistoricalOrders({
      subaccounts: params.subaccounts
        ? (params.subaccounts as Array<{
            subaccountOwner: string;
            subaccountName: string;
          }>)
        : [sub],
      productIds: params.productIds as number[] | undefined,
      limit: params.limit as number | undefined,
      maxTimestampInclusive: params.maxTimestampInclusive as
        | number
        | undefined,
    });
  },

  'market.getProductSnapshots': async (client, _ctx, params) =>
    client.market.getProductSnapshots({
      productId: params.productId as number,
      maxTimestampInclusive: params.maxTimestampInclusive as
        | number
        | undefined,
      limit: params.limit as number | undefined,
    }),

  'market.getMarketSnapshots': async (client, _ctx, params) =>
    client.market.getMarketSnapshots(
      params as Parameters<typeof client.market.getMarketSnapshots>[0],
    ),

  // ── Subaccount ───────────────────────────────────────────────────
  'subaccount.getSubaccountSummary': async (client, ctx, params) => {
    const sub = subaccountDefaults(ctx, params);
    return client.subaccount.getSubaccountSummary(sub);
  },

  'subaccount.getIsolatedPositions': async (client, ctx, params) => {
    const sub = subaccountDefaults(ctx, params);
    return client.subaccount.getIsolatedPositions(sub);
  },

  'subaccount.getEngineEstimatedSubaccountSummary': async (
    client,
    ctx,
    params,
  ) => {
    const sub = subaccountDefaults(ctx, params);
    return client.subaccount.getEngineEstimatedSubaccountSummary({
      ...sub,
      txs: params.txs as Array<{
        type: 'apply_delta';
        tx: {
          productId: number;
          amountDelta: string;
          vQuoteDelta: string;
        };
      }>,
      preState: params.preState as boolean | undefined,
    });
  },

  'subaccount.getSubaccountFeeRates': async (client, ctx, params) => {
    const sub = subaccountDefaults(ctx, params);
    return client.subaccount.getSubaccountFeeRates(sub);
  },

  // ── Spot ─────────────────────────────────────────────────────────
  'spot.getMaxWithdrawable': async (client, ctx, params) => {
    const sub = subaccountDefaults(ctx, params);
    return client.spot.getMaxWithdrawable({
      productId: params.productId as number,
      ...sub,
      spotLeverage: params.spotLeverage as boolean | undefined,
    });
  },

  'spot.getMaxMintNlpAmount': async (client, ctx, params) => {
    const sub = subaccountDefaults(ctx, params);
    return client.spot.getMaxMintNlpAmount({
      ...sub,
      spotLeverage: params.spotLeverage as boolean | undefined,
    });
  },

  // ── Perp ─────────────────────────────────────────────────────────
  'perp.getPerpPrices': async (client, _ctx, params) =>
    client.perp.getPerpPrices({ productId: params.productId as number }),

  'perp.getMultiProductPerpPrices': async (client, _ctx, params) =>
    client.perp.getMultiProductPerpPrices({
      productIds: params.productIds as number[],
    }),

  // ── Engine (direct) ──────────────────────────────────────────────
  'engine.getSymbols': async (client, _ctx, params) =>
    client.context.engineClient.getSymbols({
      productType: params.productType as string | undefined,
      productIds: params.productIds as number[] | undefined,
    }),

  'engine.getStatus': async (client) =>
    client.context.engineClient.getStatus(),

  'engine.getContracts': async (client) =>
    client.context.engineClient.getContracts(),

  'engine.getHealthGroups': async (client) =>
    client.context.engineClient.getHealthGroups(),

  'engine.getOrder': async (client, _ctx, params) =>
    client.context.engineClient.getOrder({
      productId: params.productId as number,
      digest: params.digest as string,
    }),

  'engine.getLinkedSigner': async (client, ctx, params) => {
    const sub = subaccountDefaults(ctx, params);
    return client.context.engineClient.getLinkedSigner(sub);
  },

  'engine.getInsurance': async (client) =>
    client.context.engineClient.getInsurance(),

  'engine.getNlpLockedBalances': async (client, ctx, params) => {
    const sub = subaccountDefaults(ctx, params);
    return client.context.engineClient.getNlpLockedBalances(sub);
  },

  'engine.getNlpPoolInfo': async (client) =>
    client.context.engineClient.getNlpPoolInfo(),

  'engine.getMaxBurnNlpAmount': async (client, ctx, params) => {
    const sub = subaccountDefaults(ctx, params);
    return client.context.engineClient.getMaxBurnNlpAmount(sub);
  },

  // ── Indexer (direct) ─────────────────────────────────────────────
  'indexer.listSubaccounts': async (client, _ctx, params) =>
    client.context.indexerClient.listSubaccounts({
      address: params.address as string,
    }),

  'indexer.getOraclePrices': async (client, _ctx, params) =>
    client.context.indexerClient.getOraclePrices({
      productIds: params.productIds as number[],
    }),

  'indexer.getMatchEvents': async (client, ctx, params) => {
    const sub = subaccountDefaults(ctx, params);
    return client.context.indexerClient.getMatchEvents({
      subaccounts: params.subaccounts
        ? (params.subaccounts as Array<{
            subaccountOwner: string;
            subaccountName: string;
          }>)
        : [sub],
      productIds: params.productIds as number[] | undefined,
      limit: params.limit as number | undefined,
      maxTimestampInclusive: params.maxTimestampInclusive as
        | number
        | undefined,
    });
  },

  'indexer.getInterestFundingPayments': async (client, ctx, params) => {
    const sub = subaccountDefaults(ctx, params);
    return client.context.indexerClient.getInterestFundingPayments({
      subaccount: sub,
      productIds: params.productIds as number[] | undefined,
      limit: params.limit as number | undefined,
      maxTimestampInclusive: params.maxTimestampInclusive as
        | number
        | undefined,
    });
  },

  'indexer.getMultiSubaccountSnapshots': async (client, ctx, params) => {
    const sub = subaccountDefaults(ctx, params);
    return client.context.indexerClient.getMultiSubaccountSnapshots({
      subaccounts: params.subaccounts
        ? (params.subaccounts as Array<{
            subaccountOwner: string;
            subaccountName: string;
          }>)
        : [sub],
      timestamps: params.timestamps as number[],
    });
  },

  'indexer.getLeaderboard': async (client, _ctx, params) =>
    client.context.indexerClient.getLeaderboard({
      contestId: params.contestId as number,
      rankType: params.rankType as 'pnl' | 'roi',
      limit: params.limit as number | undefined,
      startCursor: params.startCursor as number | undefined,
    }),

  'indexer.getQuotePrice': async (client) =>
    client.context.indexerClient.getQuotePrice(),

  'indexer.getV2Tickers': async (client, _ctx, params) =>
    client.context.indexerClient.getV2Tickers({
      market: params.market as string | undefined,
    }),

  'indexer.getSequencerBacklog': async (client) =>
    client.context.indexerClient.getSequencerBacklog(),

  'indexer.getNlpSnapshots': async (client, _ctx, params) =>
    client.context.indexerClient.getNlpSnapshots({
      limit: (params.limit as number) ?? 100,
      maxTimeInclusive: params.maxTimeInclusive as number | undefined,
      granularity: (params.granularity as number) ?? 86400,
    }),

  'indexer.getPoints': async (client, _ctx, params) =>
    client.context.indexerClient.getPoints({
      address: params.address as string,
    }),
};

/**
 * Custom replacer for JSON.stringify that handles BigInt and BigNumber.
 */
function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  // BigNumber instances from bignumber.js
  if (value && typeof value === 'object' && 's' in value && 'e' in value && 'c' in value) {
    return (value as { toString(): string }).toString();
  }
  return value;
}

export function registerQueryTool(server: McpServer, ctx: NadoContext): void {
  server.registerTool(
    'nado_query',
    {
      title: 'Query Nado SDK',
      description:
        'Execute any Nado SDK read method. Use nado_discover first to see available methods. ' +
        'Pass the method path (e.g. "market.getLatestMarketPrice") and its params. ' +
        'Subaccount owner/name default to the configured account if not provided.',
      inputSchema: {
        method: z
          .string()
          .describe(
            'SDK method path, e.g. "market.getLatestMarketPrice", "engine.getSymbols"',
          ),
        params: z
          .record(z.unknown())
          .default({})
          .describe('Method parameters as a JSON object'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({
      method,
      params,
    }: {
      method: string;
      params: Record<string, unknown>;
    }) => {
      const handler = QUERY_HANDLERS[method];
      if (!handler) {
        const available = Object.keys(QUERY_HANDLERS).sort().join('\n  ');
        throw new Error(
          `Unknown method "${method}". Available methods:\n  ${available}`,
        );
      }

      try {
        const result = await handler(ctx.client, ctx, params);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result, jsonReplacer, 2),
            },
          ],
        };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : JSON.stringify(err);
        throw new Error(`nado_query("${method}") failed: ${message}`);
      }
    },
  );
}
