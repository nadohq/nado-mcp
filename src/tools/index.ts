import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { NadoContext } from '../context';
import { registerBurnNlp } from './execute/burnNlp';
import { registerCancelAndPlace } from './execute/cancelAndPlace';
import { registerCancelOrders } from './execute/cancelOrders';
import { registerCancelTriggerOrders } from './execute/cancelTriggerOrders';
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
import { registerGetMatchEvents } from './indexer/getMatchEvents';
import { registerGetOraclePrices } from './indexer/getOraclePrices';
import { registerGetHistoricalOrders } from './indexer/getOrders';
import { registerGetSnapshots } from './indexer/getSnapshots';
import { registerGetTickers } from './indexer/getTickers';
import { registerGetAllMarkets } from './market/getAllMarkets';
import { registerGetCandlesticks } from './market/getCandlesticks';
import { registerGetFundingRate } from './market/getFundingRate';
import { registerGetMarketLiquidity } from './market/getMarketLiquidity';
import { registerGetMarketPrice } from './market/getMarketPrice';
import { registerGetMaxOrderSize } from './market/getMaxOrderSize';
import { registerGetOpenOrders } from './market/getOpenOrders';
import { registerGetPerpPrices } from './market/getPerpPrices';
import { registerGetTriggerOrders } from './market/getTriggerOrders';
import { registerGetNlpPoolInfo } from './nlp/getPoolInfo';
import { registerGetNlpSnapshots } from './nlp/getSnapshots';
import { registerGetNlpUserInfo } from './nlp/getUserInfo';
import { registerGetFeeRates } from './subaccount/getFeeRates';
import { registerGetLiquidationPrice } from './subaccount/getLiquidationPrice';
import { registerGetMaxWithdrawable } from './subaccount/getMaxWithdrawable';
import { registerGetIsolatedPositions } from './subaccount/getPositions';
import { registerGetSubaccountSummary } from './subaccount/getSummary';
import { registerListSubaccounts } from './subaccount/listSubaccounts';

export function registerTools(server: McpServer, ctx: NadoContext): void {
  const { client } = ctx;

  // Execute / write operations — registered first so MCP clients with tool
  // count limits keep these critical tools rather than dropping them.
  registerPlaceOrder(server, ctx);
  registerPlaceTwapOrder(server, ctx);
  registerPlaceTriggerOrder(server, ctx);
  registerCancelOrders(server, ctx);
  registerCancelTriggerOrders(server, ctx);
  registerCancelAndPlace(server, ctx);
  registerClosePosition(server, ctx);
  registerDepositCollateral(server, ctx);
  registerWithdrawCollateral(server, ctx);
  registerTransferQuote(server, ctx);
  registerMintNlp(server, ctx);
  registerBurnNlp(server, ctx);
  registerLinkSigner(server, ctx);

  // Market data
  registerGetAllMarkets(server, client);
  registerGetMarketPrice(server, client);
  registerGetMarketLiquidity(server, client);
  registerGetCandlesticks(server, client);
  registerGetFundingRate(server, client);
  registerGetMaxOrderSize(server, ctx);
  registerGetPerpPrices(server, client);
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
  registerGetNlpSnapshots(server, client);
  registerGetNlpUserInfo(server, ctx);

  // Indexer / historical
  registerGetAccountStats(server, ctx);
  registerGetHistoricalOrders(server, ctx);
  registerGetMatchEvents(server, ctx);
  registerGetFundingPayments(server, ctx);
  registerGetTickers(server, client);
  registerGetOraclePrices(server, client);
  registerGetSnapshots(server, client);
}
