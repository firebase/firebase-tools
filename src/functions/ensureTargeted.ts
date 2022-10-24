/**
 * Ensures than an only string is modified so that it will enclude a function
 * in its target. This is useful for making sure that an SSR function is included
 * with a web framework, or that a traditional hosting site includes its pinned
 * functions
 * @param only original only string
 * @param id function ID
 * @param codebase function codebase
 * @return new only string
 */
export function ensureTargeted(only: string, codebase: string, id?: string): string {
  const parts = only.split(",");
  if (parts.includes("functions")) {
    return only;
  }

  let newTarget = `functions:${codebase}`;
  if (parts.includes(newTarget)) {
    return only;
  }
  if (id) {
    newTarget = `${newTarget}:${id}`;
    if (parts.includes(newTarget)) {
      return only;
    }
  }

  return `${only},${newTarget}`;
}
