import * as Configstore from "configstore";

import * as logger from "./logger";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkg = require("../package.json");

class CLIConfigstore extends Configstore {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(pkgName: string, ...args: any[]) {
    super(pkgName, ...args);
  }

  del(key: string): void {
    const e = new Error("[configstore] `del` method is deprecated - use `delete`");
    logger.debug(e.stack);
    return this.delete(key);
  }
}

// Init a Configstore instance with an unique ID eg. package name
// and optionally some default values
export const configstore = new CLIConfigstore(pkg.name);
