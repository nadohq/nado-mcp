import {
  CHAIN_ENV_TO_CHAIN,
  createNadoClient as createSdkClient,
  NadoClient,
} from '@nadohq/client';
import {
  createPublicClient,
  createWalletClient,
  http,
  isAddress,
  type Address,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import type { ServerConfig } from './config.js';
import type { DataEnv } from './dataEnv.js';

export type { NadoClient };

export interface NadoClientWithAccount {
  client: NadoClient;
  dataEnv: DataEnv;
  subaccountOwner?: Address;
  subaccountName: string;
  chainId: number;
  /** True when a PRIVATE_KEY was provided and a walletClient was created. */
  hasSigner: boolean;
}

export type NadoClientWithSigner = NadoClientWithAccount &
  Required<Pick<NadoClientWithAccount, 'subaccountOwner'>> & {
    hasSigner: true;
  };

export function createNadoClient(config: ServerConfig): NadoClientWithAccount {
  const chain = CHAIN_ENV_TO_CHAIN[config.chainEnv];
  const rpcUrl = config.rpcUrl ?? chain.rpcUrls.default.http[0];
  const publicClient = createPublicClient({ transport: http(rpcUrl) });

  const account = config.privateKey
    ? privateKeyToAccount(config.privateKey as Address)
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

  let subaccountOwner: Address | undefined;
  if (config.subaccountOwner) {
    if (!isAddress(config.subaccountOwner)) {
      throw new Error(
        'SUBACCOUNT_OWNER must be a valid Ethereum address (0x-prefixed, 40 hex chars).',
      );
    }
    subaccountOwner = config.subaccountOwner;
  } else if (account) {
    subaccountOwner = account.address;
  }

  return {
    client,
    dataEnv: config.dataEnv,
    subaccountOwner,
    subaccountName: config.subaccountName,
    chainId: chain.id,
    hasSigner: !!walletClient,
  };
}
