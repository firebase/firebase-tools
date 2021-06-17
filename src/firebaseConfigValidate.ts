// Note: we are using ajv version 6.x because it's compatible with TypeScript
// 3.x, if we upgrade the TS version in this project we can upgrade ajv as well.
import { ValidateFunction } from "ajv";
import * as fs from "fs";
import * as path from "path";

const Ajv = require("ajv");

const ajv = new Ajv();
let _VALIDATOR: ValidateFunction | undefined = undefined;

/**
 * Lazily load the 'schema/firebase-config.json' file and return an AJV validation
 * function. By doing this lazily we don't impose this I/O cost on those using
 * the CLI as a Node module.
 */
export function getValidator(): ValidateFunction {
  if (!_VALIDATOR) {
    const schemaStr = fs.readFileSync(
      path.resolve(__dirname, "../schema/firebase-config.json"),
      "UTF-8"
    );
    const schema = JSON.parse(schemaStr);

    _VALIDATOR = ajv.compile(schema);
  }

  return _VALIDATOR!;
}
