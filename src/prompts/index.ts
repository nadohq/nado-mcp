import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { NadoClient } from '@nadohq/client';

import { registerAnalyzeMarketPrompt } from './analyzeMarket.js';
import { registerMarketScreenerPrompt } from './marketScreener.js';
import { registerPortfolioSummaryPrompt } from './portfolioSummary.js';
import { registerRiskReportPrompt } from './riskReport.js';
import { registerVaultAnalysisPrompt } from './vaultAnalysis.js';

// FRANK: how useful are these? if given `tools`, couldn't AI just figure out what the user is looking for?
export function registerPrompts(server: McpServer, client: NadoClient): void {
  registerAnalyzeMarketPrompt(server, client);
  registerPortfolioSummaryPrompt(server, client);
  registerMarketScreenerPrompt(server, client);
  registerVaultAnalysisPrompt(server, client);
  registerRiskReportPrompt(server, client);
}
