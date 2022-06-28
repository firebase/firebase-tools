/**
 * Copyright (c) 2022 Google LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

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

import Table = require("cli-table");
import * as fs from "fs";
import util = require("util");
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
  .description("get a Firebase project's Remote Config template")
  .option("-v, --version-number <versionNumber>", "grabs the specified version of the template")
  .option(
    "-o, --output [filename]",
    "write config output to a filename (if omitted, will use the default file path)"
  )
  .before(requireAuth)
  .before(requirePermissions, ["cloudconfig.configs.get"])
  .action(async (options: Options) => {
    utils.assertIsStringOrUndefined(options.versionNumber);
    const template: RemoteConfigTemplate = await rcGet.getTemplate(
      needProjectId(options),
      checkValidOptionalNumber(options.versionNumber)
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
