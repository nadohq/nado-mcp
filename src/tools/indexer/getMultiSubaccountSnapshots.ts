import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { NadoClient } from '@nadohq/client';
import { z } from 'zod';

import { handleToolRequest } from '../../utils/handleToolRequest.js';
import {
  SubaccountNameSchema,
  SubaccountOwnerSchema,
} from '../../utils/schemas.js';

export function registerGetMultiSubaccountSnapshots(
  server: McpServer,
  client: NadoClient,
): void {
  server.registerTool(
    'get_multi_subaccount_snapshots',
    {
      title: 'Get Subaccount Historical Snapshots',
      description:
        'Get historical equity and PnL snapshots for one or more subaccounts at specific timestamps. Use this to build portfolio performance charts or compare account value over time. Provide Unix timestamps for the points in time you want snapshots for.',
      inputSchema: {
        subaccountOwner: SubaccountOwnerSchema,
        subaccountName: SubaccountNameSchema,
        timestamps: z
          .array(z.number().int())
          .min(1)
          .describe(
            'Unix timestamps (seconds) to get snapshots for. E.g. hourly timestamps over the last 24h.',
          ),
      },
      annotations: { readOnlyHint: true },
    },
    async ({
      subaccountOwner,
      subaccountName,
      timestamps,
    }: {
      subaccountOwner: string;
      subaccountName: string;
      timestamps: number[];
    }) =>
      handleToolRequest(
        'get_multi_subaccount_snapshots',
        `Failed to fetch subaccount snapshots for ${subaccountOwner}/${subaccountName}.`,
        () =>
          client.context.indexerClient.getMultiSubaccountSnapshots({
            subaccounts: [{ subaccountOwner, subaccountName }],
            timestamps,
          }),
      ),
  );
}
