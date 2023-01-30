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
  name: "React",
  analyticsKey: "react",
  support: SupportLevel.Experimental,
  dependencies: ["react", "react-dom"],
  parent: NodeJS,
})
@webFramework({
  name: "React",
  analyticsKey: "react",
  support: SupportLevel.Experimental,
  dependencies: ["react", "react-dom"],
  vitePlugins: ["vite:react-jsx"],
  parent: Vite,
})
export class React {

  public static async initialize(sourceDir: string, options: any) {
    return new React(sourceDir, options);
  }

  private constructor(
    public readonly sourceDir: string,
    public readonly options: any,
  ) {}

  public async build() {
  }

  public async generateFilesystemAPI(target: BuildTarget, options: FirebaseHostingOptions) {
    throw new Error(`Build target ${target} not implemented in React adapter.`);
  }

  @memoize("sourceDir", "options") public async wantsBackend() {
    return false;
  }

}
