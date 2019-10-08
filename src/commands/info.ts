import * as clc from "cli-color";
/* tslint:disable */
const envinfo = require("envinfo");
/* tslint:enable */
import * as logger from "../logger";

import * as Command from "../command";

export default new Command("info")
  .description("Prints debugging information about the environment")
  .action(async () => {
    logger.info(clc.bold.white("\nEnvironment Info"));
    const info = await envinfo.run(
      {
        System: ["OS", "CPU"],
        Binaries: ["Node", "Yarn", "npm"],
        Browsers: ["Chrome", "Edge", "Firefox", "Safari"],
        npmGlobalPackages: ["firebase"],
      },
      {
        showNotFound: true,
        duplicates: true,
        fullTree: true,
      }
    );
    logger.info(clc.bold.white(info));
  });
