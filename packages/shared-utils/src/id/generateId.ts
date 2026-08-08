import { randomUUID } from 'crypto';

/**
 * Generate a cryptographically random UUID v4.
 */
export function generateId(): string {
  return randomUUID();
}
