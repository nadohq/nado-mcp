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
    const causeMsg = cause instanceof Error ? `: ${cause.message}` : '';
    super(`[${toolName}] ${message}${causeMsg}`);
    this.name = 'ToolExecutionError';
  }
}
