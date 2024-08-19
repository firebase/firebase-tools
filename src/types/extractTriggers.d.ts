/**
 * Extracts trigger definitions from a function file.
 * @param {Object} mod module, usually the result of require(functions/index.js)
 * @param {ParsedTriggerDefinition[]} triggers array of EmulatedTriggerDefinitions to extend (in-place).
 * @param {string=} prefix optional function name prefix, for example when using grouped functions.
 */
import { ParsedTriggerDefinition } from "../emulator/functionsEmulatorShared";

export declare function extractTriggers(
  mod: Array<object>, // eslint-disable-line @typescript-eslint/ban-types
  triggers: ParsedTriggerDefinition[],
  prefix?: string,
): void;
