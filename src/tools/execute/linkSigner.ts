import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { isAddress } from 'viem';
import { z } from 'zod';

import type { NadoContext } from '../../context.js';
import { handleToolRequest } from '../../utils/handleToolRequest.js';
import { requireSigner } from '../../utils/requireSigner.js';
import { SAFETY_DISCLAIMER } from '../../utils/schemas.js';

export function registerLinkSigner(server: McpServer, ctx: NadoContext): void {
  server.registerTool(
    'link_signer',
    {
      title: 'Link Signer',
      description:
        'Link a signer address to a subaccount, allowing it to sign transactions on behalf of the subaccount (1-click trading). ' +
        'To revoke a linked signer, pass the zero address (0x0000000000000000000000000000000000000000). ' +
        SAFETY_DISCLAIMER,
      inputSchema: {
        signer: z
          .string()
          .refine(isAddress, 'Must be a valid Ethereum address')
          .describe(
            'Address of the signer to link. Use zero address to revoke.',
          ),
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
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
