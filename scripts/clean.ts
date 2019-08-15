import { removeSync } from "fs-extra";
import { resolve } from "path";

removeSync(`${resolve(__dirname, "..", "lib")}`);
