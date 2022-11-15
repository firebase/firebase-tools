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
  for (let i = 0; i < path.length; i++) {
    if (path[i] === "(" && path[i - 1] !== "\\") {
      return true;
    }
  }

  return false;
}

/**
 * Remove double backslashes from a string
 */
export function cleanEscapedChars(path: string): string {
  return path.replaceAll("\\", "");
}
