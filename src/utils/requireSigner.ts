import type { NadoClientWithAccount, NadoClientWithSigner } from '../client.js';
import { ToolExecutionError } from './errors.js';

/**
 * Asserts that the client has a configured signer (PRIVATE_KEY).
 * Throws a user-friendly error if write operations are attempted without one.
 */
export function requireSigner(
  toolName: string,
  ctx: NadoClientWithAccount,
): asserts ctx is NadoClientWithSigner {
  if (!ctx.subaccountOwner) {
    throw new ToolExecutionError(
      toolName,
      'PRIVATE_KEY is required for write operations. Set it in the "env" block of your MCP client config (e.g. .cursor/mcp.json).',
    );
  }
}
