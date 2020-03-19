import * as Configstore from "configstore";

import * as logger from "./logger";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkg = require("../package.json");

export const configstore = new Configstore(pkg.name);
