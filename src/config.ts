import type { ChainEnv } from '@nadohq/client';
import { ALL_CHAIN_ENVS } from '@nadohq/client';

import { ALL_DATA_ENVS, type DataEnv, getDataEnvConfig } from './dataEnv.js';

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
 * Primary config is `DATA_ENV` (`nadoTestnet` | `nadoMainnet`).
 * Optionally override the chain with `CHAIN_ENV` (must belong to the data env).
 * For backwards compatibility, `CHAIN_ENV` alone is accepted and mapped to the
 * appropriate `DataEnv`.
 *
 * @returns Parsed and validated server configuration.
 */
export function loadConfig(): ServerConfig {
  const rawDataEnv = process.env.DATA_ENV as DataEnv | undefined;
  const rawChainEnv = process.env.CHAIN_ENV as ChainEnv | undefined;

  let dataEnv: DataEnv;
  let chainEnv: ChainEnv;

  if (rawDataEnv) {
    if (!ALL_DATA_ENVS.includes(rawDataEnv)) {
      throw new Error(
        `DATA_ENV must be one of: ${ALL_DATA_ENVS.join(', ')}. Got: ${rawDataEnv}`,
      );
    }
    dataEnv = rawDataEnv;
    const envConfig = getDataEnvConfig(dataEnv);

    if (rawChainEnv) {
      if (!envConfig.chainEnvs.includes(rawChainEnv)) {
        throw new Error(
          `CHAIN_ENV "${rawChainEnv}" is not valid for DATA_ENV "${dataEnv}". Valid: ${envConfig.chainEnvs.join(', ')}`,
        );
      }
      chainEnv = rawChainEnv;
    } else {
      chainEnv = envConfig.defaultChainEnv;
    }
  } else if (rawChainEnv) {
    if (!ALL_CHAIN_ENVS.includes(rawChainEnv)) {
      throw new Error(
        `CHAIN_ENV must be one of: ${ALL_CHAIN_ENVS.join(', ')}. Got: ${rawChainEnv}`,
      );
    }
    chainEnv = rawChainEnv;
    const matched = ALL_DATA_ENVS.find((de) =>
      getDataEnvConfig(de).chainEnvs.includes(chainEnv),
    );
    if (!matched) {
      throw new Error(
        `Could not determine DATA_ENV for CHAIN_ENV "${chainEnv}". Set DATA_ENV explicitly.`,
      );
    }
    dataEnv = matched;
  } else {
    throw new Error(
      `Either DATA_ENV (${ALL_DATA_ENVS.join(', ')}) or CHAIN_ENV (${ALL_CHAIN_ENVS.join(', ')}) must be set.`,
    );
  }

  return {
    dataEnv,
    chainEnv,
    rpcUrl: process.env.RPC_URL,
    privateKey: process.env.PRIVATE_KEY,
    subaccountOwner: process.env.SUBACCOUNT_OWNER,
    subaccountName: process.env.SUBACCOUNT_NAME ?? 'default',
  };
}
