import { ToolExecutionError } from './errors';
import { toJsonContent } from './formatting';

/**
 * Wraps an async tool handler: serializes the result to JSON on success,
 * or throws a {@link ToolExecutionError} on failure.
 */
export async function handleToolRequest<T>(
  toolName: string,
  errorMessage: string,
  fn: () => Promise<T>,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  try {
    const result = await fn();
    return {
      content: [{ type: 'text' as const, text: toJsonContent(result) }],
    };
  } catch (err) {
    throw new ToolExecutionError(toolName, errorMessage, err);
  }
}
