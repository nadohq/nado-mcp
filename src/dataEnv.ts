import type { ChainEnv } from '@nadohq/client';

export const ALL_DATA_ENVS = ['nadoTestnet', 'nadoMainnet'] as const;
export type DataEnv = (typeof ALL_DATA_ENVS)[number];

interface DataEnvConfig {
  webBaseUrl: string;
  chainEnvs: ChainEnv[];
  defaultChainEnv: ChainEnv;
}

const DATA_ENV_CONFIG: Record<DataEnv, DataEnvConfig> = {
  nadoTestnet: {
    webBaseUrl: 'https://testnet.nado.xyz',
    chainEnvs: ['inkTestnet'],
    defaultChainEnv: 'inkTestnet',
  },
  nadoMainnet: {
    webBaseUrl: 'https://app.nado.xyz',
    chainEnvs: ['inkMainnet'],
    defaultChainEnv: 'inkMainnet',
  },
};

export function getDataEnvConfig(dataEnv: DataEnv): DataEnvConfig {
  return DATA_ENV_CONFIG[dataEnv];
}

export function getMetadataUrl(dataEnv: DataEnv): string {
  return `${DATA_ENV_CONFIG[dataEnv].webBaseUrl}/api/product-metadata`;
}
