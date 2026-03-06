import { toPrintableObject } from '@nadohq/client';

/** Serialize any SDK result to LLM-friendly JSON. */
export function toJsonContent(data: unknown): string {
  return JSON.stringify(toPrintableObject(data), null, 2);
}
