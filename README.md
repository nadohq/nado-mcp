# nado-mcp

![version](https://img.shields.io/npm/v/@nadohq/nado-mcp?color=blue)

MCP server for the [Nado Protocol](https://nado.xyz) — perpetual futures, spot trading, and liquidity provision on the Ink blockchain.

Gives AI assistants tools to query market data, manage positions, place orders, and access historical trading data. Works with Cursor, Claude Desktop, VS Code, Windsurf, Codex, Gemini CLI, and any MCP-compatible client.

> [!CAUTION]
> Experimental software. Interacts with the live Nado Protocol on the Ink blockchain and can execute real financial transactions including leveraged perpetual futures. Read [DISCLAIMER.md](DISCLAIMER.md) before using with real funds or AI agents.

## Contents

- [Installation](#installation)
- [MCP Client Setup](#mcp-client-setup)
- [Security](#security)
- [Environment Variables](#environment-variables)
- [Development](#development)
- [Contributing](#contributing)
- [Disclaimer](#disclaimer)

## Installation

No manual install needed. MCP clients like Cursor and Claude Desktop resolve the package automatically when configured with `npx` (see [MCP Client Setup](#mcp-client-setup)).

## MCP Client Setup

### Cursor

Add to your `.cursor/mcp.json` (project-level) or `~/.cursor/mcp.json` (global):

```json
{
  "mcpServers": {
    "nado": {
      "command": "npx",
      "args": ["@nadohq/nado-mcp"],
      "env": {
        "DATA_ENV": "nadoMainnet",
        "PRIVATE_KEY": "0xLINKED_SIGNER_PRIVATE_KEY",
        "SUBACCOUNT_OWNER": "0xMAIN_WALLET_ADDRESS"
      }
    }
  }
}
```

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "nado": {
      "command": "npx",
      "args": ["@nadohq/nado-mcp"],
      "env": {
        "DATA_ENV": "nadoMainnet",
        "PRIVATE_KEY": "0xLINKED_SIGNER_PRIVATE_KEY",
        "SUBACCOUNT_OWNER": "0xMAIN_WALLET_ADDRESS"
      }
    }
  }
}
```

Set `DATA_ENV` to `nadoTestnet` to connect to the [testnet](https://testnet.nado.xyz) instead.

## Security

MCP servers run **locally on your machine** as child processes spawned by the MCP client (Cursor, Claude Desktop, etc.). Communication happens over stdio - there are no open ports and no network exposure. Environment variables like `PRIVATE_KEY` stay on your machine and are never sent to any AI provider; the model only sees tool definitions and tool results.

That said, **never put your main wallet private key in the MCP config.** The config file is stored in plain text on disk, readable by any process running as your user. If accidentally committed to version control, the key is permanently exposed.

The server supports three operating modes, from most to least secure:

### 1. Read-Only Mode (No Key)

Omit `PRIVATE_KEY` entirely. All query tools work (market data, account info, history), but any tool that submits a transaction will return an error.

```json
{
  "env": {
    "DATA_ENV": "nadoMainnet"
  }
}
```

### 2. Linked Signer (Recommended for Mainnet)

Use a **linked signer** — a disposable hot key that is authorized to sign transactions on behalf of your main wallet. Your main wallet key never touches the MCP config.

#### How It Works

Nado allows any subaccount to designate a **linked signer address**. Once linked, the engine accepts EIP-712 signatures from either the subaccount owner or the linked signer for off-chain operations (placing/cancelling orders, withdrawals, transfers).

#### Setup

**Step 1: Generate a hot key**

Any tool that creates an Ethereum keypair will work. Pick whichever you have available:

**Option A - Node.js (no extra install, uses viem from this project)**

```bash
node -e "const{generatePrivateKey,privateKeyToAddress}=require('viem/accounts');const k=generatePrivateKey();console.log('Address: '+privateKeyToAddress(k)+'\nPrivate key: '+k)"
```

**Option B - OpenSSL (available on most systems)**

```bash
openssl rand -hex 32 | awk '{print "0x"$1}'
```

This gives you a private key. To derive the address, paste the key into any wallet (e.g. MetaMask import) or use Option A.

**Option C - Foundry (`cast`)**

If you have [Foundry](https://book.getfoundry.sh/) installed:

```bash
cast wallet new
```

Save the printed address and private key.

**Step 2: Link the hot key to your subaccount**

From your **main wallet**, authorize the hot key address. You can do this via:

- The Nado frontend (Settings → Linked Signer)
- The `link_signer` tool in this MCP server (requires the main key to be configured temporarily)
- A direct contract call

**Step 3: Configure the MCP server**

```json
{
  "env": {
    "DATA_ENV": "nadoMainnet",
    "PRIVATE_KEY": "0xHOT_KEY_PRIVATE_KEY",
    "SUBACCOUNT_OWNER": "0xMAIN_WALLET_ADDRESS"
  }
}
```

`PRIVATE_KEY` is the hot key (used for signing). `SUBACCOUNT_OWNER` is the main wallet (used to identify the subaccount for queries and order parameters).

**Step 4 (if compromised): Revoke**

From your main wallet, call `link_signer` with the zero address (`0x0000000000000000000000000000000000000000`). This immediately invalidates the hot key.

#### What a Linked Signer Can Do

- Place, cancel, and modify orders
- Place trigger orders (stop-loss, take-profit, TWAP)
- Withdraw collateral (off-chain signed via the engine)
- Transfer between subaccounts

#### What a Linked Signer Cannot Do

- Deposit collateral (on-chain `msg.sender` must be the wallet holding the tokens)
- Link or revoke signers (requires the subaccount owner's signature)
- Any on-chain transaction that checks `msg.sender`

#### Limitations

- **No permission scoping**: a linked signer has full access to all off-chain operations, including withdrawals. The security boundary is **revocability**, not restriction. If the key leaks, act fast to revoke it.
- **One signer per subaccount**: each subaccount can have at most one linked signer. Linking a new address replaces the previous one.
- **Rate limits**: linked signers may have separate rate limits from the subaccount owner.

### 3. Direct Key

You can use your wallet key directly. Omit `SUBACCOUNT_OWNER` and the server derives it from `PRIVATE_KEY`:

```json
{
  "env": {
    "DATA_ENV": "nadoMainnet",
    "PRIVATE_KEY": "0xYOUR_PRIVATE_KEY"
  }
}
```

Because MCP servers run locally as child processes with no network exposure, your key never leaves your machine. This is a valid option for users who prefer simplicity over the revocability that a linked signer provides.

That said, the key is stored in plain text in your MCP client config, so keep these risks in mind:

- Any process running as your OS user can read the config file.
- If accidentally committed to version control, the key is permanently exposed.
- If the key is compromised, you must move funds — there is nothing to "revoke".

For mainnet with significant funds, a linked signer (Option 2) is still recommended because it limits the blast radius to a disposable key you can revoke instantly.

## Environment Variables

Set these in the `"env"` block of your MCP client config (recommended). A `.env` file can be used as a fallback for local development.

| Variable           | Required | Default       | Description                                      |
| ------------------ | -------- | ------------- | ------------------------------------------------ |
| `DATA_ENV`         | Yes      | —             | `nadoMainnet` or `nadoTestnet`                   |
| `RPC_URL`          | No       | Chain default | Custom RPC URL                                   |
| `PRIVATE_KEY`      | No       | —             | Private key for signing (linked signer recommended) |
| `SUBACCOUNT_OWNER` | No       | —             | Main wallet address (required when using a linked signer) |
| `SUBACCOUNT_NAME`  | No       | `default`     | Default subaccount name                          |

## Development

```bash
git clone https://github.com/nadohq/nado-mcp.git && cd nado-mcp
bun install
bun run build
```

```bash
bun run dev        # Watch mode
bun run build      # Build for production
bun run typecheck  # Type check
bun run lint       # Lint and format
```

## Contributing

1. Fork the repo and create a feature branch
2. Install dependencies: `bun install`
3. Make your changes and ensure `bun run typecheck && bun run lint:check && bun run build` passes
4. Open a pull request against `main`

## Disclaimer

See [DISCLAIMER.md](DISCLAIMER.md).
