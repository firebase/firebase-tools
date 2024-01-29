/**
 * Ensures than an only string is modified so that it will enclude a function
 * in its target. This is useful for making sure that an SSR function is included
 * with a web framework, or that a traditional hosting site includes its pinned
 * functions
 * @param only original only string
 * @param codebaseOrFunction codebase or function ID
 * @return new only string
 */
export function ensureTargeted(only: string, codebaseOrFunction: string): string;

/**
 * Ensures than an only string is modified so that it will enclude a function
 * in its target. This is useful for making sure that an SSR function is included
 * with a web framework, or that a traditional hosting site includes its pinned
 * functions
 * @param only original only string
 * @param codebase codebase id
 * @param functionId function id
 * @return new only string
 */
export function ensureTargeted(only: string, codebase: string, functionId: string): string;

/**
 * Implementation of ensureTargeted.
 */
export function ensureTargeted(
  only: string,
  codebaseOrFunction: string,
  functionId?: string,
): string {
  const parts = only.split(",");
  if (parts.includes("functions")) {
    return only;
  }

  let newTarget = `functions:${codebaseOrFunction}`;
  if (parts.includes(newTarget)) {
    return only;
  }
  if (functionId) {
    newTarget = `${newTarget}:${functionId}`;
    if (parts.includes(newTarget)) {
      return only;
    }
  }

  return `${only},${newTarget}`;
}
