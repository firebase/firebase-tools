import type { Header, Redirect, Rewrite } from "next/dist/lib/load-custom-routes";
import type { Manifest, RoutesManifestRewrite } from "./interfaces";
import { isUrl } from "../utils";
import type { MiddlewareManifest } from "next/dist/build/webpack/plugins/middleware-plugin";

/**
 * Whether the given path has a regex or not.
 * According to the Next.js documentation:
 * ```md
 *  To match a regex path you can wrap the regex in parentheses
 *  after a parameter, for example /post/:slug(\\d{1,}) will match /post/123
 *  but not /post/abc.
 * ```
 * See: https://nextjs.org/docs/api-reference/next.config.js/redirects#regex-path-matching
 */
export function pathHasRegex(path: string): boolean {
  // finds parentheses that are not preceded by double backslashes
  return /(?<!\\)\(/.test(path);
}

/**
 * Remove escaping from characters used for Regex patch matching that Next.js
 * requires. As Firebase Hosting does not require escaping for those charachters,
 * we remove them.
 *
 * According to the Next.js documentation:
 * ```md
 * The following characters (, ), {, }, :, *, +, ? are used for regex path
 * matching, so when used in the source as non-special values they must be
 * escaped by adding \\ before them.
 * ```
 *
 * See: https://nextjs.org/docs/api-reference/next.config.js/rewrites#regex-path-matching
 */
export function cleanEscapedChars(path: string): string {
  return path.replace(/\\([(){}:+?*])/g, (a, b: string) => b);
}

/**
 * Whether a Next.js rewrite is supported by `firebase.json`.
 *
 * See: https://firebase.google.com/docs/hosting/full-config#rewrites
 *
 * Next.js unsupported rewrites includes:
 * - Rewrites with the `has` property that is used by Next.js for Header,
 *   Cookie, and Query Matching.
 *     - https://nextjs.org/docs/api-reference/next.config.js/rewrites#header-cookie-and-query-matching
 *
 * - Rewrites using regex for path matching.
 *     - https://nextjs.org/docs/api-reference/next.config.js/rewrites#regex-path-matching
 *
 * - Rewrites to external URLs
 */
export function isRewriteSupportedByHosting(rewrite: Rewrite): boolean {
  return !("has" in rewrite || pathHasRegex(rewrite.source) || isUrl(rewrite.destination));
}

/**
 * Whether a Next.js redirect is supported by `firebase.json`.
 *
 * See: https://firebase.google.com/docs/hosting/full-config#redirects
 *
 * Next.js unsupported redirects includes:
 * - Redirects with the `has` property that is used by Next.js for Header,
 *   Cookie, and Query Matching.
 *     - https://nextjs.org/docs/api-reference/next.config.js/redirects#header-cookie-and-query-matching
 *
 * - Redirects using regex for path matching.
 *     - https://nextjs.org/docs/api-reference/next.config.js/redirects#regex-path-matching
 *
 * - Next.js internal redirects
 */
export function isRedirectSupportedByHosting(redirect: Redirect): boolean {
  return !("has" in redirect || pathHasRegex(redirect.source) || "internal" in redirect);
}

/**
 * Whether a Next.js custom header is supported by `firebase.json`.
 *
 * See: https://firebase.google.com/docs/hosting/full-config#headers
 *
 * Next.js unsupported headers includes:
 * - Custom header with the `has` property that is used by Next.js for Header,
 *   Cookie, and Query Matching.
 *     - https://nextjs.org/docs/api-reference/next.config.js/headers#header-cookie-and-query-matching
 *
 * - Custom header using regex for path matching.
 *     - https://nextjs.org/docs/api-reference/next.config.js/headers#regex-path-matching
 */
export function isHeaderSupportedByHosting(header: Header): boolean {
  return !("has" in header || pathHasRegex(header.source));
}

/**
 * Get which Next.js rewrites will be used before checking supported items individually.
 *
 * Next.js rewrites can be arrays or objects:
 * - For arrays, all supported items can be used.
 * - For objects only `beforeFiles` can be used.
 *
 * See: https://nextjs.org/docs/api-reference/next.config.js/rewrites
 */
export function getNextjsRewritesToUse(
  nextJsRewrites: Manifest["rewrites"]
): RoutesManifestRewrite[] {
  if (Array.isArray(nextJsRewrites)) {
    return nextJsRewrites;
  }

  if (nextJsRewrites?.beforeFiles) {
    return nextJsRewrites.beforeFiles;
  }

  return [];
}

/**
 * Whether Next.js middleware is being used
 */
export function isUsingMiddleware(middleware: MiddlewareManifest["middleware"]): boolean {
  return Object.keys(middleware).length > 0;
}
