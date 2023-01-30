import {
  SupportLevel,
} from "../..";
import { NodeJS } from "../../nodejs";

import {
    memoize,
    webFramework, 
    BuildTarget,
    FirebaseHostingOptions
} from "../../utils";
import { Vite } from "../vite";

@webFramework({
  name: "Svelte",
  analyticsKey: "svelte",
  support: SupportLevel.Experimental,
  optionalFiles: ["svelte.config.js"],
  dependencies: ["svelte"],
  parent: NodeJS,
})
@webFramework({
  name: "Svelte",
  analyticsKey: "svelte",
  support: SupportLevel.Experimental,
  dependencies: ["svelte"],
  optionalFiles: ["svelte.config.js"],
  vitePlugins: ["vite-plugin-svelte"],
  parent: Vite,
})
export class Svelte {

  public static async initialize(sourceDir: string, options: any) {
    return new Svelte(sourceDir, options);
  }

  private constructor(
    public readonly sourceDir: string,
    public readonly options: any,
  ) {}

  public async build() {
  }

  public async generateFilesystemAPI(target: BuildTarget, options: FirebaseHostingOptions) {
    throw new Error(`Build target ${target} not implemented in Svelte adapter.`);
  }

  @memoize("sourceDir", "options") public async wantsBackend() {
    return false;
  }

}
