import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { NADO_DEPLOYMENTS, type ChainEnv } from '@nadohq/client';

import { toJsonContent } from '../utils/formatting.js';

// FRANK: Can just use `ALL_CHAIN_ENVS` - realistically nobody is going to use local
const VALID_ENVS = new Set<string>(['inkMainnet', 'inkTestnet']);

export function registerDeploymentsResource(server: McpServer): void {
  const template = new ResourceTemplate('nado://deployments/{chainEnv}', {
    list: () => ({
      resources: [...VALID_ENVS].map((env) => ({
        uri: `nado://deployments/${env}`,
        name: `Nado Deployments (${env})`,
        description: `Contract addresses for ${env}`,
        mimeType: 'application/json',
      })),
    }),
    complete: {
      chainEnv: (value: string) =>
        [...VALID_ENVS].filter((e) => e.startsWith(value)),
    },
  });

  server.registerResource(
    'deployments',
    template,
    {
      description:
        'Nado smart contract addresses for a given chain environment.',
      mimeType: 'application/json',
    },
    (uri, variables) => {
      const chainEnv = String(variables.chainEnv);
      if (!VALID_ENVS.has(chainEnv)) {
        throw new Error(
          `Invalid chainEnv "${chainEnv}". Must be one of: ${[...VALID_ENVS].join(', ')}`,
        );
      }
      const addresses = NADO_DEPLOYMENTS[chainEnv as ChainEnv];
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: toJsonContent(addresses),
          },
        ],
      };
    },
  );
}
