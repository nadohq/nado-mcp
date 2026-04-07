import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { NadoClient } from '@nadohq/client';

import { fmtProductIds } from '../../utils/formatting';
import { handleToolRequest } from '../../utils/handleToolRequest';
import { ProductIdsSchema } from '../../utils/schemas';

export function registerGetFundingRate(
  server: McpServer,
  client: NadoClient,
): void {
  server.registerTool(
    'get_funding_rate',
    {
      title: 'Get Funding Rate',
      description:
        'Get the current funding rate for one or more perpetual markets. Positive rates mean longs pay shorts; negative means shorts pay longs.',
      inputSchema: {
        productIds: ProductIdsSchema.describe(
          'Perp product IDs to fetch funding rates for',
        ),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ productIds }: { productIds: number[] }) =>
      handleToolRequest(
        'get_funding_rate',
        `Failed to fetch funding rates for products ${fmtProductIds(productIds)}. Ensure these are perp product IDs.`,
        () => client.market.getMultiProductFundingRates({ productIds }),
      ),
  );
}
