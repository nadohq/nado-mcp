/**
 * nado_discover — Progressive disclosure read tool
 *
 * Returns available SDK methods organized by domain with parameter signatures.
 * The LLM uses this to understand what's queryable before calling nado_query.
 *
 * Replaces: schema tokens for ALL 32+ individual read tools.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

const DomainSchema = z
  .enum(['market', 'subaccount', 'spot', 'perp', 'engine', 'indexer', 'all'])
  .default('all')
  .describe(
    'Filter by domain. Use "all" to see everything, or pick a specific domain.',
  );

interface MethodInfo {
  method: string;
  description: string;
  params: string;
  requiresSubaccount?: boolean;
  requiresSigner?: boolean;
}

// Static catalog built from SDK source analysis.
// This never drifts because it describes the SDK's public API — if the SDK
// adds a method, we add a row here. No custom logic, just documentation.
const METHOD_CATALOG: Record<string, MethodInfo[]> = {
  market: [
    {
      method: 'market.getAllMarkets',
      description:
        'All market states (spot + perp) with product info, weights, oracle prices',
      params: '{}',
    },
    {
      method: 'market.getLatestMarketPrice',
      description: 'Best bid/ask from the off-chain orderbook',
      params: '{ productId: number }',
    },
    {
      method: 'market.getLatestMarketPrices',
      description: 'Best bid/ask for multiple markets',
      params: '{ productIds: number[] }',
    },
    {
      method: 'market.getMarketLiquidity',
      description: 'Orderbook depth (price ticks with liquidity per level)',
      params: '{ productId: number, depth: number }',
    },
    {
      method: 'market.getCandlesticks',
      description:
        'Historical OHLCV candlesticks. Periods: 60, 300, 900, 3600, 7200, 14400, 86400, 604800, 2419200',
      params:
        '{ productId: number, period: string, maxTimeInclusive?: number, limit?: number }',
    },
    {
      method: 'market.getFundingRate',
      description: 'Latest funding rate for a perp product (1 = 100%)',
      params: '{ productId: number }',
    },
    {
      method: 'market.getMultiProductFundingRates',
      description: 'Funding rates for multiple perp products',
      params: '{ productIds: number[] }',
    },
    {
      method: 'market.getMaxOrderSize',
      description: 'Maximum order size given health constraints',
      params:
        '{ productId: number, price: string, side: "long"|"short", subaccountOwner: string, subaccountName: string, spotLeverage?: boolean, reduceOnly?: boolean, isolated?: boolean }',
      requiresSubaccount: true,
    },
    {
      method: 'market.getOpenSubaccountOrders',
      description: 'Open orders for a single product',
      params:
        '{ productId: number, subaccountOwner: string, subaccountName: string }',
      requiresSubaccount: true,
    },
    {
      method: 'market.getOpenSubaccountMultiProductOrders',
      description: 'Open orders across multiple products',
      params:
        '{ productIds: number[], subaccountOwner: string, subaccountName: string }',
      requiresSubaccount: true,
    },
    {
      method: 'market.getTriggerOrders',
      description:
        'List trigger orders (TP/SL/TWAP). Requires signer for authentication.',
      params:
        '{ subaccountOwner: string, subaccountName: string, productIds?: number[], statusTypes?: string[], triggerTypes?: string[] }',
      requiresSigner: true,
    },
    {
      method: 'market.getHistoricalOrders',
      description: 'Historical orders from the indexer',
      params:
        '{ subaccounts?: Array<{subaccountOwner, subaccountName}>, productIds?: number[], limit?: number, maxTimestampInclusive?: number }',
    },
    {
      method: 'market.getProductSnapshots',
      description: 'Historical product state snapshots',
      params:
        '{ productId: number, maxTimestampInclusive?: number, limit?: number }',
    },
    {
      method: 'market.getMarketSnapshots',
      description: 'Historical market snapshots with interval control',
      params: '{ productIds?: number[], ... }',
    },
    {
      method: 'market.getMultiProductSnapshots',
      description: 'Snapshots for multiple products at specific timestamps',
      params:
        '{ productIds: number[], maxTimestampInclusive?: number[] }',
    },
    {
      method: 'market.validateOrderParams',
      description:
        'Pre-flight check: validates an order against health requirements',
      params: '{ productId: number, chainId: number, order: {...} }',
      requiresSigner: true,
    },
  ],
  subaccount: [
    {
      method: 'subaccount.getSubaccountSummary',
      description:
        'Full subaccount state: balances, positions, health (initial + maintenance)',
      params: '{ subaccountOwner: string, subaccountName: string }',
      requiresSubaccount: true,
    },
    {
      method: 'subaccount.getIsolatedPositions',
      description: 'All isolated positions for a subaccount',
      params: '{ subaccountOwner: string, subaccountName: string }',
      requiresSubaccount: true,
    },
    {
      method: 'subaccount.getEngineEstimatedSubaccountSummary',
      description:
        'Simulated subaccount state after proposed transactions (what-if)',
      params:
        '{ subaccountOwner: string, subaccountName: string, txs: Array<{type: "apply_delta", tx: {productId, amountDelta, vQuoteDelta}}>, preState?: boolean }',
      requiresSubaccount: true,
    },
    {
      method: 'subaccount.getSubaccountFeeRates',
      description: 'Maker/taker fee rates and fee tier',
      params: '{ subaccountOwner: string, subaccountName: string }',
      requiresSubaccount: true,
    },
    {
      method: 'subaccount.getSubaccountLinkedSignerWithRateLimit',
      description: 'Current linked signer and remaining tx allowance',
      params: '{ subaccount: {subaccountOwner, subaccountName} }',
      requiresSubaccount: true,
    },
    {
      method: 'subaccount.getReferralCode',
      description: 'Referral code for the subaccount',
      params: '{ subaccount: {subaccountOwner, subaccountName} }',
      requiresSubaccount: true,
    },
  ],
  spot: [
    {
      method: 'spot.getMaxWithdrawable',
      description: 'Max withdrawal amount for a spot product',
      params:
        '{ productId: number, subaccountOwner: string, subaccountName: string, spotLeverage?: boolean }',
      requiresSubaccount: true,
    },
    {
      method: 'spot.getMaxMintNlpAmount',
      description: 'Max quote amount for minting NLP',
      params:
        '{ subaccountOwner: string, subaccountName: string, spotLeverage?: boolean }',
      requiresSubaccount: true,
    },
    {
      method: 'spot.getTokenWalletBalance',
      description: 'Token balance in the wallet (not subaccount)',
      params: '{ productId: number, address: string }',
    },
    {
      method: 'spot.getTokenAllowance',
      description: 'Token allowance for the Nado endpoint',
      params: '{ productId: number, address: string }',
    },
  ],
  perp: [
    {
      method: 'perp.getPerpPrices',
      description: 'Index and mark price for a perp product',
      params: '{ productId: number }',
    },
    {
      method: 'perp.getMultiProductPerpPrices',
      description: 'Index and mark prices for multiple perp products',
      params: '{ productIds: number[] }',
    },
  ],
  engine: [
    {
      method: 'engine.getSymbols',
      description:
        'All tradeable symbols with productId, priceIncrement, sizeIncrement, minSize, fee rates, weights',
      params: '{ productType?: "spot"|"perp", productIds?: number[] }',
    },
    {
      method: 'engine.getStatus',
      description: 'Engine operational status',
      params: '{}',
    },
    {
      method: 'engine.getContracts',
      description: 'Chain ID and endpoint contract address',
      params: '{}',
    },
    {
      method: 'engine.getHealthGroups',
      description:
        'Linked spot/perp product pairs used for spread health calculations',
      params: '{}',
    },
    {
      method: 'engine.getOrder',
      description: 'Look up a single order by digest',
      params: '{ productId: number, digest: string }',
    },
    {
      method: 'engine.getLinkedSigner',
      description: 'Currently linked signer address',
      params: '{ subaccountOwner: string, subaccountName: string }',
      requiresSubaccount: true,
    },
    {
      method: 'engine.getInsurance',
      description: 'Insurance fund balance in USDT',
      params: '{}',
    },
    {
      method: 'engine.getNlpLockedBalances',
      description: 'NLP locked/unlocked balances for a subaccount',
      params: '{ subaccountOwner: string, subaccountName: string }',
      requiresSubaccount: true,
    },
    {
      method: 'engine.getNlpPoolInfo',
      description: 'All NLP sub-pool details',
      params: '{}',
    },
    {
      method: 'engine.getMaxBurnNlpAmount',
      description: 'Max NLP burnable amount',
      params: '{ subaccountOwner: string, subaccountName: string }',
      requiresSubaccount: true,
    },
  ],
  indexer: [
    {
      method: 'indexer.listSubaccounts',
      description: 'All subaccounts for an address',
      params: '{ address: string }',
    },
    {
      method: 'indexer.getOraclePrices',
      description: 'Latest oracle prices for provided products',
      params: '{ productIds: number[] }',
    },
    {
      method: 'indexer.getCandlesticks',
      description: 'Historical candlesticks (same as market.getCandlesticks)',
      params:
        '{ productId: number, period: string, maxTimeInclusive?: number, limit?: number }',
    },
    {
      method: 'indexer.getMatchEvents',
      description: 'Trade match events with fill details',
      params:
        '{ subaccounts?: Array<{subaccountOwner, subaccountName}>, productIds?: number[], limit?: number }',
    },
    {
      method: 'indexer.getInterestFundingPayments',
      description: 'Historical funding and interest payments',
      params:
        '{ subaccount: {subaccountOwner, subaccountName}, productIds?: number[], limit?: number }',
    },
    {
      method: 'indexer.getMultiSubaccountSnapshots',
      description:
        'Historical balance snapshots for multiple subaccounts at given timestamps',
      params:
        '{ subaccounts: Array<{subaccountOwner, subaccountName}>, timestamps: number[] }',
    },
    {
      method: 'indexer.getLeaderboard',
      description: 'Trading leaderboard',
      params:
        '{ contestId: number, rankType: "pnl"|"roi", limit?: number, startCursor?: number }',
    },
    {
      method: 'indexer.getQuotePrice',
      description: 'USDT/USD quote price',
      params: '{}',
    },
    {
      method: 'indexer.getMarketSnapshots',
      description: 'Historical market snapshots',
      params: '{ productIds?: number[], ... }',
    },
    {
      method: 'indexer.getV2Tickers',
      description: 'V2 ticker data (24h stats)',
      params: '{ market?: string }',
    },
    {
      method: 'indexer.getSequencerBacklog',
      description: 'Sequencer backlog status',
      params: '{}',
    },
    {
      method: 'indexer.getNlpSnapshots',
      description: 'Historical NLP pool snapshots',
      params:
        '{ limit: number, maxTimeInclusive?: number, granularity: number }',
    },
    {
      method: 'indexer.getPoints',
      description: 'Points info per epoch and all-time',
      params: '{ address: string }',
    },
  ],
};

export function registerDiscoverTool(server: McpServer): void {
  server.registerTool(
    'nado_discover',
    {
      title: 'Discover Nado SDK Methods',
      description:
        'Lists available Nado SDK read methods with their parameter signatures. ' +
        'Use this FIRST to discover what data is available, then call nado_query to execute. ' +
        'Filter by domain (market, subaccount, spot, perp, engine, indexer) or use "all".',
      inputSchema: {
        domain: DomainSchema,
      },
      annotations: { readOnlyHint: true },
    },
    async ({ domain }: { domain: string }) => {
      const domains =
        domain === 'all' ? Object.keys(METHOD_CATALOG) : [domain];

      const catalog: Record<string, MethodInfo[]> = {};
      for (const d of domains) {
        if (METHOD_CATALOG[d]) {
          catalog[d] = METHOD_CATALOG[d];
        }
      }

      const totalMethods = Object.values(catalog).reduce(
        (sum, methods) => sum + methods.length,
        0,
      );

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                totalMethods,
                hint: 'Call nado_query with { method: "<method>", params: {...} } to execute any of these.',
                methods: catalog,
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
