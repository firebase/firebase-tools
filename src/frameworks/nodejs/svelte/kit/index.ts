import {
  SupportLevel,
} from "../../..";
import { Svelte } from "..";

import {
    memoize,
    webFramework, 
    BuildTarget,
    FirebaseHostingOptions
} from "../../../utils";

@webFramework({
  name: "SvelteKit",
  analyticsKey: "svelte",
  support: SupportLevel.Experimental,
  dependencies: ["@sveltejs/kit"],
  parent: Svelte,
})
export class SvelteKit {

  public static async initialize(sourceDir: string, options: any) {
    return new SvelteKit(sourceDir, options);
  }

  private constructor(
    public readonly sourceDir: string,
    public readonly options: any,
  ) {}

  public async build() {
  }

  public async generateFilesystemAPI(target: BuildTarget, options: FirebaseHostingOptions) {
    throw new Error(`Build target ${target} not implemented in SvelteKit adapter.`);
  }

  @memoize("sourceDir", "options") public async wantsBackend() {
    return false;
  }

}
