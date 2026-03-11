/**
 * Redacts 32-byte hex strings (0x + 64 hex chars) to prevent accidental
 * private-key exposure in error messages. This also redacts order digests and
 * tx hashes that share the same format — an acceptable trade-off for safety.
 */
function redactSecrets(text: string): string {
  return text.replace(/0x[0-9a-fA-F]{64}/g, '0x[REDACTED]');
}

/**
 * Error thrown when a tool execution fails within the MCP server.
 * Wraps SDK or network errors with actionable context for the LLM.
 */
export class ToolExecutionError extends Error {
  constructor(
    readonly toolName: string,
    message: string,
    readonly cause?: unknown,
  ) {
    const causeMsg =
      cause instanceof Error ? `: ${redactSecrets(cause.message)}` : '';
    super(`[${toolName}] ${message}${causeMsg}`);
    this.name = 'ToolExecutionError';
  }
}
