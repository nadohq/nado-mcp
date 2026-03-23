# Disclaimer (MCP)

## Experimental Software

This software is experimental and under active development. It is provided "as is" without warranty of any kind, express or implied. Use it at your own risk.

## Not Financial Advice

The Nado MCP server ("this tool") provides a programmatic interface to the Nado decentralized exchange. It does not provide financial advice, trading recommendations, or investment guidance. It executes commands exactly as instructed, whether those commands originate from a user, an AI agent, or any other MCP client. Any trading decisions are yours alone.

## Real Assets, Real Risk

Commands executed through this tool interact with Nado's live decentralized exchange protocols and can result in real financial transactions. Swaps, transfers, liquidity operations, and other on-chain actions are irreversible once confirmed on the blockchain. Incorrect commands, software bugs, smart contract vulnerabilities, or client errors can result in partial or total loss of funds.

Before using this tool with real assets:

- Test your workflows on supported testnets when available.
- Validate transactions before signing and broadcasting.
- Use wallet connections and API credentials with only the permissions you need.
- Start with small amounts.
- Understand the smart contracts and protocols you are interacting with.

## AI Agent and MCP Client Use

This tool is designed to be consumed by MCP clients, including AI agents, automated systems, and other software. When used in this way, the same risks apply. The client executes commands based on its programming and the instructions it receives. Neither the MCP server nor the client validates whether a trade or transaction is financially sound.

If you grant an AI agent or other MCP client access to your wallet or credentials:

- You are responsible for all actions the client takes on your behalf.
- The client can initiate swaps, provide or remove liquidity, approve token spending, and execute other on-chain transactions as permitted by the granted access.
- Use the [Dangerous] field in the tool catalog to identify high-risk operations.
- Restrict wallet permissions and token approvals to the minimum necessary for your use case.
- Monitor agent sessions actively; do not leave agents unattended with broad transaction authority.

## Decentralized Exchange Risks

In addition to the risks above, use of a decentralized exchange carries inherent risks including but not limited to:

- Smart contract bugs or exploits.
- Impermanent loss when providing liquidity.
- Slippage, front-running, and MEV (maximal extractable value) attacks.
- Token contract risks, including malicious or compromised tokens.
- Network congestion, failed transactions, and gas fee volatility.
- Regulatory uncertainty in your jurisdiction.

You are solely responsible for understanding these risks before transacting.

## Liability

Spira Arc Inc., its authors, and contributors accept no liability for financial losses, failed transactions, incorrect executions, smart contract exploits, or any other damages resulting from the use of this software, whether invoked manually, through an AI agent, or through any other MCP client.

This software is provided without any guarantee of uptime, accuracy, or fitness for a particular purpose.

## Support and Responsible Disclosure

This tool is open-sourced under the MIT license by Spira Arc Inc. (Nado). For security vulnerabilities, please follow responsible disclosure practices and contact the team directly before filing a public issue, by contacting us through [Zendesk](https://nado-90114.zendesk.com/hc/en-us/requests/new?ticket_form_id=52275013155481). You can also make bug reports and feature requests through Zendesk.

## Credential and Wallet Security

Your API credentials, wallet private keys, and seed phrases grant access to your funds. Treat them like passwords:

- Never share them in public repositories, logs, or chat messages.
- Never pass secrets through insecure channels — use environment variables, secure vaults, or other appropriate secret management methods supported by your MCP client.
- Rotate API keys regularly.
- Use the most restrictive permissions and token approvals possible for your use case.
- Revoke token approvals and API access when no longer needed.
