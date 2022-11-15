/**
 * Whether the given string is a URL.
 */
export function isUrl(url: string): boolean {
  return url.startsWith("http");
}
