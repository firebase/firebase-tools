import { adapterBuild } from "@apphosting/build";

export async function localBuild(projectRoot: string, framework: string): Promise<string> {
  return await adapterBuild(projectRoot, framework);
}
