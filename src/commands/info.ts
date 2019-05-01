import * as clc from "cli-color";
const envinfo = require("envinfo");
import * as logger from "../logger";

import * as Command from "../command";

export default new Command("info")
  .description("Prints debugging information about the environment")
  .action(() => {
    logger.info(clc.bold.white("Compound Indexes"));
    envinfo
      .run(
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
      )
      .then(logger.info(clc.bold.white()));
  });
