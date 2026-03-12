/**
 * nado_discover — Dynamic progressive disclosure read tool
 *
 * Dynamically discovers SDK methods at runtime using:
 *   1. Prototype introspection of the NadoClient sub-clients
 *   2. TypeScript declaration file (.d.ts) parsing for JSDoc descriptions
 *      and parameter type resolution
 *
 * When the SDK adds a new method, this tool picks it up automatically —
 * no code changes needed in the MCP server.
 */
import * as fs from 'fs';
import { createRequire } from 'module';
import * as path from 'path';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { NadoClient } from '@nadohq/client';
import { z } from 'zod';

const require = createRequire(import.meta.url);

import type { NadoContext } from '../context.js';

// ─── Types ────────────────────────────────────────────────────────

interface DiscoveredMethod {
  method: string; // e.g. "market.getFundingRate"
  description: string; // from JSDoc
  params: string; // resolved param shape, e.g. "{ productId: number }"
  requiresSubaccount?: boolean;
}

interface DomainConfig {
  /** Display name in catalog */
  domain: string;
  /** How to get the target object from the client */
  getTarget: (client: NadoClient) => object;
  /** Path to the .d.ts file that contains Query method declarations */
  dtsFiles: string[];
  /** Prefixes that indicate write/execute methods to exclude */
  isWriteMethod?: (name: string) => boolean;
}

// ─── Constants ────────────────────────────────────────────────────

const DomainSchema = z
  .enum(['market', 'subaccount', 'spot', 'perp', 'engine', 'indexer', 'all'])
  .default('all')
  .describe(
    'Filter by domain. Use "all" to see everything, or pick a specific domain.',
  );

const SearchSchema = z
  .string()
  .optional()
  .describe(
    'Optional search term to filter methods (e.g. "funding", "order", "price"). ' +
      'Searches method names and descriptions.',
  );

/** Method name prefixes that indicate write/mutating operations */
const WRITE_PREFIXES = [
  'place',
  'cancel',
  'execute',
  'mint',
  'burn',
  'withdraw',
  'deposit',
  'transfer',
  'link',
  'set',
  'sign',
  'update',
  'setup',
  'check',
  'create',
  'liquidate',
  'approve',
];

/** Method names to always exclude (internal/infrastructure) */
const EXCLUDED_METHODS = new Set([
  'constructor',
  'query',
  'sign',
  'checkResponseStatus',
  'getWalletClientAddress',
  'getWalletClientChainIdIfNeeded',
  'getEndpointAddress',
  'getSubaccountOwnerIfNeeded',
  'paramsWithContracts',
  'getPaginationEventsResponse',
]);

function isWriteMethod(name: string): boolean {
  return WRITE_PREFIXES.some(
    (prefix) =>
      name.startsWith(prefix) && name !== 'getEvents' && name !== 'getOrders',
  );
}

// ─── .d.ts File Parsing ───────────────────────────────────────────

/**
 * Parse a .d.ts file to extract method declarations with JSDoc and param types.
 *
 * Returns a map of methodName → { jsDoc, paramTypeName }
 */
function parseDtsForMethods(
  dtsContent: string,
): Map<string, { jsDoc: string; paramTypeName: string | null }> {
  const methods = new Map<
    string,
    { jsDoc: string; paramTypeName: string | null }
  >();

  // Match JSDoc + method declaration patterns
  // Pattern: optional JSDoc block, then methodName(params?: Type): Promise<...>;
  const methodRegex =
    /(?:\/\*\*([\s\S]*?)\*\/\s*)?(\w+)\s*\(([^)]*)\)\s*:\s*Promise<[^;]+>;/g;

  let match;
  while ((match = methodRegex.exec(dtsContent)) !== null) {
    const [, jsDocRaw, methodName, paramsStr] = match;

    // Skip constructor, protected, private
    if (EXCLUDED_METHODS.has(methodName)) continue;

    // Extract JSDoc description (clean up * prefixes and whitespace)
    let jsDoc = '';
    if (jsDocRaw) {
      jsDoc = jsDocRaw
        .split('\n')
        .map((line) => line.replace(/^\s*\*\s?/, '').trim())
        .filter(
          (line) =>
            line && !line.startsWith('@param') && !line.startsWith('@returns'),
        )
        .join(' ')
        .trim();
    }

    // Extract param type name
    let paramTypeName: string | null = null;
    if (paramsStr.trim()) {
      // Match patterns like: params: GetEngineMarketPriceParams
      // Also handle destructured params: { address, ...rest }: GetTokenWalletBalanceParams
      const paramTypeMatch = paramsStr.match(
        /(?:\w+|{[^}]+})\s*:\s*([A-Z]\w+)/,
      );
      if (paramTypeMatch) {
        paramTypeName = paramTypeMatch[1];
      }
    }

    methods.set(methodName, { jsDoc, paramTypeName });
  }

  return methods;
}

