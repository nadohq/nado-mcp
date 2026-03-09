# Nado Protocol Guide

## What is Nado?

Nado is a decentralized derivatives exchange (DEX) running on the Ink blockchain. It supports perpetual futures (perps) and spot trading with an off-chain orderbook for speed and an on-chain settlement layer for security.

## Key Concepts

### Products & Markets

- **Spot markets**: Trade tokens directly (e.g. wETH, kBTC). Product IDs are even numbers (0, 2, 4...). Product ID 0 is always the quote token (USDT0).
- **Perp markets**: Perpetual futures contracts that track an underlying asset's price without expiry. Product IDs are odd numbers (1, 3, 5...).
- Each market has a **product ID** (numeric identifier used in all API calls), a **symbol** (human-readable name like "BTC-PERP"), and properties like minimum order size, price increment, and size increment.

### Margin System

Nado uses a **cross-margin** system by default, where all positions in a subaccount share the same collateral pool. This means gains in one position can offset losses in another.

- **Isolated margin** is also available, where a position has its own dedicated margin. If liquidated, only the isolated margin is lost.
- **Initial margin**: The minimum collateral required to open a position. Determined by the initial weight of the product.
- **Maintenance margin**: The minimum collateral required to keep a position open. If equity falls below this, the position can be liquidated.

### Account Health

- **Health** is the key metric for liquidation risk. It represents the difference between your weighted portfolio value and your maintenance margin requirement.
- Positive health means the account is safe. Zero or negative health means the account is eligible for liquidation.
- Health is calculated using **oracle prices** (external price feeds), not orderbook prices.
- **Weight factors** (longWeightInitial, longWeightMaintenance, etc.) determine how much of each asset's value counts toward margin. Lower weights mean higher effective leverage requirements.

### Funding Rate (Perps Only)

- Perp markets use a **funding rate** mechanism to keep perp prices aligned with the underlying asset's index price.
- When the funding rate is **positive**, long position holders pay short holders. When **negative**, shorts pay longs.
- Funding payments are made continuously and accumulate over time. The rate is annualized but applied per second.
- Use the funding rate to understand the cost of holding a position and to identify arbitrage opportunities between perps and spot.

### Price Types

- **Orderbook price** (bid/ask): The current best prices in the off-chain orderbook. This is what you trade at.
- **Oracle price** (index price): The external "truth" price from oracle feeds. Used for margin calculations and liquidations.
- **Mark price**: A smoothed price used to calculate unrealized PnL on perp positions. It's derived from the index price and recent trading activity.
- **Deviation between mark and index prices** can indicate market stress or opportunities.

### NLP Vault

The **Nado Liquidity Provider (NLP) vault** is a protocol-owned liquidity pool that acts as the counterparty to traders on the platform.

- Depositors provide USDT0 to the vault and receive NLP tokens representing their share.
- The vault earns trading fees and PnL from taking the opposite side of user trades.
- Deposits may have a **lock period** before they can be withdrawn.
- The vault is split into **sub-pools**, each with its own weight, positions, and margin health.
- Risk for NLP depositors: if traders collectively profit, the vault loses money (and vice versa).

### Subaccounts

- Each wallet can have multiple **subaccounts**, identified by a name (max 12 bytes, default is "default").
- Each subaccount has its own balances, positions, margin, and orders.
- Use `list_subaccounts` to discover all subaccounts for a wallet.

### Order Types

- **Limit orders**: Resting orders in the orderbook at a specific price. Visible via `get_open_orders`.
- **Market orders**: Execute immediately at the best available price.
- **Trigger orders**: Conditional orders that activate when a price condition is met. Includes stop-loss, take-profit, and TWAP orders. Visible via `get_trigger_orders`.

## Common Workflows

### Check a portfolio

1. `get_subaccount_summary` -- overall health, balances, margin
2. `get_isolated_positions` -- per-position details
3. `get_open_orders` -- pending limit orders
4. `get_trigger_orders` -- stop-loss/take-profit orders

### Analyze a market

1. `get_market_price` -- current bid/ask
2. `get_perp_prices` -- index/mark prices (perps)
3. `get_funding_rate` -- funding rate (perps)
4. `get_market_liquidity` -- orderbook depth
5. `get_tickers` -- 24h volume, price change

### Screen for opportunities

1. `get_tickers` -- all market 24h data
2. `get_multi_product_funding_rates` -- funding rates across all perps
3. `get_multi_product_perp_prices` -- index/mark prices across all perps

### Analyze vault performance

1. `get_nlp_pool_info` -- current vault state (raw sub-pool data)
2. `get_nlp_snapshots` -- historical vault metrics
3. `get_multi_subaccount_snapshots` -- historical snapshots for pool subaccounts (use `subaccountHex` from pool info)

## Computing Derived Fields

Many useful metrics are not returned directly by tools but can be computed from raw data. All amounts from the engine are in **x18** format (multiplied by 10^18). Use `removeDecimals` (divide by 10^18) to convert to human-readable units.

### Entry Price (Perp Positions)

Available from subaccount snapshots (`get_multi_subaccount_snapshots`). Each balance has `trackedVars.netEntryUnrealized`.

```
entryPrice = abs(netEntryUnrealized / amount)
```

Where `amount` is the signed position size in x18.

### Estimated Unrealized PnL (Perp Positions)

```
unrealizedPnl = removeDecimals(amount * oraclePrice - netEntryUnrealized)
```

- `amount`: signed position size (positive for long, negative for short) in x18
- `oraclePrice`: current oracle price from the balance data
- `netEntryUnrealized`: from subaccount snapshot `trackedVars`

### Net Funding (Perp Positions)

Available from subaccount snapshots via `trackedVars.netFundingUnrealized`:

```
netFunding = removeDecimals(netFundingUnrealized)
```

Positive means funding received, negative means funding paid.

### Notional Value

```
notionalValue = abs(removeDecimals(amount)) * oraclePrice
```

### Position Side

```
side = amount > 0 ? "long" : "short"
```

### NLP Vault Aggregation

`get_nlp_pool_info` returns individual sub-pools, each with their own positions and orders. To get a unified vault view, aggregate across all pools:

- **Total position per product**: sum `amount` across all pools for each `productId`
- **Total open orders**: collect `openOrders` from all pools
- **Vault health**: check each pool's `subaccountInfo.health` (initial, maintenance, unweighted)
