/**
 * Return a new object containing only the specified keys.
 */
export function pick<T extends object, K extends keyof T>(
  obj: T,
  keys: K[],
): Pick<T, K> {
  return keys.reduce(
    (acc, key) => {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        acc[key] = obj[key];
      }
      return acc;
    },
    {} as Pick<T, K>,
  );
}

/**
 * Return a new object with the specified keys removed.
 */
export function omit<T extends object, K extends keyof T>(
  obj: T,
  keys: K[],
): Omit<T, K> {
  const keysSet = new Set<string>(keys as string[]);
  return Object.fromEntries(
    Object.entries(obj).filter(([k]) => !keysSet.has(k)),
  ) as Omit<T, K>;
}
