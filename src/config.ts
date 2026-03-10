import { ALL_DATA_ENVS, type DataEnv, getDataEnvConfig } from './dataEnv.js';

import type { ChainEnv } from '@nadohq/client';

/**
 * Server configuration parsed from environment variables.
 * Variables are typically set via the MCP client config (e.g. .cursor/mcp.json "env" block).
 */
export interface ServerConfig {
  dataEnv: DataEnv;
  chainEnv: ChainEnv;
  rpcUrl?: string;
  privateKey?: string;
  /** When using a linked signer, this is the main wallet that owns the subaccount. */
  subaccountOwner?: string;
  subaccountName: string;
}

/**
 * Loads server configuration from environment variables supplied by the MCP client.
 *
 * `DATA_ENV` is required (`nadoTestnet` | `nadoMainnet`).
 * The chain environment is derived automatically from the data env.
 */
export function loadConfig(): ServerConfig {
  const rawDataEnv = process.env.DATA_ENV as DataEnv | undefined;

  if (!rawDataEnv || !ALL_DATA_ENVS.includes(rawDataEnv)) {
    throw new Error(
      `DATA_ENV is required and must be one of: ${ALL_DATA_ENVS.join(', ')}.${rawDataEnv ? ` Got: ${rawDataEnv}` : ''}`,
    );
  }

  const envConfig = getDataEnvConfig(rawDataEnv);

  return {
    dataEnv: rawDataEnv,
    chainEnv: envConfig.defaultChainEnv,
    rpcUrl: process.env.RPC_URL,
    privateKey: process.env.PRIVATE_KEY,
    subaccountOwner: process.env.SUBACCOUNT_OWNER,
    subaccountName: process.env.SUBACCOUNT_NAME ?? 'default',
  };
}
