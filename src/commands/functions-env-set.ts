import * as clc from "cli-color";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

import { Command } from "../command";
import { logger } from "../logger";
import { requirePermissions } from "../requirePermissions";
import * as fenv from "../functions/env";
import * as getProjectId from "../getProjectId";
import * as utils from "../utils";

export default new Command("functions:env:set [values...]")
  .description("set environment variables, completely replacing the existing set")
  .option("--file <envFile>", "path to file with environment variables in .env format.")
  .before(requirePermissions, [
    "firebase.envstores.create",
    "firebase.envstores.delete",
    "firebase.envstores.update",
  ])
  .action(async (args: string[], options: any) => {
    if (!options.file && !args.length) {
      return utils.reject("Must supply at least one key/value pair, e.g. " + clc.bold("FOO=bar"));
    }
    let setEnvs: Record<string, string>;
    if (options.file) {
      const buf = fs.readFileSync(path.resolve(options.file), "utf8");
      setEnvs = dotenv.parse(buf.toString().trim());
    } else {
      setEnvs = fenv.parseKvArgs(args);
    }
    const projectId = getProjectId(options);
    const envs = await fenv.setEnvs(projectId, setEnvs);
    logger.info(fenv.formatEnv(envs));
    return envs;
  });
