/**
 * nado_query — Dynamic SDK read dispatcher
 *
 * Calls any SDK read method by name with params. Replaces the static
 * QUERY_HANDLERS map with dynamic method resolution.
 *
 * The LLM discovers available methods via nado_discover, then calls this tool
 * with the method path and parameters.
 *
 * Security: Only methods present in the discover catalog (read-only) are callable.
 * Write methods are handled by dedicated thin-wrapper tools with explicit schemas.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { NadoClient } from '@nadohq/client';
import { z } from 'zod';

import type { NadoContext } from '../context.js';
import { getDiscoveredMethods } from './discover.js';

// ─── Domain Resolution ────────────────────────────────────────────

/**
 * Map of domain names to the SDK object that handles methods in that domain.
 */
function resolveTarget(client: NadoClient, domain: string): object | null {
  switch (domain) {
    case 'market':
      return client.market;
    case 'subaccount':
      return client.subaccount;
    case 'spot':
      return client.spot;
    case 'perp':
      return client.perp;
    case 'engine':
      return client.context.engineClient;
    case 'indexer':
      return client.context.indexerClient;
    default:
      return null;
  }
}

// ─── Subaccount Defaults ──────────────────────────────────────────

/**
 * Inject subaccount defaults from context into params when applicable.
 *
 * Handles two common patterns in the SDK:
 *   1. Flat params: { subaccountOwner, subaccountName, ... }
 *   2. Nested params: { subaccount: { subaccountOwner, subaccountName }, ... }
 */
function applySubaccountDefaults(
  ctx: NadoContext,
  params: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...params };

  // Pattern 1: flat subaccountOwner/subaccountName
  if (
    'subaccountOwner' in result ||
    'subaccountName' in result ||
    needsSubaccountFlat(result)
  ) {
    if (!result.subaccountOwner && ctx.subaccountOwner) {
      result.subaccountOwner = ctx.subaccountOwner;
    }
    if (!result.subaccountName) {
      result.subaccountName = ctx.subaccountName ?? 'default';
    }
  }

  // Pattern 2: nested { subaccount: { ... } }
  if ('subaccount' in result && typeof result.subaccount === 'object') {
    const sub = result.subaccount as Record<string, unknown>;
    if (!sub.subaccountOwner && ctx.subaccountOwner) {
      sub.subaccountOwner = ctx.subaccountOwner;
    }
    if (!sub.subaccountName) {
      sub.subaccountName = ctx.subaccountName ?? 'default';
    }
  }

  // Pattern 3: subaccounts array — fill defaults for each
  if (Array.isArray(result.subaccounts)) {
    result.subaccounts = (
      result.subaccounts as Array<Record<string, unknown>>
    ).map((sub) => ({
      subaccountOwner: sub.subaccountOwner ?? ctx.subaccountOwner ?? '',
      subaccountName: sub.subaccountName ?? ctx.subaccountName ?? 'default',
      ...sub,
    }));
  }

  return result;
}

/**
 * Heuristic: does this call likely need subaccount fields?
 * Used when the LLM passes an empty {} but the method needs subaccount info.
 */
function needsSubaccountFlat(_params: Record<string, unknown>): boolean {
  // We can't know for sure without type info, but the discover tool
  // tells the LLM which methods need subaccount. If params are empty
  // and method requires subaccount, the SDK will throw a clear error.
  return false;
}

// ─── Custom JSON Serialization ────────────────────────────────────

/**
 * Custom replacer for JSON.stringify that handles BigInt and BigNumber.
 */
function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  // BigNumber instances from bignumber.js
  if (
    value &&
    typeof value === 'object' &&
    's' in value &&
    'e' in value &&
    'c' in value
  ) {
    return (value as { toString(): string }).toString();
  }
  return value;
}

// ─── Tool Registration ────────────────────────────────────────────

export function registerQueryTool(server: McpServer, ctx: NadoContext): void {
  server.registerTool(
    'nado_query',
    {
      title: 'Query Nado SDK',
      description:
        'Execute any Nado SDK read method. Use nado_discover first to see available methods. ' +
        'Pass the method path (e.g. "market.getLatestMarketPrice") and its params. ' +
        'Subaccount owner/name default to the configured account if not provided.',
      inputSchema: {
        method: z
          .string()
          .describe(
            'SDK method path, e.g. "market.getLatestMarketPrice", "engine.getSymbols"',
          ),
        params: z
          .record(z.string(), z.unknown())
          .default({})
          .describe('Method parameters as a JSON object'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({
      method,
      params,
    }: {
      method: string;
      params: Record<string, unknown>;
    }) => {
      // Parse method path: "domain.methodName"
      const dotIndex = method.indexOf('.');
      if (dotIndex === -1) {
        throw new Error(
          `Invalid method path "${method}". Expected format: "domain.methodName" (e.g. "market.getFundingRate")`,
        );
      }

      const domain = method.slice(0, dotIndex);
      const methodName = method.slice(dotIndex + 1);

      // Security: validate method is in the discovered read-only catalog
      const discoveredMethods = getDiscoveredMethods(ctx.client);
      if (!discoveredMethods.has(method)) {
        // Generate helpful error with suggestions
        const suggestions = [...discoveredMethods]
          .filter(
            (m) =>
              m.startsWith(`${domain}.`) ||
              m.toLowerCase().includes(methodName.toLowerCase()),
          )
          .slice(0, 10);

        throw new Error(
          `Unknown or disallowed method "${method}". ` +
            (suggestions.length > 0
              ? `Did you mean one of:\n  ${suggestions.join('\n  ')}`
              : `Use nado_discover to see available methods.`),
        );
      }

      // Resolve the target object for this domain
      const target = resolveTarget(ctx.client, domain);
      if (!target) {
        throw new Error(
          `Unknown domain "${domain}". Available: market, subaccount, spot, perp, engine, indexer`,
        );
      }

      // Get the method function
      const fn = (target as Record<string, unknown>)[methodName];
      if (typeof fn !== 'function') {
        throw new Error(
          `Method "${methodName}" not found on ${domain} client. Use nado_discover to see available methods.`,
        );
      }

      // Apply subaccount defaults
      const resolvedParams = applySubaccountDefaults(ctx, params);

      try {
        // Call the method — bind to the target to preserve `this`.
        // Always pass the params object (even if empty) because SDK methods
        // with optional params expect an object, not undefined. For zero-arg
        // methods, the extra argument is harmlessly ignored by JavaScript.

        const result: unknown = await fn.call(target, resolvedParams);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result, jsonReplacer, 2),
            },
          ],
        };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : JSON.stringify(err);
        throw new Error(`nado_query("${method}") failed: ${message}`);
      }
    },
  );
}
