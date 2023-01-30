import {
  SupportLevel,
} from "../..";
import { NodeJS } from "..";

import {
    memoize,
    webFramework, 
    BuildTarget,
    FirebaseHostingOptions
} from "../../utils";

@webFramework({
  name: "Vite",
  analyticsKey: "vite",
  support: SupportLevel.Experimental,
  dependencies: ["vite"],
  parent: NodeJS,
  optionalFiles: ["vite.config.{ts,js}"],
})
export class Vite {

  public static async initialize(sourceDir: string, options: any) {
    return new Vite(sourceDir, options);
  }

  private constructor(
    public readonly sourceDir: string,
    public readonly options: any,
  ) {}

  public async build() {
  }

  public async generateFilesystemAPI(target: BuildTarget, options: FirebaseHostingOptions) {
    throw new Error(`Build target ${target} not implemented in Vite adapter.`);
  }

  @memoize("sourceDir", "options") public async wantsBackend() {
    return false;
  }

}
