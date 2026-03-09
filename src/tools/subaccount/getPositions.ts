import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { NadoClient } from '@nadohq/client';

import { handleToolRequest } from '../../utils/handleToolRequest.js';
import {
  SubaccountNameSchema,
  SubaccountOwnerSchema,
} from '../../utils/schemas.js';

export function registerGetIsolatedPositions(
  server: McpServer,
  client: NadoClient,
): void {
  server.registerTool(
    'get_isolated_positions',
    {
      title: 'Get Isolated Positions',
      description:
        'Get all isolated margin positions for a subaccount, including per-position health and balance details. Use this after get_subaccount_summary to see detailed per-position margin info. Isolated positions have their own margin pool separate from cross-margin positions.',
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
        'get_isolated_positions',
        `Failed to fetch isolated positions for ${subaccountOwner}/${subaccountName}.`,
        () =>
          client.subaccount.getIsolatedPositions({
            subaccountOwner,
            subaccountName,
          }),
      ),
  );
}
