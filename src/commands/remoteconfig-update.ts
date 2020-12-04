import * as rcUpdate from "../remoteconfig/update";
import { Command } from "../command";
import { requireAuth } from "../requireAuth";
import * as logger from "../logger";
import { RemoteConfigTemplate } from "../remoteconfig/interfaces";
import getProjectId = require("../getProjectId");
import { requirePermissions } from "../requirePermissions";
import { parseTemplateForTable } from "../remoteconfig/common";

import Table = require("cli-table");
import * as fs from "fs";
import util = require("util");

const tableHead = ["Entry Name", "Value"];

// Creates a maximum limit of 50 names for each entry
const MAX_DISPLAY_ITEMS = 20;

module.exports = new Command("remoteconfig:update")
  .description("update a Firebase project's Remote Config template")
  .option("--validate-only", "if set, the server will only attempt to validate the RemoteConfig")
  .option("-i, --input [filename]", "read config from a filename")
  .before(requireAuth)
  .before(requirePermissions, ["cloudconfig.configs.update"])
  .action(async (options) => {
    const validateOnly = Boolean(options.validateOnly);

    const filename = options.input;
    if (!fs.existsSync(filename)) {
      throw new Error(`File ${filename} does not exist. `);
    }
    const payload = fs.readFileSync(filename, "utf8");

    const template: RemoteConfigTemplate = await rcUpdate.updateTemplate(
      getProjectId(options),
      payload,
      validateOnly
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
    if (!validateOnly)
      table.push(["version", util.inspect(template.version, { showHidden: false, depth: null })]);
    logger.info(table.toString());
  });
