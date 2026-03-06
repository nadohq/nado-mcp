import type { NadoClientWithAccount } from '../client.js';
import { ToolExecutionError } from './errors.js';

type NadoClientWithSigner = NadoClientWithAccount &
  Required<Pick<NadoClientWithAccount, 'subaccountOwner'>>;

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
      'PRIVATE_KEY env var is required for write operations. Set it in your MCP server configuration.',
    );
  }
}
