import BigNumber from 'bignumber.js';

/**
 * JSON.stringify replacer that converts BigNumber / BigDecimal instances to
 * human-readable fixed-point strings so LLMs can reason about numeric values.
 */
export function bigDecimalReplacer(_key: string, value: unknown): unknown {
  if (BigNumber.isBigNumber(value)) {
    return value.toFixed();
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  return value;
}

/** Convenience wrapper: serialize any SDK result to LLM-friendly JSON. */
export function toJsonContent(data: unknown): string {
  return JSON.stringify(data, bigDecimalReplacer, 2);
}
