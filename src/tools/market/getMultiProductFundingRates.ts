import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { NadoClient } from '@nadohq/client';

import { fmtProductIds } from '../../utils/formatting.js';
import { handleToolRequest } from '../../utils/handleToolRequest.js';
import { ProductIdsSchema } from '../../utils/schemas.js';

export function registerGetMultiProductFundingRates(
  server: McpServer,
  client: NadoClient,
): void {
  server.registerTool(
    'get_multi_product_funding_rates',
    {
      title: 'Get Multi-Product Funding Rates',
      description:
        'Get funding rates for multiple perpetual markets in a single batch request. Use this instead of calling get_funding_rate repeatedly when comparing funding across markets. Returns a map of product ID to funding rate data.',
      inputSchema: {
        productIds: ProductIdsSchema.describe(
          'Perp product IDs to fetch funding rates for',
        ),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ productIds }: { productIds: number[] }) =>
      handleToolRequest(
        'get_multi_product_funding_rates',
        `Failed to fetch funding rates for products ${fmtProductIds(productIds)}. Ensure these are perp product IDs.`,
        () => client.market.getMultiProductFundingRates({ productIds }),
      ),
  );
}
