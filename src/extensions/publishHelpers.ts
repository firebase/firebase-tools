import { consoleOrigin } from "../api.cjs";

export function consoleInstallLink(extVersionRef: string): string {
  return `${consoleOrigin}/project/_/extensions/install?ref=${extVersionRef}`;
}
