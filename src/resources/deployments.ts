import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  ALL_CHAIN_ENVS,
  NADO_DEPLOYMENTS,
  type ChainEnv,
} from '@nadohq/client';

import { toJsonContent } from '../utils/formatting';

export function registerDeploymentsResource(server: McpServer): void {
  const template = new ResourceTemplate('nado://deployments/{chainEnv}', {
    list: () => ({
      resources: ALL_CHAIN_ENVS.map((env) => ({
        uri: `nado://deployments/${env}`,
        name: `Nado Deployments (${env})`,
        description: `Contract addresses for ${env}`,
        mimeType: 'application/json',
      })),
    }),
    complete: {
      chainEnv: (value: string) =>
        ALL_CHAIN_ENVS.filter((e) => e.startsWith(value)),
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
      const chainEnv = String(variables.chainEnv) as ChainEnv;
      const addresses = NADO_DEPLOYMENTS[chainEnv];
      if (!addresses) {
        throw new Error(
          `Invalid chainEnv "${chainEnv}". Must be one of: ${ALL_CHAIN_ENVS.join(', ')}`,
        );
      }
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
