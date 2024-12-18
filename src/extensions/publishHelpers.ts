import { consoleOrigin } from "../api.js";

export function consoleInstallLink(extVersionRef: string): string {
  return `${consoleOrigin()}/project/_/extensions/install?ref=${extVersionRef}`;
}
