/**
 * Convert a string into a URL-safe slug.
 * e.g. "Hello World!" → "hello-world"
 */
export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[^a-z0-9\s-]/g, '')   // remove non-alphanumeric
    .replace(/[\s_]+/g, '-')         // spaces/underscores → hyphen
    .replace(/-+/g, '-')             // collapse multiple hyphens
    .replace(/^-+|-+$/g, '');        // trim leading/trailing hyphens
}
