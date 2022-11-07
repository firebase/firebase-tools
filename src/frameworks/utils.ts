import RE2 from "re2";

/**
 * Whether the given regex is supported by RE2. If it is firebase.json can use it,
 * otherwise the framework server will handle it.
 */
export function supportsFrameworkRegex(regex: string): boolean {
  try {
    new RE2(regex);

    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Wheter the given URL is an external URL.
 */
export function isThirdPartyUrl(url: string): boolean {
  return url.includes("http");
}
