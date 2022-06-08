import apiv1Pkg from "../api.cjs";
const { consoleOrigin } = apiv1Pkg;

export function consoleInstallLink(extVersionRef: string): string {
  return `${consoleOrigin}/project/_/extensions/install?ref=${extVersionRef}`;
}