/**
 * Build a map of TypeName → field definition string from .d.ts files.
 *
 * Handles:
 *   - interface X { field: type; ... }
 *   - type X = Y (alias)
 *   - type X = Y & { ... } (intersection)
 *   - interface X extends Y { ... }
 */
function buildTypeMap(
  dtsContent: string,
  existingMap?: Map<string, string>,
): Map<string, string> {
  const types = existingMap ?? new Map<string, string>();

  // Match interface declarations
  const interfaceRegex =
    /interface\s+(\w+)(?:\s+extends\s+([\w,\s]+))?\s*\{([^}]*)\}/g;
  let match;
  while ((match = interfaceRegex.exec(dtsContent)) !== null) {
    const [, name, extendsClause, body] = match;
    const fields = extractFields(body);
    const parentFields = extendsClause
      ? extendsClause
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    types.set(name, JSON.stringify({ extends: parentFields, fields }));
  }

  // Match type aliases: type X = Y;
  const typeAliasRegex = /type\s+(\w+Params)\s*=\s*([^;]+);/g;
  while ((match = typeAliasRegex.exec(dtsContent)) !== null) {
    const [, name, definition] = match;
    types.set(name, definition.trim());
  }

  return types;
}

/**
 * Extract field definitions from an interface body.
 */
function extractFields(
  body: string,
): Array<{ name: string; type: string; optional: boolean }> {
  const fields: Array<{ name: string; type: string; optional: boolean }> = [];

  // Match: fieldName?: type;  or  fieldName: type;
  const fieldRegex = /(\w+)(\?)?:\s*([^;]+);/g;
  let match;
  while ((match = fieldRegex.exec(body)) !== null) {
    const [, name, optional, type] = match;
    fields.push({
      name,
      type: type.trim(),
      optional: !!optional,
    });
  }

  return fields;
}

/**
 * Resolve a param type name to a human-readable params string.
 */
function resolveParamType(
  typeName: string,
  typeMap: Map<string, string>,
): string {
  const definition = typeMap.get(typeName);
  if (!definition) return `(${typeName})`;

  // Check if it's a JSON-encoded interface definition
  if (definition.startsWith('{')) {
    try {
      const parsed = JSON.parse(definition) as {
        extends: string[];
        fields: Array<{ name: string; type: string; optional: boolean }>;
      };

      // Resolve parent fields
      const allFields: Array<{
        name: string;
        type: string;
        optional: boolean;
      }> = [];

      for (const parent of parsed.extends) {
        const parentDef = typeMap.get(parent);
        if (parentDef?.startsWith('{')) {
          const parentParsed = JSON.parse(parentDef) as {
            fields: Array<{ name: string; type: string; optional: boolean }>;
          };
          allFields.push(...parentParsed.fields);
        } else if (parentDef) {
          // It's a type alias, try to resolve recursively
          const resolved = resolveParamType(parent, typeMap);
          if (resolved !== `(${parent})`) {
            return resolved; // Use parent's resolution if it's just an alias
          }
        }
      }

      allFields.push(...parsed.fields);

      if (allFields.length === 0 && parsed.extends.length > 0) {
        // Pure alias to parent type
        return resolveParamType(parsed.extends[0], typeMap);
      }

      return formatFields(allFields);
    } catch {
      return `(${typeName})`;
    }
  }

  // It's a type alias or intersection
  // Handle: Subaccount & { txs: SubaccountTx[]; preState?: boolean }
  if (definition.includes('&')) {
    const parts = definition.split('&').map((s) => s.trim());
    const allFields: Array<{
      name: string;
      type: string;
      optional: boolean;
    }> = [];

    for (const part of parts) {
      if (part.startsWith('{')) {
        allFields.push(...extractFields(part.slice(1, -1)));
      } else {
        // Resolve the type alias
        const parentDef = typeMap.get(part);
        if (parentDef?.startsWith('{')) {
          const parsedParent = JSON.parse(parentDef) as {
            fields: Array<{ name: string; type: string; optional: boolean }>;
          };
          allFields.push(...parsedParent.fields);
        }
      }
    }

    if (allFields.length > 0) return formatFields(allFields);
  }

  // Simple alias: type X = Y
  if (typeMap.has(definition)) {
    return resolveParamType(definition, typeMap);
  }

  return `(${typeName})`;
}

