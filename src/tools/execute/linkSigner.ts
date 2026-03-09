import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { isAddress } from 'viem';
import { z } from 'zod';

import type { NadoClientWithAccount } from '../../client.js';
import { handleToolRequest } from '../../utils/handleToolRequest.js';
import { requireSigner } from '../../utils/requireSigner.js';

export function registerLinkSigner(
  server: McpServer,
  ctx: NadoClientWithAccount,
): void {
  server.registerTool(
    'link_signer',
    {
      title: 'Link Signer',
      description:
        'Link a signer address to a subaccount, allowing it to sign transactions on behalf of the subaccount (1-click trading). ' +
        'To revoke a linked signer, pass the zero address (0x0000000000000000000000000000000000000000).',
      inputSchema: {
        signer: z
          .string()
          .refine(isAddress, 'Must be a valid Ethereum address')
          .describe(
            'Address of the signer to link. Use zero address to revoke.',
          ),
      },
      annotations: { readOnlyHint: false },
    },
    async ({ signer }: { signer: string }) => {
      requireSigner('link_signer', ctx);

      return handleToolRequest(
        'link_signer',
        `Failed to link signer ${signer} to subaccount.`,
        () =>
          ctx.client.subaccount.linkSigner({
            subaccountOwner: ctx.subaccountOwner,
            subaccountName: ctx.subaccountName,
            signer: signer as `0x${string}`,
          }),
      );
    },
  );
}
