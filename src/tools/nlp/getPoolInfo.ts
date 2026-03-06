import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { NadoClient, NlpPool, ProductEngineType } from '@nadohq/client';
import { removeDecimals, subaccountFromHex } from '@nadohq/client';
import BigNumber from 'bignumber.js';

import { asyncResult } from '../../utils/asyncResult.js';

interface AggregatedPosition {
  symbol: string;
  productId: number;
  type: 'spot' | 'perp';
  side: 'long' | 'short';
  size: string;
  oraclePrice: string;
  notionalValue: string;
  entryPrice?: string;
  estimatedPnl?: string;
  netFunding?: string;
}

interface AggregatedOrder {
  symbol: string;
  productId: number;
  side: 'bid' | 'ask';
  price: string;
  amount: string;
  poolId: number;
}

interface PoolSummary {
  poolId: number;
  balanceWeight: string;
  health: { initial: string; maintenance: string; unweighted: string };
}

interface TrackedVars {
  netEntryUnrealized: BigNumber;
  netFundingUnrealized: BigNumber;
}

interface AggregatedProduct {
  amount: BigNumber;
  vQuote: BigNumber;
  oraclePrice: BigNumber;
  isPerp: boolean;
  trackedVars: TrackedVars;
}

function aggregatePositions(
  pools: NlpPool[],
  symbolMap: Map<number, string>,
  snapshotsByPoolId: Map<
    number,
    Map<
      number,
      { netEntryUnrealized: BigNumber; netFundingUnrealized: BigNumber }
    >
  >,
): AggregatedPosition[] {
  const byProduct = new Map<number, AggregatedProduct>();

  for (const pool of pools) {
    for (const b of pool.subaccountInfo.balances) {
      const existing = byProduct.get(b.productId);
      const amount = new BigNumber(b.amount.toString());
      const oraclePrice = new BigNumber(b.oraclePrice.toString());
      const isPerp = b.type === (1 as unknown as typeof ProductEngineType.PERP);
      const vQuote =
        'vQuoteBalance' in b
          ? new BigNumber(b.vQuoteBalance.toString())
          : new BigNumber(0);

      const poolSnapshot = snapshotsByPoolId.get(pool.poolId);
      const balSnapshot = poolSnapshot?.get(b.productId);
      const netEntry = balSnapshot?.netEntryUnrealized ?? new BigNumber(0);
      const netFunding = balSnapshot?.netFundingUnrealized ?? new BigNumber(0);

      if (existing) {
        existing.amount = existing.amount.plus(amount);
        existing.vQuote = existing.vQuote.plus(vQuote);
        existing.trackedVars.netEntryUnrealized =
          existing.trackedVars.netEntryUnrealized.plus(netEntry);
        existing.trackedVars.netFundingUnrealized =
          existing.trackedVars.netFundingUnrealized.plus(netFunding);
      } else {
        byProduct.set(b.productId, {
          amount,
          vQuote,
          oraclePrice,
          isPerp,
          trackedVars: {
            netEntryUnrealized: netEntry,
            netFundingUnrealized: netFunding,
          },
        });
      }
    }
  }

  const positions: AggregatedPosition[] = [];
  for (const [productId, data] of byProduct) {
    if (data.amount.isZero()) continue;

    const symbol = symbolMap.get(productId) ?? `product-${productId}`;
    const size = removeDecimals(data.amount);
    const sizeAbs = size.abs();
    const notional = sizeAbs.times(data.oraclePrice);

    const position: AggregatedPosition = {
      symbol,
      productId,
      type: data.isPerp ? 'perp' : 'spot',
      side: data.amount.isPositive() ? 'long' : 'short',
      size: sizeAbs.toFixed(),
      oraclePrice: data.oraclePrice.toFixed(),
      notionalValue: notional.toFixed(2),
    };

    if (data.isPerp && !data.trackedVars.netEntryUnrealized.isZero()) {
      const entryPrice = data.trackedVars.netEntryUnrealized
        .dividedBy(data.amount)
        .abs();
      position.entryPrice = entryPrice.toFixed();

      const exitPrice = data.oraclePrice;
      const pnl = removeDecimals(
        data.amount.times(exitPrice).minus(data.trackedVars.netEntryUnrealized),
      );
      position.estimatedPnl = pnl.toFixed(2);
    }

    if (data.isPerp && !data.trackedVars.netFundingUnrealized.isZero()) {
      position.netFunding = removeDecimals(
        data.trackedVars.netFundingUnrealized,
      ).toFixed(2);
    }

    positions.push(position);
  }

  positions.sort(
    (a, b) => parseFloat(b.notionalValue) - parseFloat(a.notionalValue),
  );
  return positions;
}