function formatFields(
  fields: Array<{ name: string; type: string; optional: boolean }>,
): string {
  if (fields.length === 0) return '{}';
  const parts = fields.map(
    (f) => `${f.name}${f.optional ? '?' : ''}: ${simplifyType(f.type)}`,
  );
  return `{ ${parts.join(', ')} }`;
}

/**
 * Simplify complex TS types for readability.
 */
function simplifyType(type: string): string {
  // Simplify BigDecimal to string
  return type
    .replace(/BigDecimal/g, 'string')
    .replace(/CandlestickPeriod/g, 'number')
    .replace(/ProductEngineType/g, '"spot"|"perp"')
    .replace(/IndexerEventType\[\]/g, 'string[]')
    .replace(
      /Subaccount\[\]/g,
      'Array<{subaccountOwner: string, subaccountName: string}>',
    )
    .replace(
      /Subaccount/g,
      '{subaccountOwner: string, subaccountName: string}',
    );
}

// ─── Dynamic Catalog Builder ──────────────────────────────────────

/** Cached catalog, built once per process */
let cachedCatalog: Record<string, DiscoveredMethod[]> | null = null;

/**
 * Get the prototype methods of an object, walking up the chain.
 * Excludes Object.prototype methods.
 */
function getPrototypeMethods(obj: object): string[] {
  const methods = new Set<string>();
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  let proto: Record<string, unknown> | null = Object.getPrototypeOf(obj);

  while (proto && proto !== Object.prototype) {
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (
        name !== 'constructor' &&
        typeof proto[name] === 'function' &&
        !name.startsWith('_')
      ) {
        methods.add(name);
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    proto = Object.getPrototypeOf(proto);
  }

  return [...methods];
}

/**
 * Read and parse .d.ts files to build method metadata.
 */
function loadDtsMetadata(dtsFiles: string[]): {
  methodMeta: Map<string, { jsDoc: string; paramTypeName: string | null }>;
  typeMap: Map<string, string>;
} {
  const methodMeta = new Map<
    string,
    { jsDoc: string; paramTypeName: string | null }
  >();
  const typeMap = new Map<string, string>();

  for (const dtsFile of dtsFiles) {
    try {
      const content = fs.readFileSync(dtsFile, 'utf-8');
      const methods = parseDtsForMethods(content);
      for (const [name, meta] of methods) {
        // Don't overwrite — first match wins (query API takes priority)
        if (!methodMeta.has(name)) {
          methodMeta.set(name, meta);
        }
      }
      buildTypeMap(content, typeMap);
    } catch {
      // File not found — skip silently
    }
  }

  return { methodMeta, typeMap };
}

/**
 * Load type definitions from the known param type files.
 */
function loadGlobalTypeMap(): Map<string, string> {
  const typeMap = new Map<string, string>();

  // Resolve package dist directories
  const typeFiles = [
    // Engine client types
    findPackageFile(
      '@nadohq/engine-client',
      'dist/types/clientQueryTypes.d.ts',
    ),
    findPackageFile(
      '@nadohq/engine-client',
      'dist/types/serverQueryTypes.d.ts',
    ),
    // Indexer client types
    findPackageFile('@nadohq/indexer-client', 'dist/types/clientTypes.d.ts'),
    // Shared types
    findPackageFile('@nadohq/shared', 'dist/types/subaccountTypes.d.ts'),
    // Trigger client types
    findPackageFile('@nadohq/trigger-client', 'dist/types/clientTypes.d.ts'),
    // Client API types
    findPackageFile('@nadohq/client', 'dist/apis/market/types.d.ts'),
    findPackageFile('@nadohq/client', 'dist/apis/spot/types.d.ts'),
    findPackageFile('@nadohq/client', 'dist/apis/subaccount/types.d.ts'),
    // Indexer paginated event types
    findPackageFile(
      '@nadohq/indexer-client',
      'dist/types/paginatedEventsTypes.d.ts',
    ),
  ].filter(Boolean) as string[];

  for (const file of typeFiles) {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      buildTypeMap(content, typeMap);
    } catch {
      // Skip missing files
    }
  }

  // Add well-known types that aren't in Params interfaces
  typeMap.set(
    'Subaccount',
    JSON.stringify({
      extends: [],
      fields: [
        { name: 'subaccountOwner', type: 'string', optional: false },
        { name: 'subaccountName', type: 'string', optional: false },
      ],
    }),
  );

  return typeMap;
}

