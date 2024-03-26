import { consoleOrigin } from "../api";

export function consoleInstallLink(extVersionRef: string): string {
  return `${consoleOrigin()}/project/_/extensions/install?ref=${extVersionRef}`;
}
