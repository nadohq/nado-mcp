import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { NadoClient } from '@nadohq/client';

import { ToolExecutionError } from '../../utils/errors.js';
import { toJsonContent } from '../../utils/formatting.js';
import {
  SubaccountNameSchema,
  SubaccountOwnerSchema,
} from '../../utils/schemas.js';

export function registerGetSubaccountSummary(
  server: McpServer,
  client: NadoClient,
): void {
  server.registerTool(
    'get_subaccount_summary',
    {
      title: 'Get Subaccount Summary',
      description:
        'Get a full summary of a subaccount including balances, health, and margin state from the off-chain engine. This is the primary tool for checking account status. Use this first when investigating a portfolio, then follow up with get_isolated_positions for per-position details, get_open_orders for pending orders, or get_trigger_orders for stop-loss/TP orders.',
      inputSchema: {
        subaccountOwner: SubaccountOwnerSchema,
        subaccountName: SubaccountNameSchema,
      },
      annotations: { readOnlyHint: true },
    },
    async ({
      subaccountOwner,
      subaccountName,
    }: {
      subaccountOwner: string;
      subaccountName: string;
    }) => {
      try {
        const summary = await client.subaccount.getSubaccountSummary({
          subaccountOwner,
          subaccountName,
        });
        return {
          content: [{ type: 'text', text: toJsonContent(summary) }],
        };
      } catch (err) {
        throw new ToolExecutionError(
          'get_subaccount_summary',
          `Failed to fetch summary for ${subaccountOwner}/${subaccountName}.`,
          err,
        );
      }
    },
  );
}
