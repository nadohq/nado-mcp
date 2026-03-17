import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { NadoContext } from '../../context';
import { handleToolRequest } from '../../utils/handleToolRequest';
import { resolveSubaccount } from '../../utils/resolveSubaccount';
import {
  OptionalSubaccountNameSchema,
  OptionalSubaccountOwnerSchema,
  PaginationLimitSchema,
  ProductIdsSchema,
} from '../../utils/schemas';

export function registerGetFundingPayments(
  server: McpServer,
  ctx: NadoContext,
): void {
  server.registerTool(
    'get_funding_payments',
    {
      title: 'Get Funding Payments',
      description:
        'Fetch historical interest and funding payment events for a subaccount and set of products. Use this to analyze funding costs/income over time. Shows individual payment events with timestamps and amounts. For the current funding rate (not historical payments), use get_funding_rate or get_multi_product_funding_rates instead.',
      inputSchema: {
        subaccountOwner: OptionalSubaccountOwnerSchema,
        subaccountName: OptionalSubaccountNameSchema,
        productIds: ProductIdsSchema,
        limit: PaginationLimitSchema,
      },
      annotations: { readOnlyHint: true },
    },
    async (input: {
      subaccountOwner?: string;
      subaccountName?: string;
      productIds: number[];
      limit: number;
    }) => {
      const { subaccountOwner, subaccountName } = resolveSubaccount(ctx, input);

      return handleToolRequest(
        'get_funding_payments',
        `Failed to fetch funding payments for ${subaccountOwner}/${subaccountName}.`,
        () =>
          ctx.client.context.indexerClient.getInterestFundingPayments({
            subaccount: { subaccountOwner, subaccountName },
            productIds: input.productIds,
            limit: input.limit,
          }),
      );
    },
  );
}
