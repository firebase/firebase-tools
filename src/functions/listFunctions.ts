import Table = require("cli-table");
import * as backend from "../deploy/functions/backend";
import { logger } from "../logger";
import { previews } from "../previews";
import * as args from "../deploy/functions/args";

/**
 * Lists all functions in the Firebase project
 * @param context the Context of the project
 * @returns mapping that contains a list of functions under the 'functions' key
 */
export async function listFunctions(
  context: args.Context
): Promise<{ functions: backend.FunctionSpec[] }> {
  const bkend = await backend.existingBackend(context, true);
  const functionSpecs = previews.functionsv2
    ? bkend.cloudFunctions
    : bkend.cloudFunctions.filter((fn) => fn.platform === "gcfv1");
  functionSpecs.sort((fn1, fn2) => {
    if (fn1.entryPoint > fn2.entryPoint) {
      return 1;
    }
    if (fn1.entryPoint < fn2.entryPoint) {
      return -1;
    }
    return 0;
  });
  const table = previews.functionsv2
    ? new Table({
        head: ["Function", "Version", "Trigger", "Location", "Memory", "Runtime"],
        style: { head: ["yellow"] },
      })
    : new Table({
        head: ["Function", "Trigger", "Location", "Memory", "Runtime"],
        style: { head: ["yellow"] },
      });
  for (const fnSpec of functionSpecs) {
    const trigger = backend.isEventTrigger(fnSpec.trigger) ? fnSpec.trigger.eventType : "https";
    if (previews.functionsv2) {
      table.push([
        fnSpec.entryPoint,
        fnSpec.platform === "gcfv2" ? "v2" : "v1",
        trigger,
        fnSpec.region,
        fnSpec.availableMemoryMb || "---",
        fnSpec.runtime,
      ]);
    } else {
      table.push([
        fnSpec.entryPoint,
        trigger,
        fnSpec.region,
        fnSpec.availableMemoryMb || "---",
        fnSpec.runtime,
      ]);
    }
  }
  logger.info(table.toString());
  return { functions: functionSpecs };
}
