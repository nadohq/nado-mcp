import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { NadoContext } from '../context.js';
import { registerBurnNlp } from './execute/burnNlp.js';
import { registerCancelAndPlace } from './execute/cancelAndPlace.js';
import { registerCancelOrders } from './execute/cancelOrders.js';
import { registerCancelProductOrders } from './execute/cancelProductOrders.js';
import { registerCancelTriggerOrders } from './execute/cancelTriggerOrders.js';
import { registerCancelTriggerProductOrders } from './execute/cancelTriggerProductOrders.js';
import { registerCloseAllPositions } from './execute/closeAllPositions.js';
import { registerClosePosition } from './execute/closePosition.js';
import { registerDepositCollateral } from './execute/depositCollateral.js';
import { registerLinkSigner } from './execute/linkSigner.js';
import { registerMintNlp } from './execute/mintNlp.js';
import { registerPlaceOrder } from './execute/placeOrder.js';
import { registerPlaceTriggerOrder } from './execute/placeTriggerOrder.js';
import { registerPlaceTwapOrder } from './execute/placeTwapOrder.js';
import { registerTransferQuote } from './execute/transferQuote.js';
import { registerWithdrawCollateral } from './execute/withdrawCollateral.js';
import { registerGetAccountStats } from './indexer/getAccountStats.js';
import { registerGetFundingPayments } from './indexer/getFundingPayments.js';
import { registerGetLeaderboard } from './indexer/getLeaderboard.js';
import { registerGetMarketSnapshots } from './indexer/getMarketSnapshots.js';
import { registerGetMatchEvents } from './indexer/getMatchEvents.js';
import { registerGetMultiSubaccountSnapshots } from './indexer/getMultiSubaccountSnapshots.js';
import { registerGetOraclePrices } from './indexer/getOraclePrices.js';
import { registerGetHistoricalOrders } from './indexer/getOrders.js';
import { registerGetProductSnapshots } from './indexer/getProductSnapshots.js';
import { registerGetTickers } from './indexer/getTickers.js';
import { registerGetAllMarkets } from './market/getAllMarkets.js';
import { registerGetCandlesticks } from './market/getCandlesticks.js';
import { registerGetFundingRate } from './market/getFundingRate.js';
import { registerGetMarketLiquidity } from './market/getMarketLiquidity.js';
import { registerGetMarketPrice } from './market/getMarketPrice.js';
import { registerGetMarketPrices } from './market/getMarketPrices.js';
import { registerGetMaxOrderSize } from './market/getMaxOrderSize.js';
import { registerGetMultiProductFundingRates } from './market/getMultiProductFundingRates.js';
import { registerGetMultiProductPerpPrices } from './market/getMultiProductPerpPrices.js';
import { registerGetOpenOrders } from './market/getOpenOrders.js';
import { registerGetPerpPrices } from './market/getPerpPrices.js';
import { registerGetTriggerOrders } from './market/getTriggerOrders.js';
import { registerGetNlpLockedBalances } from './nlp/getLockedBalances.js';
import { registerGetNlpMaxMintBurn } from './nlp/getMaxMintBurn.js';
import { registerGetNlpPoolInfo } from './nlp/getPoolInfo.js';
import { registerGetNlpSnapshots } from './nlp/getSnapshots.js';
import { registerGetFeeRates } from './subaccount/getFeeRates.js';
import { registerGetLiquidationPrice } from './subaccount/getLiquidationPrice.js';
import { registerGetMaxWithdrawable } from './subaccount/getMaxWithdrawable.js';
import { registerGetIsolatedPositions } from './subaccount/getPositions.js';
import { registerGetSubaccountSummary } from './subaccount/getSummary.js';
import { registerListSubaccounts } from './subaccount/listSubaccounts.js';

export function registerTools(server: McpServer, ctx: NadoContext): void {
  const { client } = ctx;

  // Market data
  registerGetAllMarkets(server, client);
  registerGetMarketPrice(server, client);
  registerGetMarketPrices(server, client);
  registerGetMarketLiquidity(server, client);
  registerGetCandlesticks(server, client);
  registerGetFundingRate(server, client);
  registerGetMultiProductFundingRates(server, client);
  registerGetMaxOrderSize(server, client);
  registerGetPerpPrices(server, client);
  registerGetMultiProductPerpPrices(server, client);
  registerGetOpenOrders(server, client);
  registerGetTriggerOrders(server, client);

  // Subaccount
  registerGetSubaccountSummary(server, ctx);
  registerGetIsolatedPositions(server, client);
  registerGetFeeRates(server, client);
  registerGetMaxWithdrawable(server, client);
  registerGetLiquidationPrice(server, client);
  registerListSubaccounts(server, client);

  // NLP vault
  registerGetNlpPoolInfo(server, client);
  registerGetNlpLockedBalances(server, client);
  registerGetNlpSnapshots(server, client);
  registerGetNlpMaxMintBurn(server, client);

  // Indexer / historical
  registerGetAccountStats(server, ctx);
  registerGetHistoricalOrders(server, client);
  registerGetMatchEvents(server, client);
  registerGetFundingPayments(server, client);
  registerGetTickers(server, client);
  registerGetLeaderboard(server, client);
  registerGetOraclePrices(server, client);
  registerGetMarketSnapshots(server, client);
  registerGetProductSnapshots(server, client);
  registerGetMultiSubaccountSnapshots(server, client);

  // Execute / write operations
  registerPlaceOrder(server, ctx);
  registerPlaceTwapOrder(server, ctx);
  registerPlaceTriggerOrder(server, ctx);
  registerCancelOrders(server, ctx);
  registerCancelProductOrders(server, ctx);
  registerCancelTriggerOrders(server, ctx);
  registerCancelTriggerProductOrders(server, ctx);
  registerCancelAndPlace(server, ctx);
  registerClosePosition(server, ctx);
  registerCloseAllPositions(server, ctx);

  // Funds management
  registerDepositCollateral(server, ctx);
  registerWithdrawCollateral(server, ctx);
  registerTransferQuote(server, ctx);

  // NLP vault write operations
  registerMintNlp(server, ctx);
  registerBurnNlp(server, ctx);

  // Subaccount management
  registerLinkSigner(server, ctx);
}
