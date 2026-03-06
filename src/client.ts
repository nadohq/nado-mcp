import {
  CHAIN_ENV_TO_CHAIN,
  createNadoClient as createSdkClient,
  NadoClient,
} from '@nadohq/client';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import type { ServerConfig } from './config.js';

export type { NadoClient };

export interface NadoClientWithAccount {
  client: NadoClient;
  subaccountOwner?: `0x${string}`;
  subaccountName: string;
  chainId: number;
}

export function createNadoClient(config: ServerConfig): NadoClientWithAccount {
  const chain = CHAIN_ENV_TO_CHAIN[config.chainEnv];
  const rpcUrl = config.rpcUrl ?? chain.rpcUrls.default.http[0];
  const publicClient = createPublicClient({ transport: http(rpcUrl) });

  const account = config.privateKey
    ? privateKeyToAccount(config.privateKey as `0x${string}`)
    : undefined;

  const walletClient = account
    ? createWalletClient({
        account,
        chain,
        transport: http(rpcUrl),
      })
    : undefined;

  const client = createSdkClient(config.chainEnv, {
    publicClient,
    walletClient,
  });

  return {
    client,
    subaccountOwner: account?.address,
    subaccountName: config.subaccountName,
    chainId: chain.id,
  };
}
