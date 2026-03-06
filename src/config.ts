import { ALL_CHAIN_ENVS, type ChainEnv } from '@nadohq/client';

/** Server configuration parsed from environment variables. */
export interface ServerConfig {
  chainEnv: ChainEnv;
  rpcUrl?: string;
  privateKey?: string;
  subaccountName: string;
}

/**
 * Loads server configuration from environment variables.
 * @returns Parsed and validated server configuration.
 * @throws {Error} When CHAIN_ENV is missing or invalid.
 */
export function loadConfig(): ServerConfig {
  const chainEnv = process.env.CHAIN_ENV as ChainEnv | undefined;

  if (!chainEnv || !ALL_CHAIN_ENVS.includes(chainEnv)) {
    throw new Error(
      `CHAIN_ENV must be one of: ${ALL_CHAIN_ENVS.join(', ')}. Got: ${chainEnv ?? '(not set)'}`,
    );
  }

  return {
    chainEnv,
    rpcUrl: process.env.RPC_URL,
    privateKey: process.env.PRIVATE_KEY,
    subaccountName: process.env.SUBACCOUNT_NAME ?? 'default',
  };
}
