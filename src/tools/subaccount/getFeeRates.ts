import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { NadoClient } from '@nadohq/client';

import { handleToolRequest } from '../../utils/handleToolRequest.js';
import {
  SubaccountNameSchema,
  SubaccountOwnerSchema,
} from '../../utils/schemas.js';

export function registerGetFeeRates(
  server: McpServer,
  client: NadoClient,
): void {
  server.registerTool(
    'get_fee_rates',
    {
      title: 'Get Fee Rates',
      description:
        'Get the maker and taker fee rates for a subaccount across all products. Use this to understand trading costs. Maker fees apply to limit orders that add liquidity; taker fees apply to market orders and limit orders that cross the spread. Fee rates may vary by product and trading volume tier.',
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
    }) =>
      handleToolRequest(
        'get_fee_rates',
        `Failed to fetch fee rates for ${subaccountOwner}/${subaccountName}.`,
        () =>
          client.subaccount.getSubaccountFeeRates({
            subaccountOwner,
            subaccountName,
          }),
      ),
  );
}
