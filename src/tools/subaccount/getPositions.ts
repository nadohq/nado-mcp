import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { NadoContext } from '../../context';
import { handleToolRequest } from '../../utils/handleToolRequest';
import { resolveSubaccount } from '../../utils/resolveSubaccount';
import {
  OptionalSubaccountNameSchema,
  OptionalSubaccountOwnerSchema,
} from '../../utils/schemas';

export function registerGetIsolatedPositions(
  server: McpServer,
  ctx: NadoContext,
): void {
  server.registerTool(
    'get_isolated_positions',
    {
      title: 'Get Isolated Positions',
      description:
        'Get all isolated margin positions for a subaccount, including per-position health and balance details. Use this after get_subaccount_summary to see detailed per-position margin info. Isolated positions have their own margin pool separate from cross-margin positions.',
      inputSchema: {
        subaccountOwner: OptionalSubaccountOwnerSchema,
        subaccountName: OptionalSubaccountNameSchema,
      },
      annotations: { readOnlyHint: true },
    },
    async (input: { subaccountOwner?: string; subaccountName?: string }) => {
      const { subaccountOwner, subaccountName } = resolveSubaccount(ctx, input);

      return handleToolRequest(
        'get_isolated_positions',
        `Failed to fetch isolated positions for ${subaccountOwner}/${subaccountName}.`,
        () =>
          ctx.client.subaccount.getIsolatedPositions({
            subaccountOwner,
            subaccountName,
          }),
      );
    },
  );
}
