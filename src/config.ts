/** Supported chain environments for Nado. */
export type ChainEnv = 'inkMainnet' | 'inkTestnet';

/** Server configuration parsed from environment variables. */
export interface ServerConfig {
  chainEnv: ChainEnv;
  rpcUrl?: string;
  privateKey?: string;
  subaccountName: string;
}

const VALID_CHAIN_ENVS = new Set<string>(['inkMainnet', 'inkTestnet']);

/**
 * Loads server configuration from environment variables.
 * @returns Parsed and validated server configuration.
 * @throws {Error} When CHAIN_ENV is missing or invalid.
 */
export function loadConfig(): ServerConfig {
  const chainEnv = process.env.CHAIN_ENV;

  if (!chainEnv || !VALID_CHAIN_ENVS.has(chainEnv)) {
    throw new Error(
      `CHAIN_ENV must be one of: ${[...VALID_CHAIN_ENVS].join(', ')}. Got: ${chainEnv ?? '(not set)'}`,
    );
  }

  return {
    chainEnv: chainEnv as ChainEnv,
    rpcUrl: process.env.RPC_URL || undefined,
    privateKey: process.env.PRIVATE_KEY || undefined,
    subaccountName: process.env.SUBACCOUNT_NAME || 'default',
  };
}
