# tools-v2: Thin-Wrapper MCP Architecture

> **Status:** Proof of Concept  
> **Branch:** `feat/thin-wrapper-poc`

## Problem

The v1 tool surface has **49 tools** generating ~18K schema tokens of overhead per LLM context window. The `orderBuilder.ts` (199 lines) reimplements price rounding, x18 conversion, and appendix packing that the SDK already handles. TWAP diverged from the shared builder, proving drift risk.

## Solution: 2+N Architecture

### Read Tools (2 tools → replaces 32 read tools)

| Tool | Purpose |
|------|---------|
| `nado_discover` | **Dynamically** discovers SDK methods via runtime introspection + .d.ts parsing |
| `nado_query` | Calls any SDK read method by name with params |

**Pattern:** Progressive disclosure, inspired by [Cloudflare's Code Mode](https://blog.cloudflare.com/code-mode-mcp/). The LLM calls `nado_discover` to learn what's available, then `nado_query` to execute specific reads.

**Dynamic discovery** — the key improvement over v1:
- SDK methods are enumerated at runtime via prototype walking
- JSDoc descriptions and parameter types are extracted from `.d.ts` files
- When the SDK adds a new read method, the MCP server discovers it **without any code changes**
- No hardcoded catalog to maintain

### Write Tools (5-7 tools → replaces 17 write tools)

| Tool | Replaces |
|------|----------|
| `nado_place_order` | place_order, close_position, close_all_positions |
| `nado_place_trigger_order` | place_trigger_order |
| `nado_place_twap_order` | place_twap_order |
| `nado_cancel_orders` | cancel_orders, cancel_product_orders, cancel_trigger_* |
| `nado_manage_funds` | deposit, withdraw, transfer_quote |
| `nado_manage_nlp` | mint_nlp, burn_nlp |
| `nado_link_signer` | link_signer |

**Why explicit schemas for writes:** Destructive operations need LLM guardrails — typed parameters, descriptions, and safety annotations.

## How Dynamic Discovery Works

### Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    nado_discover                              │
│                                                              │
│  1. Runtime Introspection                                    │
│     Walk NadoClient prototype chains:                        │
│     client.market, client.subaccount, client.spot,           │
│     client.perp, client.context.engineClient,                │
│     client.context.indexerClient                             │
│                                                              │
│  2. .d.ts Parsing                                            │
│     Read TypeScript declaration files from installed SDK:    │
│     - Extract JSDoc comments (method descriptions)           │
│     - Extract parameter type names                           │
│     - Resolve type names to field definitions                │
│                                                              │
│  3. Filter & Cache                                           │
│     - Exclude write methods (place*, cancel*, mint*, etc.)   │
│     - Exclude internal methods (constructor, query, sign)    │
│     - Cache catalog for process lifetime                     │
│                                                              │
│  Result: ~100 read methods with descriptions + param shapes  │
└──────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│                     nado_query                                │
│                                                              │
│  1. Validate method against discover catalog (security)      │
│  2. Resolve "domain.method" → SDK object + function          │
│  3. Apply subaccount defaults from context                   │
│  4. Call the SDK method dynamically                          │
│  5. Serialize result (handles BigNumber, BigInt)             │
└──────────────────────────────────────────────────────────────┘
```

### Domain Mapping

| Domain | SDK Target | .d.ts Source |
|--------|-----------|--------------|
| `market` | `client.market` | MarketQueryAPI.d.ts |
| `subaccount` | `client.subaccount` | SubaccountQueryAPI.d.ts |
| `spot` | `client.spot` | SpotQueryAPI.d.ts |
| `perp` | `client.perp` | PerpQueryAPI.d.ts |
| `engine` | `client.context.engineClient` | EngineQueryClient.d.ts |
| `indexer` | `client.context.indexerClient` | IndexerBaseClient.d.ts + IndexerClient.d.ts |

### Type Resolution Pipeline

```
.d.ts file: getFundingRate(params: GetIndexerFundingRateParams): Promise<...>
    │
    ▼  Extract param type name: "GetIndexerFundingRateParams"
    │
    ▼  Find in type declaration files:
       interface GetIndexerFundingRateParams { productId: number }
    │
    ▼  Resolve to readable shape: "{ productId: number }"
```

For types with inheritance:
```
type GetEngineSubaccountOrdersParams = Subaccount & { productId: number }
    │
    ▼  Resolve Subaccount: { subaccountOwner: string, subaccountName: string }
    │
    ▼  Merge: "{ subaccountOwner: string, subaccountName: string, productId: number }"
```

## What Custom Logic Remains

The MCP server keeps ~80 lines of genuine custom logic:

| Logic | Why SDK Doesn't Handle It |
|-------|---------------------------|
| Price increment rounding | SDK exposes increments but doesn't round |
| Size increment rounding | Same |
| Market order → aggressive limit | SDK has no "market order" concept |
| x18 decimal conversion | SDK exports `addDecimals()` but caller must use it |
| Symbol resolution | SDK has no fuzzy search / alias matching |
| TWAP amount splitting | SDK has no TWAP planner |

Everything else (nonce generation, EIP712 signing, appendix packing, server payload construction) is handled by the SDK.

## File Structure

```
src/tools-v2/
├── README.md                     # This file
├── discover.ts                   # nado_discover — dynamic method catalog via introspection + .d.ts
├── query.ts                      # nado_query — dynamic read dispatcher
├── execute-order.ts              # nado_place_order — order placement
└── utils/
    └── symbolResolver.ts         # Human name → productId + trading params
```

## How It Works

### Read Flow (LLM perspective)

```
User: "What's the ETH funding rate?"

LLM:
  1. nado_discover({ domain: "market", search: "funding" })
     → sees: market.getFundingRate — { productId: number }
  
  2. nado_query({ method: "engine.getSymbols", params: {} })
     → finds ETH-PERP = productId 4
  
  3. nado_query({ method: "market.getFundingRate", params: { productId: 4 } })
     → returns funding rate data
```

### Write Flow (LLM perspective)

```
User: "Buy 0.5 ETH at $2000"

LLM:
  1. [presents summary to user, gets confirmation]
  
  2. nado_place_order({
       market: "ETH-PERP",
       side: "long",
       amount: 0.5,
       price: 2000,
       timeInForce: "gtc"
     })
```

Inside the tool, symbol resolution + price rounding + amount conversion happen automatically.

## Token Budget Comparison

| Metric | v1 (49 tools) | v2 (7-9 tools) |
|--------|---------------|----------------|
| Schema tokens | ~18,000 | ~3,000 |
| Custom logic (lines) | ~330 | ~80 |
| Tools count | 49 | 7-9 |
| New SDK endpoint support | Add new tool file | **Automatic** (zero code changes) |

## Migration Notes

- v2 tools are in `src/tools-v2/` and don't modify v1 tools
- Both can be registered simultaneously for A/B testing
- v2 uses the same `NadoContext` as v1
- Symbol resolver caches engine symbols in-process (cleared on restart)
- The discover catalog is built lazily on first call and cached for process lifetime

## SDK PR Opportunities

If these land upstream, MCP custom logic drops further:

1. **`roundToIncrement(value, increment)`** — generic price/size rounding utility
2. **`placeMarketOrder(productId, side, amount, slippagePct)`** — high-level market order
3. **`planTwapOrder(productId, side, totalAmount, duration, interval)`** — TWAP planning
