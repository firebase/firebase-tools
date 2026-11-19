import * as rcGet from "../remoteconfig/get";
import { Command } from "../command";
import { requireAuth } from "../requireAuth";
import { logger } from "../logger";
import { RemoteConfigTemplate } from "../remoteconfig/interfaces";
import { needProjectId } from "../projectUtils";
import { requirePermissions } from "../requirePermissions";
import { parseTemplateForTable } from "../remoteconfig/get";
import { Options } from "../options";
import * as utils from "../utils";

import * as Table from "cli-table3";
import * as fs from "fs";
import * as util from "util";
import { FirebaseError } from "../error";

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
  .description(
    "get a Firebase project's Remote Config template (prints a summary table of the latest version by default)",
  )
  .option(
    "-v, --version-number <versionNumber>",
    "get the specified version of the template (default: the latest published version)",
  )
  .option(
    "-o, --output [filename]",
    "write the template as JSON to a file instead of printing a summary table " +
      "(if no filename is given, uses remoteconfig.template from firebase.json)",
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
        filename = options.config?.src?.remoteconfig?.template;
        if (!filename) {
          throw new FirebaseError(
            "No output filename provided and no default template path is configured. " +
              "Pass a filename (e.g. `--output remoteconfig.template.json`) or set " +
              '"remoteconfig": { "template": "<file>" } in firebase.json.',
          );
        }
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
