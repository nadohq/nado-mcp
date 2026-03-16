import {
  CHAIN_ENV_TO_CHAIN,
  createNadoClient as createSdkClient,
  NadoClient,
  type ChainEnv,
} from '@nadohq/client';
import {
  createPublicClient,
  createWalletClient,
  http,
  isAddress,
  type Address,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import type { ServerConfig } from './config';
import type { DataEnv } from './dataEnv';

export type { NadoClient };

export interface NadoContext {
  client: NadoClient;
  dataEnv: DataEnv;
  chainEnv: ChainEnv;
  subaccountOwner?: Address;
  subaccountName: string;
  chainId: number;
  /** True when a PRIVATE_KEY was provided and a walletClient was created. */
  hasSigner: boolean;
}

export type NadoContextWithSigner = NadoContext &
  Required<Pick<NadoContext, 'subaccountOwner'>> & {
    hasSigner: true;
  };

export function createNadoContext(config: ServerConfig): NadoContext {
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
    chainEnv: config.chainEnv,
    subaccountOwner,
    subaccountName: config.subaccountName,
    chainId: chain.id,
    hasSigner: !!walletClient,
  };
}
