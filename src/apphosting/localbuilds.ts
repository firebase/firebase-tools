import { localApphostingBuild } from "@apphosting/build";

export async function localBuild(projectRoot: string, framework: string): Promise<string> {
  return await localApphostingBuild(projectRoot, framework);
}
