import type { NadoContext } from '../context';
import { ToolExecutionError } from './errors';

/**
 * Resolves subaccount owner/name from explicit input or falls back to
 * the env-configured values in {@link NadoContext}.
 */
export function resolveSubaccount(
  ctx: NadoContext,
  input: { subaccountOwner?: string; subaccountName?: string },
): { subaccountOwner: string; subaccountName: string } {
  const owner = input.subaccountOwner || ctx.subaccountOwner;
  if (!owner) {
    throw new ToolExecutionError(
      'resolve_subaccount',
      'No wallet address provided and none configured. Set PRIVATE_KEY or SUBACCOUNT_OWNER in your MCP client config.',
    );
  }
  return {
    subaccountOwner: owner,
    subaccountName: input.subaccountName || ctx.subaccountName,
  };
}
