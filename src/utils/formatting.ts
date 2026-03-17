import { toPrintableObject } from '@nadohq/client';

/** Serialize any SDK result to LLM-friendly JSON. */
export function toJsonContent(data: unknown): string {
  return JSON.stringify(toPrintableObject(data), null, 2);
}

/** Format an array of product IDs for display in messages, e.g. `[1, 2, 3]`. */
export function fmtProductIds(productIds: number[]): string {
  return `[${productIds.join(', ')}]`;
}
