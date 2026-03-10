import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { NadoClient } from '@nadohq/client';
import type { IndexerMatchEvent } from '@nadohq/indexer-client';
import { z } from 'zod';

import type { NadoContext } from '../../context.js';
import { handleToolRequest } from '../../utils/handleToolRequest.js';
import { getMarkets } from '../../utils/resolveMarket.js';
import {
  SubaccountNameSchema,
  SubaccountOwnerSchema,
} from '../../utils/schemas.js';

const PAGE_SIZE = 500;
const MAX_PAGES = 40;
const SECONDS_PER_DAY = 86_400;

interface MarketStats {
  symbol: string;
  productId: number;
  volume: number;
  trades: number;
  realizedPnl: number;
  fees: number;
}

interface AccountStats {
  period: { days: number; from: string; to: string };
  volume: { total: number; maker: number; taker: number };
  trades: { total: number; maker: number; taker: number };
  fees: number;
  realizedPnl: number;
  averageTradeSize: number;
  marketsTraded: number;
  byMarket: MarketStats[];
  byDay: Array<{ date: string; volume: number; trades: number; pnl: number }>;
}

async function fetchAllEvents(
  client: NadoClient,
  subaccountOwner: string,
  subaccountName: string,
  minTimestamp: number,
  productIds?: number[],
): Promise<IndexerMatchEvent[]> {
  const allEvents: IndexerMatchEvent[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const response =
      await client.context.indexerClient.getPaginatedSubaccountMatchEvents({
        subaccountOwner,
        subaccountName,
        productIds,
        limit: PAGE_SIZE,
        startCursor: cursor,
      });

    const events = response.events;
    if (events.length === 0) break;

    const oldest = Number(events[events.length - 1].timestamp);
    allEvents.push(...events);

    if (oldest <= minTimestamp) break;
    if (!response.meta.hasMore || !response.meta.nextCursor) break;
    cursor = response.meta.nextCursor;
  }

  return allEvents.filter((e) => Number(e.timestamp) >= minTimestamp);
}

function computeStats(
  events: IndexerMatchEvent[],
  days: number,
  symbolMap: Map<number, string>,
): AccountStats {
  const now = Math.floor(Date.now() / 1000);
  const cutoff = now - days * SECONDS_PER_DAY;

  const marketAgg = new Map<
    number,
    { volume: number; trades: number; pnl: number; fees: number }
  >();
  const dayAgg = new Map<
    string,
    { volume: number; trades: number; pnl: number }
  >();

  let totalVolume = 0;
  let makerVolume = 0;
  let takerVolume = 0;
  let totalTrades = 0;
  let makerTrades = 0;
  let takerTrades = 0;
  let totalFees = 0;
  let totalPnl = 0;

  for (const event of events) {
    const ts = Number(event.timestamp);
    if (ts < cutoff) continue;

    const quote = Math.abs(Number(event.quoteFilled)) / 1e18;
    const fee = Number(event.totalFee) / 1e18;
    const pnl = Number(event.realizedPnl ?? 0) / 1e18;
    const isTaker = event.isTaker ?? true;
    const pid = event.productId;

    totalVolume += quote;
    totalFees += fee;
    totalPnl += pnl;
    totalTrades += 1;

    if (isTaker) {
      takerVolume += quote;
      takerTrades += 1;
    } else {
      makerVolume += quote;
      makerTrades += 1;
    }

    const m = marketAgg.get(pid) ?? { volume: 0, trades: 0, pnl: 0, fees: 0 };
    m.volume += quote;
    m.trades += 1;
    m.pnl += pnl;
    m.fees += fee;
    marketAgg.set(pid, m);

    const date = new Date(ts * 1000).toISOString().slice(0, 10);
    const d = dayAgg.get(date) ?? { volume: 0, trades: 0, pnl: 0 };
    d.volume += quote;
    d.trades += 1;
    d.pnl += pnl;
    dayAgg.set(date, d);
  }

  const byMarket: MarketStats[] = [...marketAgg.entries()]
    .sort((a, b) => b[1].volume - a[1].volume)
    .map(([pid, m]) => ({
      symbol: symbolMap.get(pid) ?? `product-${pid}`,
      productId: pid,
      volume: round(m.volume),
      trades: m.trades,
      realizedPnl: round(m.pnl),
      fees: round(m.fees),
    }));

  const byDay = [...dayAgg.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, d]) => ({
      date,
      volume: round(d.volume),
      trades: d.trades,
      pnl: round(d.pnl),
    }));

  return {
    period: {
      days,
      from: new Date(cutoff * 1000).toISOString().slice(0, 10),
      to: new Date(now * 1000).toISOString().slice(0, 10),
    },
    volume: {
      total: round(totalVolume),
      maker: round(makerVolume),
      taker: round(takerVolume),
    },
    trades: { total: totalTrades, maker: makerTrades, taker: takerTrades },
    fees: round(totalFees),
    realizedPnl: round(totalPnl),
    averageTradeSize: totalTrades > 0 ? round(totalVolume / totalTrades) : 0,
    marketsTraded: marketAgg.size,
    byMarket,
    byDay,
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export function registerGetAccountStats(
  server: McpServer,
  ctx: NadoContext,
): void {
  server.registerTool(
    'get_account_stats',
    {
      title: 'Get Account Stats',
      description:
        'Get pre-computed trading statistics for a subaccount over a time period: total volume, trade count, fees paid, realized PnL, per-market breakdown, daily breakdown, and maker/taker split. This is the fastest way to answer questions about trading history, 30-day volume, PnL, or performance. Handles all pagination internally.',
      inputSchema: {
        subaccountOwner: SubaccountOwnerSchema,
        subaccountName: SubaccountNameSchema,
        days: z
          .number()
          .int()
          .positive()
          .default(30)
          .describe(
            'Number of days to look back (default 30). Use 1 for 24h stats, 7 for weekly, 30 for monthly.',
          ),
        productIds: z
          .array(z.number().int().nonnegative())
          .optional()
          .describe('Filter by product IDs (omit for all products)'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({
      subaccountOwner,
      subaccountName,
      days,
      productIds,
    }: {
      subaccountOwner: string;
      subaccountName: string;
      days: number;
      productIds?: number[];
    }) =>
      handleToolRequest(
        'get_account_stats',
        `Failed to fetch account stats for ${subaccountOwner}/${subaccountName}.`,
        async () => {
          const minTimestamp =
            Math.floor(Date.now() / 1000) - days * SECONDS_PER_DAY;

          const [events, markets] = await Promise.all([
            fetchAllEvents(
              ctx.client,
              subaccountOwner,
              subaccountName,
              minTimestamp,
              productIds,
            ),
            getMarkets(ctx.dataEnv, ctx.chainEnv).catch(() => []),
          ]);

          const symbolMap = new Map(
            markets.map((m) => [m.productId, m.symbol]),
          );

          return computeStats(events, days, symbolMap);
        },
      ),
  );
}
