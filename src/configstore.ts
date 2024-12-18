import Configstore from "configstore";
import pkg from "../package.json" with { type: "json" };

// eslint-disable-next-line @typescript-eslint/no-var-requires
export const configstore = new Configstore(pkg.name);
