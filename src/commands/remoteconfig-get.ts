import * as rcGet from "../remoteconfig/get.js";
import { Command } from "../command.js";
import { requireAuth } from "../requireAuth.js";
import { logger } from "../logger.js";
import { RemoteConfigTemplate } from "../remoteconfig/interfaces.js";
import { needProjectId } from "../projectUtils.js";
import { requirePermissions } from "../requirePermissions.js";
import { parseTemplateForTable } from "../remoteconfig/get.js";
import { Options } from "../options.js";
import * as utils from "../utils.js";
import * as fs from "fs";
import * as util from "util";
import { FirebaseError } from "../error.js";
import Table from "cli-table";

const tableHead = ["Entry Name", "Value"];

// Creates a maximum limit of 50 names for each entry
const MAX_DISPLAY_ITEMS = 20;

function checkValidOptionalNumber(versionNumber?: string): string | undefined {
  if (!versionNumber || typeof Number(versionNumber) === "number") {
    return versionNumber;
  }
  throw new FirebaseError(`Could not interpret "${versionNumber}" as a valid number.`);
}

export const command = new Command("remoteconfig:get")
  .description("get a Firebase project's Remote Config template")
  .option("-v, --version-number <versionNumber>", "grabs the specified version of the template")
  .option(
    "-o, --output [filename]",
    "write config output to a filename (if omitted, will use the default file path)",
  )
  .before(requireAuth)
  .before(requirePermissions, ["cloudconfig.configs.get"])
  .action(async (options: Options) => {
    utils.assertIsStringOrUndefined(options.versionNumber);
    const template: RemoteConfigTemplate = await rcGet.getTemplate(
      needProjectId(options),
      checkValidOptionalNumber(options.versionNumber),
    );
    const table = new Table({ head: tableHead, style: { head: ["green"] } });
    if (template.conditions) {
      let updatedConditions = template.conditions
        .map((condition) => condition.name)
        .slice(0, MAX_DISPLAY_ITEMS)
        .join("\n");
      if (template.conditions.length > MAX_DISPLAY_ITEMS) {
        updatedConditions += "+more... \n";
      }
      table.push(["conditions", updatedConditions]);
    }
    const updatedParameters = parseTemplateForTable(template.parameters);
    table.push(["parameters", updatedParameters]);

    const updatedParameterGroups = parseTemplateForTable(template.parameterGroups);
    table.push(["parameterGroups", updatedParameterGroups]);
    table.push(["version", util.inspect(template.version, { showHidden: false, depth: null })]);

    // Firebase remoteconfig:get --output implementation
    const fileOut = !!options.output;
    if (fileOut) {
      const shouldUseDefaultFilename = options.output === true || options.output === "";

      let filename = undefined;
      if (shouldUseDefaultFilename) {
        filename = options.config.src.remoteconfig!.template;
      } else {
        utils.assertIsString(options.output);
        filename = options.output;
      }

      const outTemplate = { ...template };
      delete outTemplate.version;
      fs.writeFileSync(filename, JSON.stringify(outTemplate, null, 2));
    } else {
      logger.info(table.toString());
    }
    return template;
  });
