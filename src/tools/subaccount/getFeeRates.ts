import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { NadoContext } from '../../context';
import { handleToolRequest } from '../../utils/handleToolRequest';
import { resolveSubaccount } from '../../utils/resolveSubaccount';
import {
  OptionalSubaccountNameSchema,
  OptionalSubaccountOwnerSchema,
} from '../../utils/schemas';

export function registerGetFeeRates(server: McpServer, ctx: NadoContext): void {
  server.registerTool(
    'get_fee_rates',
    {
      title: 'Get Fee Rates',
      description:
        'Get the maker and taker fee rates for a subaccount across all products. Use this to understand trading costs. Maker fees apply to limit orders that add liquidity; taker fees apply to market orders and limit orders that cross the spread. Fee rates may vary by product and trading volume tier.',
      inputSchema: {
        subaccountOwner: OptionalSubaccountOwnerSchema,
        subaccountName: OptionalSubaccountNameSchema,
      },
      annotations: { readOnlyHint: true },
    },
    async (input: { subaccountOwner?: string; subaccountName?: string }) => {
      const { subaccountOwner, subaccountName } = resolveSubaccount(ctx, input);

      return handleToolRequest(
        'get_fee_rates',
        `Failed to fetch fee rates for ${subaccountOwner}/${subaccountName}.`,
        () =>
          ctx.client.subaccount.getSubaccountFeeRates({
            subaccountOwner,
            subaccountName,
          }),
      );
    },
  );
}
