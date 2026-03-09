import type { NadoClientWithAccount, NadoClientWithSigner } from '../client.js';
import { ToolExecutionError } from './errors.js';

/**
 * Asserts that the client has a configured signer (PRIVATE_KEY) and a resolved
 * subaccount owner. Throws a user-friendly error if either is missing.
 */
export function requireSigner(
  toolName: string,
  ctx: NadoClientWithAccount,
): asserts ctx is NadoClientWithSigner {
  if (!ctx.hasSigner) {
    throw new ToolExecutionError(
      toolName,
      'PRIVATE_KEY is required for write operations. Set it in the "env" block of your MCP client config (e.g. .cursor/mcp.json).',
    );
  }
  if (!ctx.subaccountOwner) {
    throw new ToolExecutionError(
      toolName,
      'Could not determine subaccount owner. Set SUBACCOUNT_OWNER when using a linked signer, or ensure PRIVATE_KEY is correct.',
    );
  }
}
