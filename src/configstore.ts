import Configstore from "configstore";
import fs from "fs-extra";

const pkg = JSON.parse(fs.readFileSync("../package.json", "utf-8"));

export const configstore = new Configstore(pkg.name);
