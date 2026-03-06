import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { NadoClient } from '@nadohq/client';

import { ToolExecutionError } from '../../utils/errors.js';
import { toJsonContent } from '../../utils/formatting.js';
import {
  PaginationLimitSchema,
  ProductIdsSchema,
  SubaccountNameSchema,
  SubaccountOwnerSchema,
} from '../../utils/schemas.js';

export function registerGetFundingPayments(
  server: McpServer,
  client: NadoClient,
): void {
  server.registerTool(
    'get_funding_payments',
    {
      title: 'Get Funding Payments',
      description:
        'Fetch historical interest and funding payment events for a subaccount and set of products. Use this to analyze funding costs/income over time. Shows individual payment events with timestamps and amounts. For the current funding rate (not historical payments), use get_funding_rate or get_multi_product_funding_rates instead.',
      inputSchema: {
        subaccountOwner: SubaccountOwnerSchema,
        subaccountName: SubaccountNameSchema,
        productIds: ProductIdsSchema,
        limit: PaginationLimitSchema,
      },
      annotations: { readOnlyHint: true },
    },
    async ({
      subaccountOwner,
      subaccountName,
      productIds,
      limit,
    }: {
      subaccountOwner: string;
      subaccountName: string;
      productIds: number[];
      limit: number;
    }) => {
      try {
        // FRANK: `asyncResult` could clean up some of these
        const payments =
          await client.context.indexerClient.getInterestFundingPayments({
            subaccount: { subaccountOwner, subaccountName },
            productIds,
            limit,
          });
        return {
          content: [{ type: 'text', text: toJsonContent(payments) }],
        };
      } catch (err) {
        throw new ToolExecutionError(
          'get_funding_payments',
          `Failed to fetch funding payments for ${subaccountOwner}/${subaccountName}.`,
          err,
        );
      }
    },
  );
}
