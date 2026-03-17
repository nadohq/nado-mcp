import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { NadoContext } from '../context';
import { registerBurnNlp } from './execute/burnNlp';
import { registerCancelAndPlace } from './execute/cancelAndPlace';
import { registerCancelOrders } from './execute/cancelOrders';
import { registerCancelProductOrders } from './execute/cancelProductOrders';
import { registerCancelTriggerOrders } from './execute/cancelTriggerOrders';
import { registerCancelTriggerProductOrders } from './execute/cancelTriggerProductOrders';
import { registerCloseAllPositions } from './execute/closeAllPositions';
import { registerClosePosition } from './execute/closePosition';
import { registerDepositCollateral } from './execute/depositCollateral';
import { registerLinkSigner } from './execute/linkSigner';
import { registerMintNlp } from './execute/mintNlp';
import { registerPlaceOrder } from './execute/placeOrder';
import { registerPlaceTriggerOrder } from './execute/placeTriggerOrder';
import { registerPlaceTwapOrder } from './execute/placeTwapOrder';
import { registerTransferQuote } from './execute/transferQuote';
import { registerWithdrawCollateral } from './execute/withdrawCollateral';
import { registerGetAccountStats } from './indexer/getAccountStats';
import { registerGetFundingPayments } from './indexer/getFundingPayments';
import { registerGetLeaderboard } from './indexer/getLeaderboard';
import { registerGetMarketSnapshots } from './indexer/getMarketSnapshots';
import { registerGetMatchEvents } from './indexer/getMatchEvents';
import { registerGetMultiSubaccountSnapshots } from './indexer/getMultiSubaccountSnapshots';
import { registerGetOraclePrices } from './indexer/getOraclePrices';
import { registerGetHistoricalOrders } from './indexer/getOrders';
import { registerGetProductSnapshots } from './indexer/getProductSnapshots';
import { registerGetTickers } from './indexer/getTickers';
import { registerGetAllMarkets } from './market/getAllMarkets';
import { registerGetCandlesticks } from './market/getCandlesticks';
import { registerGetFundingRate } from './market/getFundingRate';
import { registerGetMarketLiquidity } from './market/getMarketLiquidity';
import { registerGetMarketPrice } from './market/getMarketPrice';
import { registerGetMarketPrices } from './market/getMarketPrices';
import { registerGetMaxOrderSize } from './market/getMaxOrderSize';
import { registerGetMultiProductFundingRates } from './market/getMultiProductFundingRates';
import { registerGetMultiProductPerpPrices } from './market/getMultiProductPerpPrices';
import { registerGetOpenOrders } from './market/getOpenOrders';
import { registerGetPerpPrices } from './market/getPerpPrices';
import { registerGetTriggerOrders } from './market/getTriggerOrders';
import { registerGetNlpLockedBalances } from './nlp/getLockedBalances';
import { registerGetNlpMaxMintBurn } from './nlp/getMaxMintBurn';
import { registerGetNlpPoolInfo } from './nlp/getPoolInfo';
import { registerGetNlpSnapshots } from './nlp/getSnapshots';
import { registerGetFeeRates } from './subaccount/getFeeRates';
import { registerGetLiquidationPrice } from './subaccount/getLiquidationPrice';
import { registerGetMaxWithdrawable } from './subaccount/getMaxWithdrawable';
import { registerGetIsolatedPositions } from './subaccount/getPositions';
import { registerGetSubaccountSummary } from './subaccount/getSummary';
import { registerListSubaccounts } from './subaccount/listSubaccounts';

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
  registerGetMaxOrderSize(server, ctx);
  registerGetPerpPrices(server, client);
  registerGetMultiProductPerpPrices(server, client);
  registerGetOpenOrders(server, ctx);
  registerGetTriggerOrders(server, ctx);

  // Subaccount
  registerGetSubaccountSummary(server, ctx);
  registerGetIsolatedPositions(server, ctx);
  registerGetFeeRates(server, ctx);
  registerGetMaxWithdrawable(server, ctx);
  registerGetLiquidationPrice(server, ctx);
  registerListSubaccounts(server, ctx);

  // NLP vault
  registerGetNlpPoolInfo(server, client);
  registerGetNlpLockedBalances(server, ctx);
  registerGetNlpSnapshots(server, client);
  registerGetNlpMaxMintBurn(server, ctx);

  // Indexer / historical
  registerGetAccountStats(server, ctx);
  registerGetHistoricalOrders(server, ctx);
  registerGetMatchEvents(server, ctx);
  registerGetFundingPayments(server, ctx);
  registerGetTickers(server, client);
  registerGetLeaderboard(server, client);
  registerGetOraclePrices(server, client);
  registerGetMarketSnapshots(server, client);
  registerGetProductSnapshots(server, client);
  registerGetMultiSubaccountSnapshots(server, ctx);

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
