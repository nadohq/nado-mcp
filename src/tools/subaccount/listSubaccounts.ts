import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { NadoContext } from '../../context';
import { handleToolRequest } from '../../utils/handleToolRequest';
import { PaginationLimitSchema } from '../../utils/schemas';

export function registerListSubaccounts(
  server: McpServer,
  ctx: NadoContext,
): void {
  server.registerTool(
    'list_subaccounts',
    {
      title: 'List Subaccounts',
      description:
        'List all subaccounts for a wallet address. Use this to discover which subaccounts exist before querying positions or orders. Returns subaccount names and metadata.',
      inputSchema: {
        address: z
          .string()
          .regex(/^0x[a-fA-F0-9]{40}$/, 'Must be a valid 20-byte hex address')
          .optional()
          .describe(
            'Wallet address to list subaccounts for. Omit to list all subaccounts.',
          ),
        limit: PaginationLimitSchema,
      },
      annotations: { readOnlyHint: true },
    },
    async ({ address, limit }: { address?: string; limit: number }) => {
      const resolvedAddress = address || ctx.subaccountOwner;

      return handleToolRequest(
        'list_subaccounts',
        `Failed to list subaccounts${resolvedAddress ? ` for ${resolvedAddress}` : ''}.`,
        () =>
          ctx.client.context.indexerClient.listSubaccounts({
            address: resolvedAddress,
            limit,
          }),
      );
    },
  );
}
