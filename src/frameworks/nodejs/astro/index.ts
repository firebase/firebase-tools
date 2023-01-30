import {
  SupportLevel,
} from "../..";
import { NodeJS } from "..";
import { React } from "../react";
import { Svelte } from "../svelte";

import {
    memoize,
    webFramework, 
    BuildTarget,
    FirebaseHostingOptions
} from "../../utils";

@webFramework({
  name: "Astro",
  analyticsKey: "astro",
  support: SupportLevel.Experimental,
  requiredFiles: ["astro.config.{mjs,cjs,js,ts}"],
  dependencies: ["astro"],
  parent: NodeJS,
  override: [Svelte, React, /* Preact, Vue, SolidJS, Lit, Alpine */],
})
export class Astro {

  public static async initialize(sourceDir: string, options: any) {
    return new Astro(sourceDir, options);
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
