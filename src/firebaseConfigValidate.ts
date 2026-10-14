// Note: Upgraded ajv from 6 to 8 as we upgraded from Typescript 3
import { ValidateFunction, ErrorObject } from "ajv";
import * as fs from "fs";
import * as path from "path";
import { Ajv } from "ajv";
import addFormats from "ajv-formats";

// We need to allow union types becuase typescript-json-schema generates them sometimes.
const ajv = new Ajv({ allowUnionTypes: true });
addFormats(ajv);
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
      "utf-8",
    );
    const schema = JSON.parse(schemaStr);

    _VALIDATOR = ajv.compile(schema);
  }

  return _VALIDATOR!;
}

export function getErrorMessage(e: ErrorObject) {
  if (e.keyword === "additionalProperties") {
    return `Object "${e.instancePath}" in "firebase.json" has unknown property: ${JSON.stringify(
      e.params,
    )}`;
  } else if (e.keyword === "required") {
    return `Object "${
      e.instancePath
    }" in "firebase.json" is missing required property: ${JSON.stringify(e.params)}`;
  } else {
    return `Field "${e.instancePath}" in "firebase.json" is possibly invalid: ${e.message}`;
  }
}