/**
 * Find a file within an installed npm package.
 * Uses require.resolve to find the package, then navigates from there.
 */
function findPackageFile(
  packageName: string,
  relativePath: string,
): string | null {
  try {
    // Resolve the package's main entry point
    const entryPath = require.resolve(packageName);

    // Navigate to package root (walk up from dist/index.js until we find package.json)
    let pkgDir = path.dirname(entryPath);
    for (let i = 0; i < 5; i++) {
      if (fs.existsSync(path.join(pkgDir, 'package.json'))) break;
      pkgDir = path.dirname(pkgDir);
    }

    const filePath = path.join(pkgDir, relativePath);
    return fs.existsSync(filePath) ? filePath : null;
  } catch {
    return null;
  }
}

/**
 * Domain configurations mapping domain names to SDK targets and .d.ts files.
 */
function getDomainConfigs(_client: NadoClient): DomainConfig[] {
  return [
    {
      domain: 'market',
      getTarget: (c) => c.market,
      dtsFiles: [
        findPackageFile(
          '@nadohq/client',
          'dist/apis/market/MarketQueryAPI.d.ts',
        ),
        findPackageFile(
          '@nadohq/client',
          'dist/apis/market/MarketExecuteAPI.d.ts',
        ),
      ].filter(Boolean) as string[],
    },
    {
      domain: 'subaccount',
      getTarget: (c) => c.subaccount,
      dtsFiles: [
        findPackageFile(
          '@nadohq/client',
          'dist/apis/subaccount/SubaccountQueryAPI.d.ts',
        ),
        findPackageFile(
          '@nadohq/client',
          'dist/apis/subaccount/SubaccountExecuteAPI.d.ts',
        ),
      ].filter(Boolean) as string[],
    },
    {
      domain: 'spot',
      getTarget: (c) => c.spot,
      dtsFiles: [
        findPackageFile('@nadohq/client', 'dist/apis/spot/SpotQueryAPI.d.ts'),
        findPackageFile('@nadohq/client', 'dist/apis/spot/SpotExecuteAPI.d.ts'),
      ].filter(Boolean) as string[],
    },
    {
      domain: 'perp',
      getTarget: (c) => c.perp,
      dtsFiles: [
        findPackageFile('@nadohq/client', 'dist/apis/perp/PerpQueryAPI.d.ts'),
        findPackageFile('@nadohq/client', 'dist/apis/perp/PerpExecuteAPI.d.ts'),
      ].filter(Boolean) as string[],
    },
    {
      domain: 'engine',
      getTarget: (c) => c.context.engineClient,
      dtsFiles: [
        findPackageFile('@nadohq/engine-client', 'dist/EngineQueryClient.d.ts'),
        findPackageFile(
          '@nadohq/engine-client',
          'dist/EngineExecuteClient.d.ts',
        ),
      ].filter(Boolean) as string[],
    },
    {
      domain: 'indexer',
      getTarget: (c) => c.context.indexerClient,
      dtsFiles: [
        findPackageFile(
          '@nadohq/indexer-client',
          'dist/IndexerBaseClient.d.ts',
        ),
        findPackageFile('@nadohq/indexer-client', 'dist/IndexerClient.d.ts'),
      ].filter(Boolean) as string[],
    },
  ];
}

/**
 * Build the dynamic method catalog by introspecting the SDK client.
 */
