import {
  CHAIN_ENV_TO_CHAIN,
  createNadoClient as createSdkClient,
  NadoClient,
} from '@nadohq/client';
import { createPublicClient, http } from 'viem';

import type { ServerConfig } from './config.js';

export type { NadoClient };

export function createNadoClient(config: ServerConfig): NadoClient {
  const chain = CHAIN_ENV_TO_CHAIN[config.chainEnv];
  const rpcUrl = config.rpcUrl ?? chain.rpcUrls.default.http[0];
  const publicClient = createPublicClient({ transport: http(rpcUrl) });
  return createSdkClient(config.chainEnv, { publicClient });
}
