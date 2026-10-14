/**
 * Adapted from:
 *  - https://datatracker.ietf.org/doc/html/rfc5987
 *  - https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURIComponent#examples
 *
 * @returns RFC5987 encoded string
 */
export function encodeRFC5987(str: string): string {
  return encodeURIComponent(str)
    .replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/%(7C|60|5E)/g, (str, hex) => String.fromCharCode(parseInt(hex, 16)));
}
