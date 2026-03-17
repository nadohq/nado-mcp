import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  CHAIN_ENV_TO_CHAIN,
  createNadoClient as createSdkClient,
} from '@nadohq/client';
import { subaccountToHex } from '@nadohq/shared';
import {
  type Address,
  createPublicClient,
  createWalletClient,
  http,
  isAddress,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { z } from 'zod';

import type { NadoContext } from '../../context';
import { handleToolRequest } from '../../utils/handleToolRequest';
import { SAFETY_DISCLAIMER } from '../../utils/schemas';

export function registerLinkSigner(server: McpServer, ctx: NadoContext): void {
  server.registerTool(
    'link_signer',
    {
      title: 'Link Signer',
      description:
        'Link a signer address to a subaccount, allowing it to sign transactions on behalf of the subaccount (1-click trading). ' +
        'To revoke a linked signer, pass the zero address (0x0000000000000000000000000000000000000000). ' +
        "Requires the subaccount owner's private key to sign the transaction. " +
        SAFETY_DISCLAIMER,
      inputSchema: {
        signer: z
          .string()
          .refine(isAddress, 'Must be a valid Ethereum address')
          .describe(
            'Address of the signer to link. Use zero address to revoke.',
          ),
        privateKey: z
          .string()
          .describe(
            'Private key of the subaccount owner. Required because link_signer must be signed by the owner, not the linked signer.',
          ),
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({ signer, privateKey }: { signer: string; privateKey: string }) => {
      return handleToolRequest(
        'link_signer',
        `Failed to link signer ${signer} to subaccount.`,
        () => {
          const ownerAccount = privateKeyToAccount(privateKey as Address);
          const chain = CHAIN_ENV_TO_CHAIN[ctx.chainEnv];
          const rpcUrl = chain.rpcUrls.default.http[0];

          const ownerClient = createSdkClient(ctx.chainEnv, {
            publicClient: createPublicClient({ transport: http(rpcUrl) }),
            walletClient: createWalletClient({
              account: ownerAccount,
              chain,
              transport: http(rpcUrl),
            }),
          });

          const signerBytes32 = subaccountToHex({
            subaccountOwner: signer,
            subaccountName: '',
          });

          return ownerClient.subaccount.linkSigner({
            subaccountOwner: ownerAccount.address,
            subaccountName: ctx.subaccountName,
            signer: signerBytes32,
          });
        },
      );
    },
  );
}
