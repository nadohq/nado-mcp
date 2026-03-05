# nado-mcp

MCP (Model Context Protocol) server for interacting with [Nado](https://nado.xyz). Provides AI assistants with tools to query market data, subaccount information, and historical trading data.

## Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [Bun](https://bun.sh/) (package manager & runtime)

## Quick Start

```bash
git clone <repo-url> && cd nado-mcp
bun install
bun run build
```

That's it — the built server is at `dist/index.js`. No `.env` file is needed when you pass environment variables through your MCP client config (see below).

## MCP Client Setup

### Cursor

Add to your `.cursor/mcp.json` (project-level) or `~/.cursor/mcp.json` (global):

```json
{
  "mcpServers": {
    "nado": {
      "command": "node",
      "args": ["/absolute/path/to/nado-mcp/dist/index.js"],
      "env": {
        "CHAIN_ENV": "inkMainnet"
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
      "command": "node",
      "args": ["/absolute/path/to/nado-mcp/dist/index.js"],
      "env": {
        "CHAIN_ENV": "inkMainnet"
      }
    }
  }
}
```

Replace `/absolute/path/to/nado-mcp` with the actual path where you cloned the repo. Set `CHAIN_ENV` to `inkTestnet` to connect to the [testnet](https://testnet.nado.xyz) instead.

## Environment Variables

You can pass these as `env` in the MCP client config above, or create a `.env` file (copy from `.env.example`):

| Variable          | Required | Default       | Description                                      |
| ----------------- | -------- | ------------- | ------------------------------------------------ |
| `CHAIN_ENV`       | Yes      | —             | `inkMainnet` ([app.nado.xyz](https://app.nado.xyz)) or `inkTestnet` ([testnet.nado.xyz](https://testnet.nado.xyz)) |
| `RPC_URL`         | No       | Chain default | Custom RPC URL                                   |
| `PRIVATE_KEY`     | No       | —             | Private key for write operations (Phase 2)       |
| `SUBACCOUNT_NAME` | No       | `default`     | Default subaccount name                          |

When `PRIVATE_KEY` is not set, the server runs in **read-only mode**.

## Development

```bash
bun run dev        # Watch mode
bun run build      # Build for production
bun run typecheck  # Type check
bun run lint       # Lint and format
```

## Architecture

The server follows a modular registration pattern:

- **`src/tools/`** — MCP tools wrapping NadoClient query methods
- **`src/resources/`** — Static/semi-static data exposed as MCP resources
- **`src/prompts/`** — Reusable prompt templates for common workflows
- **`src/utils/`** — Shared schemas, error classes, and formatting utilities

Each tool/resource/prompt is registered on the McpServer instance during startup via its module's `register*` function.
