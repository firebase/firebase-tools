/**
 * Whether the given string starts with http:// or https://
 */
export function isUrl(url: string): boolean {
  return /^https?:\/\//.test(url);
}
