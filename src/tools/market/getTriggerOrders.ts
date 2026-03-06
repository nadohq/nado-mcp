import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { NadoClient } from '@nadohq/client';
import { z } from 'zod';

import { asyncResult } from '../../utils/asyncResult.js';
import {
  PaginationLimitSchema,
  ProductIdsSchema,
  SubaccountNameSchema,
  SubaccountOwnerSchema,
} from '../../utils/schemas.js';

const ACTIVE_STATUSES = [
  'waiting_price',
  'waiting_dependency',
  'triggering',
  'twap_executing',
] as const;

export function registerGetTriggerOrders(
  server: McpServer,
  client: NadoClient,
): void {
  server.registerTool(
    'get_trigger_orders',
    {
      title: 'Get Trigger Orders',
      description:
        'Get open trigger orders (stop-loss, take-profit, TWAP) for a subaccount. Critical for understanding risk management and pending conditional orders. Use this alongside get_open_orders to get the full picture of all pending orders. By default returns only active (pending) trigger orders.',
      inputSchema: {
        subaccountOwner: SubaccountOwnerSchema,
        subaccountName: SubaccountNameSchema,
        productIds: ProductIdsSchema.optional().describe(
          'Filter by product IDs (omit for all products)',
        ),
        limit: PaginationLimitSchema,
        activeOnly: z
          .boolean()
          .optional()
          .default(true)
          .describe(
            'If true (default), only return active trigger orders (waiting_price, waiting_dependency, triggering, twap_executing). Set to false to include all statuses.',
          ),
      },
      annotations: { readOnlyHint: true },
    },
    async ({
      subaccountOwner,
      subaccountName,
      productIds,
      limit,
      activeOnly,
    }: {
      subaccountOwner: string;
      subaccountName: string;
      productIds?: number[];
      limit: number;
      activeOnly: boolean;
    }) =>
      asyncResult(
        'get_trigger_orders',
        `Failed to fetch trigger orders for ${subaccountOwner}/${subaccountName}.`,
        () =>
          client.market.getTriggerOrders({
            subaccountOwner,
            subaccountName,
            productIds,
            limit,
            ...(activeOnly ? { statusTypes: [...ACTIVE_STATUSES] } : {}),
          }),
      ),
  );
}
