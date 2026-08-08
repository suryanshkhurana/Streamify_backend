/**
 * Promise-based delay.
 * @param ms - Duration in milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