function buildCatalog(client: NadoClient): Record<string, DiscoveredMethod[]> {
  const globalTypeMap = loadGlobalTypeMap();
  const catalog: Record<string, DiscoveredMethod[]> = {};
  const configs = getDomainConfigs(client);

  for (const config of configs) {
    const target = config.getTarget(client);
    const runtimeMethods = getPrototypeMethods(target);

    // Load .d.ts metadata for this domain
    const { methodMeta, typeMap: localTypeMap } = loadDtsMetadata(
      config.dtsFiles,
    );

    // Merge local types into global map
    const mergedTypeMap = new Map([...globalTypeMap, ...localTypeMap]);

    const methods: DiscoveredMethod[] = [];

    for (const methodName of runtimeMethods) {
      // Skip excluded and write methods
      if (EXCLUDED_METHODS.has(methodName)) continue;
      if (isWriteMethod(methodName)) continue;

      // Get metadata from .d.ts
      const meta = methodMeta.get(methodName);

      // Resolve parameter type
      let params = '{}';
      let requiresSubaccount = false;

      if (meta?.paramTypeName) {
        params = resolveParamType(meta.paramTypeName, mergedTypeMap);
        // Check if params include subaccount fields
        requiresSubaccount =
          params.includes('subaccountOwner') ||
          params.includes('subaccountName') ||
          meta.paramTypeName.includes('Subaccount');
      }

      const description = meta?.jsDoc || `Calls ${config.domain}.${methodName}`;

      methods.push({
        method: `${config.domain}.${methodName}`,
        description,
        params,
        ...(requiresSubaccount ? { requiresSubaccount: true } : {}),
      });
    }

    // Sort alphabetically for stable output
    methods.sort((a, b) => a.method.localeCompare(b.method));

    if (methods.length > 0) {
      catalog[config.domain] = methods;
    }
  }

  return catalog;
}

// ─── Tool Registration ────────────────────────────────────────────

export function registerDiscoverTool(
  server: McpServer,
  ctx: NadoContext,
): void {
  server.registerTool(
    'nado_discover',
    {
      title: 'Discover Nado SDK Methods',
      description:
        'Dynamically discovers available Nado SDK read methods with parameter signatures. ' +
        'Methods are auto-detected from the installed SDK — no manual catalog needed. ' +
        'Use this FIRST to discover what data is available, then call nado_query to execute. ' +
        'Filter by domain (market, subaccount, spot, perp, engine, indexer) or search by keyword.',
      inputSchema: {
        domain: DomainSchema,
        search: SearchSchema,
      },
      annotations: { readOnlyHint: true },
    },
    ({ domain, search }: { domain: string; search?: string }) => {
      // Build catalog lazily on first call
      if (!cachedCatalog) {
        cachedCatalog = buildCatalog(ctx.client);
      }

      // Filter by domain
      const domains = domain === 'all' ? Object.keys(cachedCatalog) : [domain];

      let catalog: Record<string, DiscoveredMethod[]> = {};
      for (const d of domains) {
        if (cachedCatalog[d]) {
          catalog[d] = cachedCatalog[d];
        }
      }

      // Apply search filter if provided
      if (search) {
        const searchLower = search.toLowerCase();
        const filtered: Record<string, DiscoveredMethod[]> = {};
        for (const [d, methods] of Object.entries(catalog)) {
          const matching = methods.filter(
            (m) =>
              m.method.toLowerCase().includes(searchLower) ||
              m.description.toLowerCase().includes(searchLower),
          );
          if (matching.length > 0) {
            filtered[d] = matching;
          }
        }
        catalog = filtered;
      }

      const totalMethods = Object.values(catalog).reduce(
        (sum, methods) => sum + methods.length,
        0,
      );

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                totalMethods,
                hint: 'Call nado_query with { method: "<method>", params: {...} } to execute any of these. Subaccount owner/name default to the configured account if not provided.',
                ...(search ? { searchTerm: search } : {}),
                methods: catalog,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}

/**
 * Get the set of discovered read method paths.
 * Used by the query dispatcher to validate method calls.
 */
export function getDiscoveredMethods(client: NadoClient): Set<string> {
  if (!cachedCatalog) {
    cachedCatalog = buildCatalog(client);
  }
  const methods = new Set<string>();
  for (const domainMethods of Object.values(cachedCatalog)) {
    for (const m of domainMethods) {
      methods.add(m.method);
    }
  }
  return methods;
}

/**
 * Invalidate the cached catalog (e.g. if SDK is hot-reloaded).
 */
export function clearCatalogCache(): void {
  cachedCatalog = null;
}
