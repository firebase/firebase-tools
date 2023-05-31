import { FileSystem, Runtime, RuntimeMatch } from "../types";

export class NodejsRuntime implements Runtime {
  match(fs: FileSystem): Promise<RuntimeMatch | null> {
    console.log(fs);
    throw new Error("Method not implemented.");
  }
}