function aggregateOrders(
  pools: NlpPool[],
  symbolMap: Map<number, string>,
): AggregatedOrder[] {
  const orders: AggregatedOrder[] = [];
  for (const pool of pools) {
    for (const o of pool.openOrders) {
      const totalAmount = new BigNumber(o.totalAmount.toString());
      orders.push({
        symbol: symbolMap.get(o.productId) ?? `product-${o.productId}`,
        productId: o.productId,
        side: totalAmount.isPositive() ? 'bid' : 'ask',
        price: new BigNumber(o.price.toString()).toFixed(),
        amount: removeDecimals(totalAmount).abs().toFixed(),
        poolId: pool.poolId,
      });
    }
  }
  return orders;
}

function summarizePool(pool: NlpPool): PoolSummary {
  return {
    poolId: pool.poolId,
    balanceWeight: new BigNumber(pool.balanceWeight.toString()).toFixed(),
    health: {
      initial: new BigNumber(
        pool.subaccountInfo.health.initial.health.toString(),
      ).toFixed(2),
      maintenance: new BigNumber(
        pool.subaccountInfo.health.maintenance.health.toString(),
      ).toFixed(2),
      unweighted: new BigNumber(
        pool.subaccountInfo.health.unweighted.health.toString(),
      ).toFixed(2),
    },
  };
}

export function registerGetNlpPoolInfo(
  server: McpServer,
  client: NadoClient,
): void {
  server.registerTool(
    'get_nlp_pool_info',
    {
      title: 'Get NLP Vault State',
      description:
        'Get the current state of the NLP vault: all sub-pools with their balance weights, positions, open orders, PnL, and margin health. No input needed -- returns the full vault-level view. Positions are aggregated across all sub-pools into one unified view. Use this to analyze vault risk, current exposure, and pool composition. For historical vault trends, use get_nlp_snapshots instead.',
      annotations: { readOnlyHint: true },
    },
    async () =>
      asyncResult(
        'get_nlp_pool_info',
        'Failed to fetch NLP pool info.',
        async () => {
          const [poolInfo, { symbols }] = await Promise.all([
            client.context.engineClient.getNlpPoolInfo(),
            client.context.engineClient.getSymbols({}),
          ]);

          const symbolMap = new Map<number, string>();
          for (const s of Object.values(symbols)) {
            symbolMap.set(s.productId, s.symbol);
          }

          const { nlpPools } = poolInfo;

          // Fetch indexer snapshots for entry price and PnL
          const snapshotsByPoolId = new Map<
            number,
            Map<
              number,
              { netEntryUnrealized: BigNumber; netFundingUnrealized: BigNumber }
            >
          >();

          try {
            const poolsToQuery = nlpPools.filter(
              (p) => p.subaccountHex && p.subaccountHex !== '0x',
            );
            if (poolsToQuery.length > 0) {
              const now = Math.floor(Date.now() / 1000);
              const snapshotsResponse =
                await client.context.indexerClient.getMultiSubaccountSnapshots({
                  subaccounts: poolsToQuery.map((pool) =>
                    subaccountFromHex(pool.subaccountHex),
                  ),
                  timestamps: [now],
                });

              for (const pool of poolsToQuery) {
                const poolSnapshots =
                  snapshotsResponse.snapshots[pool.subaccountHex];
                if (!poolSnapshots) continue;

                const snapshot = Object.values(poolSnapshots)[0];
                if (!snapshot?.balances) continue;

                const balMap = new Map<
                  number,
                  {
                    netEntryUnrealized: BigNumber;
                    netFundingUnrealized: BigNumber;
                  }
                >();
                for (const bal of snapshot.balances) {
                  balMap.set(bal.productId, {
                    netEntryUnrealized: new BigNumber(
                      bal.trackedVars.netEntryUnrealized.toString(),
                    ),
                    netFundingUnrealized: new BigNumber(
                      bal.trackedVars.netFundingUnrealized.toString(),
                    ),
                  });
                }
                snapshotsByPoolId.set(pool.poolId, balMap);
              }
            }
          } catch {
            // Snapshots are best-effort; positions still show without them
          }

          const positions = aggregatePositions(
            nlpPools,
            symbolMap,
            snapshotsByPoolId,
          );
          const openOrders = aggregateOrders(nlpPools, symbolMap);
          const poolSummaries = nlpPools.map(summarizePool);

          const spotPositions = positions.filter((p) => p.type === 'spot');
          const perpPositions = positions.filter((p) => p.type === 'perp');

          return {
            totalSubPools: nlpPools.length,
            poolSummaries,
            aggregatedPositions: {
              totalPositions: positions.length,
              spotPositions,
              perpPositions,
            },
            openOrders: {
              totalOrders: openOrders.length,
              orders: openOrders,
            },
          };
        },
      ),
  );
}
