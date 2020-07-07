import * as Configstore from "configstore";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkg = require("../package.json");

export const configstore = new Configstore(pkg.name);
