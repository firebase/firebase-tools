import {
  SupportLevel,
} from "..";

import {
    memoize,
    webFramework, 
    BuildTarget,
    FirebaseHostingOptions
} from "../utils";

@webFramework({
  name: "Node.js",
  analyticsKey: "node",
  support: SupportLevel.Experimental,
  requiredFiles: ["package.json"],
})
export class NodeJS {

  public static async initialize(sourceDir: string, options: any) {
    return new NodeJS(sourceDir, options);
  }

  private constructor(
    public readonly sourceDir: string,
    public readonly options: any,
  ) {}

  public async build() {
  }

  public async generateFilesystemAPI(target: BuildTarget, options: FirebaseHostingOptions) {
    throw new Error(`Build target ${target} not implemented in NodeJS adapter.`);
  }

  @memoize("sourceDir", "options") public async wantsBackend() {
    return false;
  }

}
