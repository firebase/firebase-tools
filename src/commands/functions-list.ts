import { Command } from "../command";
import { FirebaseError } from "../error";
import * as backend from "../deploy/functions/backend";
import { previews } from "../previews";
import * as args from "../deploy/functions/args";
import * as utils from "../utils";
import { needProjectId } from "../projectUtils";
import { RC } from "../rc";
import { Options } from "../options";

import * as gcf from "../gcp/cloudfunctions";
import * as gcfV2 from "../gcp/cloudfunctionsv2";
import { requirePermissions } from "../requirePermissions";

export default new Command("functions:list")
  .option("-r, --regions", "comma-separated list of regions")
  .before(requirePermissions, ["cloudfunctions.functions.list"])
  .action(async (options: { project?: string; projectId?: string; rc: RC; } & Options) => {
    const projectId = needProjectId(options);

    // const fns = await gcf.listFunctions(projectId, "-");
    // console.log(fns);
    // return fns;
    
    const context = {
      projectId: needProjectId(options),
    } as args.Context;
    
    const bkend = await backend.existingBackend(context, true);
    const functions = previews.functionsv2 ? bkend.cloudFunctions : bkend.cloudFunctions.filter((fn) => fn.platform === "gcfv1");

    console.log(functions);
    
    const allFunctions = [];
    for (const fn of functions) {
      const fnLine = [];
      fnLine.push(fn.entryPoint);
      if (previews.functionsv2) {
        fnLine.push(fn.platform);
      }
      allFunctions.push(fnLine.join(' '));
    }

    return allFunctions.join('\n');
  });
